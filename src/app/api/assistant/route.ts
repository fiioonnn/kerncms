import { revalidatePath } from "next/cache";
import { applyEvent, chatTitle, emptyAssistantTurn, isAttachment, settleTurn, type Attachment, type ServerEvent, type Turn, type UserTurn } from "@/lib/assistant";
import { agentErrorMessage, runAgent } from "@/server/assistant/agent";
import { createChat, findChat, historyFrom, resolveAttachments, saveChatTurns } from "@/server/assistant/chats";
import { assistantFor } from "@/server/assistant/settings";
import { commit, DRAFT_BRANCH, git, withSiteLock } from "@/server/git";
import { RESTART_FILES, restartPreviewFor } from "@/server/preview";
import { getWorkspace } from "@/server/sites";

/*
 * The AI assistant, in the editor and on its own page (/assistant). POST { chatId, message, attachments, page, mode }
 * and read NDJSON events back
 * (the chat id, text deltas, tool steps, done with the committed files). The chat is stored here,
 * so it survives a closed tab. One run per site at a time.
 */

export const maxDuration = 900;

const running = ((globalThis as { __kernAssistantRuns?: Set<string> }).__kernAssistantRuns ??= new Set());

export async function POST(request: Request) {
  const ws = await getWorkspace("viewer");
  const assistant = await assistantFor(ws.user, ws.role);
  if (!assistant) return Response.json({ error: "Der KI-Assistent ist für dich nicht freigeschaltet." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 20_000) : "";
  if (!message) return Response.json({ error: "Keine Nachricht." }, { status: 400 });
  const attachments: Attachment[] = Array.isArray(body?.attachments) ? body.attachments.filter(isAttachment).slice(0, 12) : [];
  const page = body?.page && typeof body.page === "object" ? (body.page as { name?: unknown; path?: unknown; title?: unknown }) : null;
  const mode = body?.mode === "app" ? "app" : "editor";

  let chat = typeof body?.chatId === "string" ? await findChat(ws.site.id, ws.user.id, body.chatId) : null;
  if (typeof body?.chatId === "string" && !chat) return Response.json({ error: "Diesen Chat gibt es nicht mehr." }, { status: 404 });

  if (running.has(ws.site.id)) return Response.json({ error: "Der Assistent arbeitet auf dieser Website gerade schon." }, { status: 409 });
  running.add(ws.site.id);

  let earlier: Turn[];
  let resolved: string;
  try {
    chat ??= await createChat(ws.site.id, ws.user.id, chatTitle(message));
    earlier = chat.turns;
    resolved = await resolveAttachments(ws, attachments);
  } catch (error) {
    running.delete(ws.site.id);
    throw error;
  }
  const { id: chatId, title } = chat;
  const userTurn: UserTurn = { role: "user", content: message, ...(attachments.length ? { attachments } : {}) };
  const history = historyFrom([...earlier, userTurn]);
  // The new message carries the attachments' current content; earlier ones only a note.
  if (resolved) history[history.length - 1] = { role: "user", content: `${history.at(-1)!.content}\n\n${resolved}` };

  const context = [
    `Website: ${ws.site.name} (Live-Branch ${ws.site.branch}${ws.site.liveUrl ? `, ${ws.site.liveUrl}` : ""}).`,
    `Pfad der Seiten-JSON: ${ws.config.pages.path}/<name>.json.`,
    page && typeof page.name === "string"
      ? `Im Editor geöffnet: Seite „${String(page.title ?? page.name)}“ (Datei ${ws.config.pages.path}/${page.name}.json, URL ${String(page.path ?? "")}). „Diese Seite“ meint diese Seite.`
      : "",
    `Angemeldet: ${ws.user.name} (Rolle ${ws.role}${ws.user.isAdmin ? ", Plattform-Admin" : ""}).`,
    `Heute ist ${new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" })}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const summary = message.replace(/\s+/g, " ");
  const commitMessage = `KI-Assistent: ${summary.length > 72 ? `${summary.slice(0, 70)}…` : summary}`;
  /** Files the run saved to the draft so far, and the last commit it made. */
  const saved = new Set<string>();
  let lastCommit: string | null = null;
  const touched = new Set<string>();
  /** Commits what the run has written since the last flush. Before CMS actions and once at the end. */
  const flush = async () => {
    const files = [...touched];
    if (files.length === 0) return;
    lastCommit = await withSiteLock(ws.site.id, () => commit(ws.dir, commitMessage, { name: ws.user.name, email: ws.user.email }, files));
    touched.clear();
    for (const f of files) saved.add(f);
    if (files.some((f) => RESTART_FILES.test(f))) void restartPreviewFor(ws.site.id);
  };
  const tools = { siteId: ws.site.id, dir: ws.dir, site: ws.site, config: ws.config, role: ws.role, touched, flush };
  /** Draft state before the run, to report files that CMS actions saved themselves (page settings, globals, …). */
  const startSha = (await git(ws.dir, ["rev-parse", DRAFT_BRANCH]).catch(() => "")).trim();
  const encoder = new TextEncoder();
  let answer = emptyAssistantTurn();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: ServerEvent) => {
        answer = applyEvent(answer, event);
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };
      emit({ type: "chat", id: chatId, title });
      // Saved right away, so the question is there even if the run is cut off.
      await saveChatTurns(chatId, [...earlier, userTurn]).catch((error) => console.error("[kern assistant] chat", error));
      try {
        await runAgent({ ...assistant, history, mode, context, tools, signal: request.signal, emit });
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("[kern assistant]", error);
          emit({ type: "error", message: agentErrorMessage(error) });
        }
      } finally {
        // Whatever was changed, even by a run that failed or was stopped, is saved to the draft.
        try {
          await flush();
          if (saved.size > 0) {
            try {
              revalidatePath("/", "layout");
            } catch {
              // The response is already streaming; the client refreshes itself on "done".
            }
          }
        } catch (error) {
          console.error("[kern assistant] commit", error);
          emit({ type: "error", message: "Die Änderungen konnten nicht gespeichert werden. Sie liegen ungespeichert im Entwurf." });
        }
        const changed = startSha
          ? (await git(ws.dir, ["diff", "--name-only", startSha, DRAFT_BRANCH]).catch(() => "")).split("\n").filter(Boolean)
          : [];
        const files = [...new Set([...saved, ...touched, ...changed])].sort();
        const sha = lastCommit;
        if (request.signal.aborted && !answer.error) answer = { ...answer, error: "Angehalten." };
        emit({ type: "done", files, commit: sha });
        await saveChatTurns(chatId, [...earlier, userTurn, settleTurn(answer)]).catch((error) => console.error("[kern assistant] chat", error));
        running.delete(ws.site.id);
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}

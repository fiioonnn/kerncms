import { revalidatePath } from "next/cache";
import { agentErrorMessage, runAgent, type AgentEvent, type ChatMessage } from "@/server/assistant/agent";
import { assistantFor } from "@/server/assistant/settings";
import { commit, withSiteLock } from "@/server/git";
import { RESTART_FILES, restartPreviewFor } from "@/server/preview";
import { getWorkspace } from "@/server/sites";

/*
 * The editor's AI assistant. POST { messages, page } and read NDJSON events back
 * (text deltas, tool steps, done with the committed files). One run per site at a time.
 */

export const maxDuration = 900;

const running = ((globalThis as { __kernAssistantRuns?: Set<string> }).__kernAssistantRuns ??= new Set());

function cleanHistory(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const messages = input
    .filter((m): m is ChatMessage => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "")
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 20_000) }));
  // Must start with the person and end with their new message.
  while (messages[0] && messages[0].role !== "user") messages.shift();
  return messages.at(-1)?.role === "user" ? messages : null;
}

export async function POST(request: Request) {
  const ws = await getWorkspace("viewer");
  const assistant = await assistantFor(ws.user, ws.role);
  if (!assistant) return Response.json({ error: "Der KI-Assistent ist für dich nicht freigeschaltet." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const history = cleanHistory(body?.messages);
  if (!history) return Response.json({ error: "Keine Nachricht." }, { status: 400 });
  const page = body?.page && typeof body.page === "object" ? (body.page as { name?: unknown; path?: unknown; title?: unknown }) : null;

  if (running.has(ws.site.id)) return Response.json({ error: "Der Assistent arbeitet auf dieser Website gerade schon." }, { status: 409 });
  running.add(ws.site.id);

  const context = [
    `Website: ${ws.site.name} (Live-Branch ${ws.site.branch}${ws.site.liveUrl ? `, ${ws.site.liveUrl}` : ""}).`,
    `Pfad der Seiten-JSON: ${ws.config.pages.path}/<name>.json.`,
    page && typeof page.name === "string"
      ? `Im Editor geöffnet: Seite „${String(page.title ?? page.name)}“ (Datei ${ws.config.pages.path}/${page.name}.json, URL ${String(page.path ?? "")}). „Diese Seite“ meint diese Seite.`
      : "",
    `Angemeldet: ${ws.user.name}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const tools = { siteId: ws.site.id, dir: ws.dir, touched: new Set<string>() };
  const lastQuestion = history.at(-1)!.content.replace(/\s+/g, " ").trim();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: AgentEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        await runAgent({ ...assistant, history, context, tools, signal: request.signal, emit });
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("[kern assistant]", error);
          emit({ type: "error", message: agentErrorMessage(error) });
        }
      } finally {
        // Whatever was changed, even by a run that failed or was stopped, is saved to the draft.
        let sha: string | null = null;
        const files = [...tools.touched].sort();
        try {
          if (files.length > 0) {
            const summary = lastQuestion.length > 72 ? `${lastQuestion.slice(0, 70)}…` : lastQuestion;
            sha = await withSiteLock(ws.site.id, () => commit(ws.dir, `KI-Assistent: ${summary}`, { name: ws.user.name, email: ws.user.email }, files));
            if (files.some((f) => RESTART_FILES.test(f))) void restartPreviewFor(ws.site.id);
            try {
              revalidatePath("/", "layout");
            } catch {
              // The response is already streaming; the editor refreshes itself on "done".
            }
          }
        } catch (error) {
          console.error("[kern assistant] commit", error);
          emit({ type: "error", message: "Die Änderungen konnten nicht gespeichert werden. Sie liegen ungespeichert im Entwurf." });
        }
        emit({ type: "done", files, commit: sha });
        running.delete(ws.site.id);
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}

"use client";

import { Fragment, useRef, useState } from "react";
import { Check, CircleAlert, FileCode2, FileText, Globe, LayoutPanelTop, Loader2, Trash2, Type, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import {
  applyEvent,
  attachmentKey,
  emptyAssistantTurn,
  settleTurn,
  type AssistantTurn as AnswerTurn,
  type Attachment,
  type ChatSummary,
  type ServerEvent,
  type Step,
  type Turn,
} from "@/lib/assistant";
import { cn } from "@/lib/utils";
import { deleteAssistantChat, listAssistantChats, loadAssistantChat } from "@/server/actions/assistant-chats";

/* The AI assistant's chat state and the pieces both the editor panel and the /assistant page show. */

/* ---------- Chat state ---------- */

/**
 * Chats with the AI assistant, stored on the server per person and site. `beforeSend` runs first
 * (the editor writes pending edits to disk), `onDone` gets the files the assistant changed.
 */
export function useAssistantChat({
  mode = "editor",
  page = null,
  beforeSend,
  onDone,
}: {
  /** "app": the /assistant page (no page open, data questions first). */
  mode?: "editor" | "app";
  page?: { name: string; title: string; path: string } | null;
  beforeSend?: () => Promise<void>;
  onDone: (files: string[]) => void;
}) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const abort = useRef<AbortController | null>(null);

  const updateLast = (fn: (turn: AnswerTurn) => AnswerTurn) =>
    setTurns((all) => {
      const last = all.at(-1);
      return last?.role === "assistant" ? [...all.slice(0, -1), fn(last)] : all;
    });

  const refreshChats = async () => {
    const result = await listAssistantChats();
    if (result.ok) setChats(result.data);
  };

  const attach = (attachment: Attachment) =>
    setAttachments((all) => (all.some((a) => attachmentKey(a) === attachmentKey(attachment)) ? all : [...all, attachment]));
  const detach = (key: string) => setAttachments((all) => all.filter((a) => attachmentKey(a) !== key));

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const sent = attachments;
    setAttachments([]);
    setTurns((all) => [...all, { role: "user", content, ...(sent.length ? { attachments: sent } : {}) }, emptyAssistantTurn()]);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    let files: string[] = [];
    try {
      await beforeSend?.();
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message: content, attachments: sent, page, mode }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Der Assistent antwortet nicht (${response.status}).`);
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ServerEvent;
          if (event.type === "chat") {
            setChatId(event.id);
            setTitle(event.title);
            continue;
          }
          if (event.type === "done") files = event.files;
          updateLast((turn) => applyEvent(turn, event));
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) updateLast((turn) => ({ ...turn, error: (error as Error).message || "Verbindung unterbrochen." }));
    } finally {
      updateLast((turn) => (controller.signal.aborted && !turn.error ? { ...settleTurn(turn), error: "Angehalten." } : settleTurn(turn)));
      abort.current = null;
      setBusy(false);
      void refreshChats();
      // A stopped run saves its changes on the server too; reload in any case.
      onDone(files);
    }
  };

  const stop = () => abort.current?.abort();

  const newChat = () => {
    if (busy) return;
    setChatId(null);
    setTitle(null);
    setTurns([]);
  };

  const openChat = async (id: string) => {
    if (busy || id === chatId) return;
    setLoading(true);
    const result = await loadAssistantChat(id);
    setLoading(false);
    if (!result.ok) {
      toast.error("Chat nicht geöffnet", { description: result.error });
      void refreshChats();
      return;
    }
    setChatId(result.data.id);
    setTitle(result.data.title);
    setTurns(result.data.turns);
  };

  const removeChat = async (id: string) => {
    if (busy && id === chatId) return;
    setChats((all) => all?.filter((c) => c.id !== id) ?? null);
    const result = await deleteAssistantChat(id);
    if (!result.ok) toast.error("Chat nicht gelöscht", { description: result.error });
    if (id === chatId) newChat();
    void refreshChats();
  };

  return { chatId, title, turns, busy, loading, attachments, chats, send, stop, newChat, openChat, removeChat, refreshChats, attach, detach };
}

export type AssistantChat = ReturnType<typeof useAssistantChat>;

/* ---------- Rendering ---------- */

/** `code` and **bold** inside a line; everything else stays plain text. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
      <code key={i} className="rounded bg-subtle px-1 py-0.5 font-mono text-[13px]">
        {part.slice(1, -1)}
      </code>
    ) : part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function Prose({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2.5 text-[15px] leading-relaxed">
      {blocks.map((block, i) => {
        if (block.startsWith("```")) {
          return (
            <pre key={i} className="overflow-x-auto rounded-lg bg-subtle p-3 font-mono text-[13px] leading-snug">
              {block.replace(/^```\w*\n?/, "").replace(/\n?```$/, "")}
            </pre>
          );
        }
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s/.test(l))) {
          return (
            <ul key={i} className="flex flex-col gap-1 pl-1">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-2.5 size-1 shrink-0 rounded-full bg-muted" />
                  <span>
                    <Inline text={l.replace(/^\s*([-*]|\d+\.)\s/, "")} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            <Inline text={block.replace(/^#+\s*/gm, "")} />
          </p>
        );
      })}
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-sm text-muted">
      {step.status === "running" ? (
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" strokeWidth={1.75} />
      ) : step.status === "ok" ? (
        <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2} />
      ) : (
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" strokeWidth={1.75} />
      )}
      <span className="min-w-0 break-words">
        {step.label}
        {step.detail && <span className="block text-xs text-muted/80">{step.detail}</span>}
      </span>
    </div>
  );
}

export function AssistantTurn({ turn }: { turn: Extract<Turn, { role: "assistant" }> }) {
  const empty = turn.parts.length === 0;
  return (
    <div className="flex flex-col gap-3">
      {turn.parts.map((part, i) =>
        part.kind === "text" ? part.text.trim() && <Prose key={i} text={part.text} /> : <StepRow key={part.step.id} step={part.step} />,
      )}
      {turn.running && empty && (
        <span className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
          Denkt nach…
        </span>
      )}
      {turn.error && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          {turn.error}
        </div>
      )}
      {!turn.running && turn.files.length > 0 && (
        <details className="group rounded-xl border border-border bg-subtle/50 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-medium select-none">
            <FileCode2 className="size-4 text-muted" strokeWidth={1.75} />
            {turn.files.length === 1 ? "1 Datei" : `${turn.files.length} Dateien`} im Entwurf gespeichert
          </summary>
          <ul className="flex flex-col gap-1 border-t border-border px-3 py-2.5 font-mono text-xs text-muted">
            {turn.files.map((f) => (
              <li key={f} className="break-all">
                {f}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export const attachmentIcons: Record<Attachment["kind"], LucideIcon> = { page: FileText, block: LayoutPanelTop, field: Type, global: Globe };

export function AttachmentChip({ attachment, onRemove }: { attachment: Attachment; onRemove?: () => void }) {
  const Icon = attachmentIcons[attachment.kind];
  return (
    <span className="inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-lg border border-border bg-surface pr-1 pl-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted" strokeWidth={1.75} />
      <span className={cn("truncate", !onRemove && "pr-1")}>{attachment.label}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`${attachment.label} entfernen`}
          onClick={onRemove}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted outline-none hover:bg-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="size-3.5" strokeWidth={2} />
        </button>
      )}
    </span>
  );
}

export function since(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "gestern" : `vor ${days} Tagen`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

export function ChatList({ chat, onPick }: { chat: AssistantChat; onPick: () => void }) {
  if (chat.chats === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.75} />
      </div>
    );
  }
  if (chat.chats.length === 0) return <p className="px-4 py-5 text-[15px] text-muted">Noch keine Chats auf dieser Website.</p>;
  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {chat.busy && <li className="px-2 pb-2 text-sm text-muted">Solange der Assistent arbeitet, bleibt der aktuelle Chat offen.</li>}
      {chat.chats.map((c) => {
        const current = c.id === chat.chatId;
        return (
          <li key={c.id} className={cn("group flex items-center gap-1 rounded-lg pr-1", current ? "bg-accent-soft" : "hover:bg-subtle")}>
            <button
              type="button"
              disabled={chat.busy && !current}
              aria-current={current || undefined}
              onClick={() => {
                void chat.openChat(c.id);
                onPick();
              }}
              className="flex min-w-0 flex-1 flex-col rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            >
              <span className="truncate text-[15px] font-medium">{c.title}</span>
              <span className="text-sm text-muted">{since(c.updatedAt)}</span>
            </button>
            <Tooltip label="Chat löschen">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Chat „${c.title}“ löschen`}
                disabled={chat.busy && current}
                onClick={() => void chat.removeChat(c.id)}
                className="size-9 shrink-0 rounded-lg text-muted opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-danger-soft hover:text-danger [@media(hover:none)]:opacity-100 [&_svg]:size-4"
              >
                <Trash2 strokeWidth={1.75} />
              </Button>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

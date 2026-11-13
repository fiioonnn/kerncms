"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { ArrowUp, Check, CircleAlert, FileCode2, Loader2, SquarePen, Sparkles, Square, X } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

/* ---------- Chat state ---------- */

type Step = { id: string; label: string; status: "running" | "ok" | "error"; detail?: string };
type Part = { kind: "text"; text: string } | { kind: "step"; step: Step };
export type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; parts: Part[]; files: string[]; error: string | null; running: boolean };

type ServerEvent =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; label: string }
  | { type: "tool_done"; id: string; ok: boolean; detail?: string }
  | { type: "done"; files: string[]; commit: string | null }
  | { type: "error"; message: string };

const textOf = (turn: Turn) =>
  turn.role === "user"
    ? turn.content
    : turn.parts
        .filter((p): p is Extract<Part, { kind: "text" }> => p.kind === "text")
        .map((p) => p.text)
        .join("")
        .trim();

function applyEvent(turn: Extract<Turn, { role: "assistant" }>, event: ServerEvent): Extract<Turn, { role: "assistant" }> {
  switch (event.type) {
    case "text": {
      const last = turn.parts.at(-1);
      if (last?.kind === "text") return { ...turn, parts: [...turn.parts.slice(0, -1), { kind: "text", text: last.text + event.text }] };
      return { ...turn, parts: [...turn.parts, { kind: "text", text: event.text }] };
    }
    case "tool":
      return { ...turn, parts: [...turn.parts, { kind: "step", step: { id: event.id, label: event.label, status: "running" } }] };
    case "tool_done":
      return {
        ...turn,
        parts: turn.parts.map((p) =>
          p.kind === "step" && p.step.id === event.id ? { kind: "step", step: { ...p.step, status: event.ok ? "ok" : "error", detail: event.detail } } : p,
        ),
      };
    case "error":
      return { ...turn, error: event.message };
    case "done":
      return { ...turn, files: event.files, running: false };
  }
}

/**
 * Chat with the AI assistant. `beforeSend` runs first (the editor writes pending edits to disk),
 * `onDone` gets the files the assistant changed so the editor can reload them.
 */
export function useAssistantChat({
  page,
  beforeSend,
  onDone,
}: {
  page: { name: string; title: string; path: string };
  beforeSend: () => Promise<void>;
  onDone: (files: string[]) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const updateLast = (fn: (turn: Extract<Turn, { role: "assistant" }>) => Extract<Turn, { role: "assistant" }>) =>
    setTurns((all) => {
      const last = all.at(-1);
      return last?.role === "assistant" ? [...all.slice(0, -1), fn(last)] : all;
    });

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...turns, { role: "user", content } as Turn]
      .map((t) => ({ role: t.role, content: textOf(t) }))
      .filter((m) => m.content);
    setTurns((all) => [...all, { role: "user", content }, { role: "assistant", parts: [], files: [], error: null, running: true }]);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    let files: string[] = [];
    try {
      await beforeSend();
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, page }),
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
          if (event.type === "done") files = event.files;
          updateLast((turn) => applyEvent(turn, event));
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) updateLast((turn) => ({ ...turn, error: (error as Error).message || "Verbindung unterbrochen." }));
    } finally {
      updateLast((turn) => ({ ...turn, running: false, parts: turn.parts.map((p) => (p.kind === "step" && p.step.status === "running" ? { kind: "step", step: { ...p.step, status: "error" } } : p)) }));
      abort.current = null;
      setBusy(false);
      // A stopped run saves its changes on the server too; reload in any case.
      onDone(files);
    }
  };

  const stop = () => abort.current?.abort();
  const reset = () => {
    if (!busy) setTurns([]);
  };

  return { turns, busy, send, stop, reset };
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

function Prose({ text }: { text: string }) {
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

function AssistantTurn({ turn }: { turn: Extract<Turn, { role: "assistant" }> }) {
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

const suggestions = [
  "Formuliere die Texte dieser Seite freundlicher.",
  "Mach die Telefonnummer im Footer zu einem Global, das man im CMS ändern kann.",
  "Füge dieser Seite einen Block mit häufigen Fragen hinzu.",
];

function ChatBody({ chat, onClose }: { chat: AssistantChat; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const last = chat.turns.at(-1);
  const lastLength = last ? (last.role === "user" ? last.content.length : last.parts.length + textOf(last).length) : 0;

  // Follow the answer while it streams, unless the reader scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [chat.turns.length, lastLength]);

  // Grow the input with its content, up to a limit.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  const submit = (text = draft) => {
    if (!text.trim() || chat.busy) return;
    setDraft("");
    void chat.send(text);
    requestAnimationFrame(() => {
      if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    });
  };

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border pr-2 pl-4">
        <Sparkles className="size-5 text-accent" strokeWidth={1.75} />
        <h2 className="flex-1 text-[15px] font-semibold">KI-Assistent</h2>
        <Tooltip label="Neuer Chat">
          <Button variant="ghost" size="icon" aria-label="Neuer Chat" className="size-10" disabled={chat.busy || chat.turns.length === 0} onClick={chat.reset}>
            <SquarePen strokeWidth={1.75} />
          </Button>
        </Tooltip>
        <Tooltip label="Schließen">
          <Button variant="ghost" size="icon" aria-label="Assistent schließen" className="size-10" onClick={onClose}>
            <X strokeWidth={1.75} />
          </Button>
        </Tooltip>
      </div>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-5">
        {chat.turns.length === 0 ? (
          <div className="flex flex-col gap-4">
            <p className="text-[15px] leading-relaxed text-muted">
              Beschreib, was sich ändern soll: Texte, neue Bereiche, Globals oder das Design. Der Assistent arbeitet im Entwurf, du siehst alles sofort in der Vorschau und veröffentlichst wie gewohnt.
            </p>
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-xl border border-border px-3.5 py-2.5 text-left text-sm transition-colors outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chat.turns.map((turn, i) =>
            turn.role === "user" ? (
              <div key={i} className="ml-8 self-end rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
                {turn.content}
              </div>
            ) : (
              <AssistantTurn key={i} turn={turn} />
            ),
          )
        )}
      </div>

      <form
        className="shrink-0 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-border-strong bg-surface p-1.5 pl-3.5 transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
          <textarea
            ref={input}
            rows={1}
            value={draft}
            aria-label="Nachricht an den Assistenten"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed outline-none"
          />
          {chat.busy ? (
            <Tooltip label="Anhalten">
              <Button type="button" variant="secondary" size="icon" aria-label="Anhalten" className="size-9 rounded-lg" onClick={chat.stop}>
                <Square className="!size-3.5 fill-current" />
              </Button>
            </Tooltip>
          ) : (
            <Button type="submit" size="icon" aria-label="Senden" className="size-9 rounded-lg" disabled={!draft.trim()}>
              <ArrowUp />
            </Button>
          )}
        </div>
        <p className="mt-2 px-1 text-xs text-muted">Enter sendet, Umschalt+Enter macht eine neue Zeile.</p>
      </form>
    </>
  );
}

/** Desktop: a column right of the preview. Smaller screens: a drawer from the right. */
export function AssistantPanel({ chat, open, onOpenChange, docked }: { chat: AssistantChat; open: boolean; onOpenChange: (open: boolean) => void; docked: boolean }) {
  if (docked) {
    if (!open) return null;
    return (
      <aside aria-label="KI-Assistent" className="flex w-[400px] shrink-0 flex-col border-l border-border bg-surface">
        <ChatBody chat={chat} onClose={() => onOpenChange(false)} />
      </aside>
    );
  }
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-backdrop/30 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <BaseDialog.Popup
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[min(26rem,calc(100vw-2rem))] flex-col bg-surface shadow-popover outline-none transition-transform duration-200 ease-out",
            "data-ending-style:translate-x-full data-starting-style:translate-x-full",
          )}
        >
          <BaseDialog.Title className="sr-only">KI-Assistent</BaseDialog.Title>
          <ChatBody chat={chat} onClose={() => onOpenChange(false)} />
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** Topbar button that opens the assistant; shows a dot while it works. */
export function AssistantButton({ active, busy, onClick }: { active: boolean; busy: boolean; onClick: () => void }) {
  return (
    <Tooltip label="KI-Assistent">
      <button
        type="button"
        aria-label="KI-Assistent"
        aria-pressed={active}
        onClick={onClick}
        className={buttonStyles({ variant: "ghost", size: "icon", className: cn("relative", active && "bg-accent-soft text-accent hover:bg-accent-soft") })}
      >
        <Sparkles strokeWidth={1.75} />
        {busy && <span className="absolute top-2 right-2 size-2 animate-pulse rounded-full bg-accent ring-2 ring-surface" />}
      </button>
    </Tooltip>
  );
}

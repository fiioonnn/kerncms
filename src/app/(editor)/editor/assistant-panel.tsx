"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  CircleAlert,
  FileCode2,
  FileText,
  Globe,
  LayoutPanelTop,
  Loader2,
  MessagesSquare,
  Plus,
  SquarePen,
  Sparkles,
  Square,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import {
  applyEvent,
  attachmentKey,
  emptyAssistantTurn,
  settleTurn,
  textOf,
  type AssistantTurn as AnswerTurn,
  type Attachment,
  type ChatSummary,
  type ServerEvent,
  type Step,
  type Turn,
} from "@/lib/assistant";
import { cn } from "@/lib/utils";
import { deleteAssistantChat, listAssistantChats, loadAssistantChat } from "@/server/actions/assistant-chats";

/* ---------- Chat state ---------- */

/**
 * Chats with the AI assistant, stored on the server per person and site. `beforeSend` runs first
 * (the editor writes pending edits to disk), `onDone` gets the files the assistant changed.
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
      await beforeSend();
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message: content, attachments: sent, page }),
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

/** What can be attached from the editor right now. */
export type AssistantContext = {
  page: { name: string; title: string };
  blocks: { id: string; label: string; summary: string }[];
  selected: { id: string; label: string } | null;
  field: { blockId: string; path: string; label: string } | null;
  globals: { key: string; label: string }[];
};

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

const attachmentIcons: Record<Attachment["kind"], LucideIcon> = { page: FileText, block: LayoutPanelTop, field: Type, global: Globe };

function AttachmentChip({ attachment, onRemove }: { attachment: Attachment; onRemove?: () => void }) {
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

/** A dashed chip for something the person selected in the editor; a click attaches it. */
function SuggestionChip({ attachment, onAdd }: { attachment: Attachment; onAdd: () => void }) {
  const Icon = attachmentIcons[attachment.kind];
  return (
    <button
      type="button"
      onClick={onAdd}
      title="Als Kontext anhängen"
      className="inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-2 text-sm text-muted outline-none hover:border-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Plus className="size-4 shrink-0" strokeWidth={1.75} />
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{attachment.label}</span>
    </button>
  );
}

function ContextMenu({ chat, context }: { chat: AssistantChat; context: AssistantContext }) {
  const page = context.page;
  return (
    <Menu>
      <Tooltip label="Kontext anhängen" side="top">
        <MenuTrigger className={buttonStyles({ variant: "ghost", size: "icon", className: "size-9 rounded-lg" })} aria-label="Kontext anhängen">
          <Plus strokeWidth={1.75} />
        </MenuTrigger>
      </Tooltip>
      <MenuContent align="start" side="top" className="max-h-[min(28rem,70vh)] w-80 overflow-y-auto">
        <MenuLabel>Diese Seite</MenuLabel>
        <MenuItem icon={FileText} onClick={() => chat.attach({ kind: "page", page: page.name, label: `Seite „${page.title}“` })}>
          <span className="truncate">Ganze Seite „{page.title}“</span>
        </MenuItem>
        {context.blocks.map((block, i) => (
          <MenuItem
            key={block.id}
            icon={LayoutPanelTop}
            className="h-auto min-h-10 py-1.5"
            onClick={() => chat.attach({ kind: "block", page: page.name, blockId: block.id, label: `${block.label} (${i + 1})` })}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{block.label}</span>
              <span className="truncate text-sm text-muted">{block.summary}</span>
            </span>
          </MenuItem>
        ))}
        {context.globals.length > 0 && (
          <>
            <MenuSeparator />
            <MenuLabel>Globals</MenuLabel>
            {context.globals.map((g) => (
              <MenuItem key={g.key} icon={Globe} onClick={() => chat.attach({ kind: "global", key: g.key, label: g.label })}>
                <span className="truncate">{g.label}</span>
              </MenuItem>
            ))}
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

function since(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "gestern" : `vor ${days} Tagen`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

function ChatList({ chat, onPick }: { chat: AssistantChat; onPick: () => void }) {
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

function ChatBody({ chat, context, onClose }: { chat: AssistantChat; context: AssistantContext; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<"chat" | "list">("chat");
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

  // An opened chat starts at its end.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.chatId, view]);

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

  const showList = () => {
    setView("list");
    void chat.refreshChats();
  };

  const attachedKeys = new Set(chat.attachments.map(attachmentKey));
  const offers: Attachment[] = [];
  if (context.field) {
    const blockIndex = context.blocks.findIndex((b) => b.id === context.field!.blockId);
    offers.push({ kind: "field", page: context.page.name, blockId: context.field.blockId, field: context.field.path, label: `${context.field.label}${blockIndex >= 0 ? ` (${context.blocks[blockIndex].label})` : ""}` });
  }
  if (context.selected) {
    const blockIndex = context.blocks.findIndex((b) => b.id === context.selected!.id);
    offers.push({ kind: "block", page: context.page.name, blockId: context.selected.id, label: `${context.selected.label} (${blockIndex + 1})` });
  }
  const suggested = offers.filter((o) => !attachedKeys.has(attachmentKey(o)));

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border pr-2 pl-2">
        {view === "list" ? (
          <>
            <Tooltip label="Zurück zum Chat">
              <Button variant="ghost" size="icon" aria-label="Zurück zum Chat" className="size-10" onClick={() => setView("chat")}>
                <ArrowLeft strokeWidth={1.75} />
              </Button>
            </Tooltip>
            <h2 className="flex-1 text-[15px] font-semibold">Chats</h2>
          </>
        ) : (
          <>
            <Sparkles className="mx-2 size-5 shrink-0 text-accent" strokeWidth={1.75} />
            <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{chat.title ?? "KI-Assistent"}</h2>
            <Tooltip label="Alle Chats">
              <Button variant="ghost" size="icon" aria-label="Alle Chats" className="size-10" onClick={showList}>
                <MessagesSquare strokeWidth={1.75} />
              </Button>
            </Tooltip>
          </>
        )}
        <Tooltip label="Neuer Chat">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Neuer Chat"
            className="size-10"
            disabled={chat.busy || (view === "chat" && chat.turns.length === 0)}
            onClick={() => {
              chat.newChat();
              setView("chat");
              requestAnimationFrame(() => input.current?.focus());
            }}
          >
            <SquarePen strokeWidth={1.75} />
          </Button>
        </Tooltip>
        <Tooltip label="Schließen">
          <Button variant="ghost" size="icon" aria-label="Assistent schließen" className="size-10" onClick={onClose}>
            <X strokeWidth={1.75} />
          </Button>
        </Tooltip>
      </div>

      {view === "list" ? (
        <ChatList chat={chat} onPick={() => setView("chat")} />
      ) : (
        <>
          <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-5">
            {chat.loading ? (
              <div className="flex flex-1 items-center justify-center text-muted">
                <Loader2 className="size-5 animate-spin" strokeWidth={1.75} />
              </div>
            ) : chat.turns.length === 0 ? (
              <div className="flex flex-col gap-4">
                <p className="text-[15px] leading-relaxed text-muted">
                  Beschreib, was sich ändern soll: Texte, neue Bereiche, Globals oder das Design. Mit <Plus className="inline size-4 align-[-3px]" strokeWidth={1.75} /> hängst du Bereiche, Texte oder Globals als Kontext an. Der Assistent arbeitet im Entwurf, du siehst alles sofort in der Vorschau.
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
                  <div key={i} className="ml-8 flex flex-col items-end gap-1.5 self-end">
                    {turn.attachments && turn.attachments.length > 0 && (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {turn.attachments.map((a) => (
                          <AttachmentChip key={attachmentKey(a)} attachment={a} />
                        ))}
                      </div>
                    )}
                    <div className="rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">{turn.content}</div>
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
            <div className="flex flex-col gap-1.5 rounded-xl border border-border-strong bg-surface p-1.5 transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
              {(chat.attachments.length > 0 || suggested.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {chat.attachments.map((a) => (
                    <AttachmentChip key={attachmentKey(a)} attachment={a} onRemove={() => chat.detach(attachmentKey(a))} />
                  ))}
                  {suggested.map((a) => (
                    <SuggestionChip key={attachmentKey(a)} attachment={a} onAdd={() => chat.attach(a)} />
                  ))}
                </div>
              )}
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
                className="max-h-[200px] min-h-9 resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed outline-none"
              />
              <div className="flex items-center justify-between">
                <ContextMenu chat={chat} context={context} />
                {chat.busy ? (
                  <Tooltip label="Anhalten">
                    <Button type="button" variant="secondary" size="icon" aria-label="Anhalten" className="size-9 rounded-lg" onClick={chat.stop}>
                      <Square className="!size-3.5 fill-current" />
                    </Button>
                  </Tooltip>
                ) : (
                  <Button type="submit" size="icon" aria-label="Senden" className="size-9 rounded-lg" disabled={!draft.trim() || chat.loading}>
                    <ArrowUp />
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-2 px-1 text-xs text-muted">Enter sendet, Umschalt+Enter macht eine neue Zeile.</p>
          </form>
        </>
      )}
    </>
  );
}

/** Desktop: a panel floating over the preview. Smaller screens: a drawer from the right. */
export function AssistantPanel({
  chat,
  context,
  open,
  onOpenChange,
  docked,
}: {
  chat: AssistantChat;
  context: AssistantContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docked: boolean;
}) {
  if (docked) {
    if (!open) return null;
    return (
      <aside
        aria-label="KI-Assistent"
        className="absolute inset-y-3 right-3 z-30 flex w-[400px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-popover"
      >
        <ChatBody chat={chat} context={context} onClose={() => onOpenChange(false)} />
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
          <ChatBody chat={chat} context={context} onClose={() => onOpenChange(false)} />
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

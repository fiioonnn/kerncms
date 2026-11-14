"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { ArrowLeft, ArrowUp, FileText, Globe, LayoutPanelTop, Loader2, MessagesSquare, Plus, SquarePen, Sparkles, Square, X } from "lucide-react";
import { AssistantTurn, AttachmentChip, attachmentIcons, ChatList, type AssistantChat } from "@/components/assistant/assistant-chat";
import { Button, buttonStyles } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/overlay";
import { attachmentKey, textOf, type Attachment } from "@/lib/assistant";
import { cn } from "@/lib/utils";

export { useAssistantChat, type AssistantChat } from "@/components/assistant/assistant-chat";

/** What can be attached from the editor right now. */
export type AssistantContext = {
  page: { name: string; title: string };
  blocks: { id: string; label: string; summary: string }[];
  selected: { id: string; label: string } | null;
  field: { blockId: string; path: string; label: string } | null;
  globals: { key: string; label: string }[];
};

const suggestions = [
  "Formuliere die Texte dieser Seite freundlicher.",
  "Mach die Telefonnummer im Footer zu einem Global, das man im CMS ändern kann.",
  "Füge dieser Seite einen Block mit häufigen Fragen hinzu.",
];

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

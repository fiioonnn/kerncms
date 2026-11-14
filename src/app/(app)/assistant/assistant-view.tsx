"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUp, ChartLine, Inbox, Loader2, MessagesSquare, Search, Sparkles, Square, SquarePen, Wand2, type LucideIcon } from "lucide-react";
import { AssistantTurn, ChatList, useAssistantChat } from "@/components/assistant/assistant-chat";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/overlay";
import { textOf } from "@/lib/assistant";
import { cn } from "@/lib/utils";

const suggestions: { icon: LucideIcon; text: string }[] = [
  { icon: ChartLine, text: "Wie lief die Website in den letzten 30 Tagen im Vergleich zu davor?" },
  { icon: Inbox, text: "Fass die Formular-Anfragen dieser Woche zusammen und markiere Spam." },
  { icon: Search, text: "Prüf die SEO der Startseite und verbessere Titel und Beschreibung." },
  { icon: Wand2, text: "Was ist noch nicht veröffentlicht, und wer hat zuletzt was geändert?" },
];

/** The AI assistant on its own page: chats on the left, the conversation in the middle. */
export function AssistantView({ siteName }: { siteName: string }) {
  const router = useRouter();
  const chat = useAssistantChat({ mode: "app", onDone: () => router.refresh() });
  const [draft, setDraft] = useState("");
  const [mobileList, setMobileList] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const last = chat.turns.at(-1);
  const lastLength = last ? (last.role === "user" ? last.content.length : last.parts.length + textOf(last).length) : 0;

  useEffect(() => {
    void chat.refreshChats();
    input.current?.focus();
    // Once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the answer while it streams, unless the reader scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [chat.turns.length, lastLength]);

  // An opened chat starts at its end.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.chatId]);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [draft]);

  const submit = (text = draft) => {
    if (!text.trim() || chat.busy) return;
    setDraft("");
    void chat.send(text);
    requestAnimationFrame(() => {
      if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    });
  };

  const startNew = () => {
    chat.newChat();
    setMobileList(false);
    requestAnimationFrame(() => input.current?.focus());
  };

  const newChatButton = (
    <Tooltip label="Neuer Chat">
      <Button variant="ghost" size="icon" aria-label="Neuer Chat" className="size-10" disabled={chat.busy || chat.turns.length === 0} onClick={startNew}>
        <SquarePen strokeWidth={1.75} />
      </Button>
    </Tooltip>
  );

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0">
      {/* Chats: always on desktop, as its own view on small screens */}
      <aside className={cn("w-full shrink-0 flex-col border-r border-border bg-surface lg:flex lg:w-72", mobileList ? "flex" : "hidden")}>
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2">
          <Button variant="ghost" size="icon" aria-label="Zurück zum Chat" className="size-10 lg:hidden" onClick={() => setMobileList(false)}>
            <ArrowLeft strokeWidth={1.75} />
          </Button>
          <h2 className="flex-1 px-2 text-[15px] font-semibold">Chats</h2>
          {newChatButton}
        </div>
        <ChatList chat={chat} onPick={() => setMobileList(false)} />
      </aside>

      <section className={cn("min-w-0 flex-1 flex-col", mobileList ? "hidden lg:flex" : "flex")}>
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2 sm:px-4">
          <Button variant="ghost" size="icon" aria-label="Alle Chats" className="size-10 lg:hidden" onClick={() => setMobileList(true)}>
            <MessagesSquare strokeWidth={1.75} />
          </Button>
          <Sparkles className="mx-2 hidden size-5 shrink-0 text-accent lg:block" strokeWidth={1.75} />
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{chat.title ?? "KI-Assistent"}</h1>
          <span className="lg:hidden">{newChatButton}</span>
        </div>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
            {chat.loading ? (
              <div className="flex justify-center py-16 text-muted">
                <Loader2 className="size-5 animate-spin" strokeWidth={1.75} />
              </div>
            ) : chat.turns.length === 0 ? (
              <div className="flex flex-col gap-6 pt-6 sm:pt-12">
                <div className="flex flex-col gap-2">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Sparkles className="size-5" strokeWidth={1.75} />
                  </span>
                  <h2 className="text-2xl font-semibold tracking-tight">Was kann ich für {siteName} tun?</h2>
                  <p className="max-w-xl text-[15px] leading-relaxed text-muted">
                    Ich kenne Statistiken, Formular-Anfragen, Verlauf, SEO und den Code der Website und kann alles ändern, was du auch im CMS ändern kannst, mit deinen Rechten. Änderungen landen im Entwurf; vor dem Veröffentlichen oder Löschen frage ich nach.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {suggestions.map((s) => (
                    <button
                      key={s.text}
                      type="button"
                      onClick={() => submit(s.text)}
                      className="flex items-start gap-3 rounded-xl border border-border px-3.5 py-3 text-left text-sm leading-snug transition-colors outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <s.icon className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.75} />
                      {s.text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chat.turns.map((turn, i) =>
                turn.role === "user" ? (
                  <div key={i} className="ml-10 self-end rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
                    {turn.content}
                  </div>
                ) : (
                  <AssistantTurn key={i} turn={turn} />
                ),
              )
            )}
          </div>
        </div>

        <form
          className="shrink-0 px-4 pt-2 pb-4 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-border-strong bg-surface p-2 shadow-sm transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
            <textarea
              ref={input}
              rows={1}
              value={draft}
              aria-label="Nachricht an den Assistenten"
              placeholder="Frag nach Zahlen oder beschreib, was sich ändern soll"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="max-h-[240px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed outline-none placeholder:text-muted"
            />
            {chat.busy ? (
              <Tooltip label="Anhalten">
                <Button type="button" variant="secondary" size="icon" aria-label="Anhalten" className="size-10 rounded-xl" onClick={chat.stop}>
                  <Square className="!size-3.5 fill-current" />
                </Button>
              </Tooltip>
            ) : (
              <Button type="submit" size="icon" aria-label="Senden" className="size-10 rounded-xl" disabled={!draft.trim() || chat.loading}>
                <ArrowUp />
              </Button>
            )}
          </div>
          <p className="mx-auto mt-2 w-full max-w-3xl px-1 text-xs text-muted">Enter sendet, Umschalt+Enter macht eine neue Zeile.</p>
        </form>
      </section>
    </div>
  );
}

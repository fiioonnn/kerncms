"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CornerDownLeft, FileText, Newspaper, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { allNavItems } from "./nav";

type Entry = { label: string; hint: string; href: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> };

const entries: Entry[] = [
  ...allNavItems.map((item) => ({ label: item.label, hint: "Bereich", href: item.href, icon: item.icon })),
  { label: "Startseite", hint: "Seite", href: "/editor", icon: FileText },
  { label: "Über uns", hint: "Seite", href: "/editor", icon: FileText },
  { label: "Sortiment", hint: "Seite", href: "/editor", icon: FileText },
  { label: "Neue Sauerteigbrote ab Mai", hint: "Beitrag", href: "/posts/new", icon: Newspaper },
  { label: "Rezept: Dinkel-Vollkornbrot", hint: "Beitrag", href: "/posts/new", icon: Newspaper },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = entries.filter((entry) => entry.label.toLowerCase().includes(query.trim().toLowerCase()));

  function go(entry: Entry | undefined) {
    if (!entry) return;
    onOpenChange(false);
    router.push(entry.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results.at(active));
    }
  }

  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <BaseDialog.Popup className="fixed top-[14vh] left-1/2 z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-popover outline-none transition-[scale,opacity] duration-150 data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0">
          <BaseDialog.Title className="sr-only">Suchen</BaseDialog.Title>
          <div className="flex h-16 items-center gap-3 border-b border-border px-5">
            <Search className="size-5 text-muted" strokeWidth={1.75} />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              aria-label="Suchen"
              placeholder="Seiten, Beiträge und Bereiche durchsuchen…"
              className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-muted"
            />
            <kbd className="rounded-md border border-border px-1.5 text-xs font-medium text-muted">Esc</kbd>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {results.length === 0 && <p className="px-3 py-8 text-center text-[15px] text-muted">Keine Treffer</p>}
            {results.map((entry, i) => (
              <button
                key={`${entry.hint}-${entry.label}`}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(entry)}
                className={cn(
                  "flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px]",
                  i === active && "bg-subtle",
                )}
              >
                <entry.icon className="size-5 text-muted" strokeWidth={1.75} />
                <span className="flex-1 truncate font-medium">{entry.label}</span>
                <span className="text-sm text-muted">{entry.hint}</span>
                {i === active && <CornerDownLeft className="size-4 text-muted" />}
              </button>
            ))}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

"use client";

import { useState } from "react";
import { Check, ChevronDown, FileText, Search } from "lucide-react";
import { NewPageDialog } from "@/components/actions/create-dialogs";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/display";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { sitePages } from "@/lib/example-content";
import { cn } from "@/lib/utils";

/** Pages with unpublished changes (example data). */
const draftPages = new Set(["/"]);

export function pageLabel(path: string) {
  return sitePages.find((p) => p.value === path)?.label ?? path;
}

/** Page switcher in the editor topbar: search, status, and a guard for unsaved changes. */
export function PagePicker({
  current,
  dirty,
  onSelect,
}: {
  current: string;
  dirty: boolean;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const results = sitePages.filter(
    (p) => p.label.toLowerCase().includes(query.trim().toLowerCase()) || p.value.includes(query.trim().toLowerCase()),
  );

  function choose(path: string) {
    setOpen(false);
    setQuery("");
    if (path === current) return;
    if (dirty) setPending(path);
    else onSelect(path);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex h-11 min-w-56 items-center gap-3 rounded-xl border border-border-strong bg-surface px-3 text-left transition-colors outline-none hover:border-muted/60 focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 data-popup-open:border-accent">
          <FileText className="size-[18px] shrink-0 text-muted" strokeWidth={1.75} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[15px] font-medium">{pageLabel(current)}</span>
            <span className="truncate font-mono text-xs text-muted">{current}</span>
          </span>
          <ChevronDown className="size-4 text-muted" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <label className="flex h-12 items-center gap-2.5 border-b border-border px-4 text-muted">
            <Search className="size-[18px]" strokeWidth={1.75} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && results[0] && choose(results[0].value)}
              aria-label="Seite suchen"
              placeholder="Seite suchen…"
              className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted"
            />
          </label>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {results.length === 0 && <p className="px-3 py-6 text-center text-[15px] text-muted">Keine Seite gefunden</p>}
            {results.map((page) => (
              <button
                key={page.value}
                type="button"
                onClick={() => choose(page.value)}
                className={cn(
                  "flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-subtle",
                  page.value === current && "bg-accent-soft hover:bg-accent-soft",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className={cn("truncate text-[15px] font-medium", page.value === current && "text-accent")}>
                    {page.label}
                  </span>
                  <span className="truncate font-mono text-xs text-muted">{page.value}</span>
                </span>
                {draftPages.has(page.value) && (
                  <Badge tone="warning" dot className="h-6 px-2 text-xs">
                    Entwurf
                  </Badge>
                )}
                {page.value === current && <Check className="size-4 text-accent" />}
              </button>
            ))}
          </div>
          <div className="border-t border-border p-3">
            <NewPageDialog />
          </div>
        </PopoverContent>
      </Popover>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => !next && setPending(null)}
        title="Ungespeicherte Änderungen verwerfen?"
        description={`Wenn du zu „${pending ? pageLabel(pending) : ""}“ wechselst, gehen die Änderungen an „${pageLabel(current)}“ verloren.`}
        cancelLabel="Weiter bearbeiten"
        confirmLabel="Verwerfen und wechseln"
        danger
        onConfirm={() => pending && onSelect(pending)}
      />
    </>
  );
}

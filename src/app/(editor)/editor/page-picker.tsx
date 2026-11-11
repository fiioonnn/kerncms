"use client";

import { useState } from "react";
import { Check, ChevronDown, FileText, Loader2, Plus, Search } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/display";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import type { ContentStatus, PageSummary } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { createPage } from "@/server/actions/content";

const statusBadge: Partial<Record<ContentStatus, { label: string; tone: "warning" | "accent" | "success" }>> = {
  unsaved: { label: "Ungespeichert", tone: "warning" },
  draft: { label: "Entwurf", tone: "accent" },
  new: { label: "Neu", tone: "success" },
};

export function StatusBadge({ status, className }: { status: ContentStatus; className?: string }) {
  const badge = statusBadge[status];
  if (!badge) return null;
  return (
    <Badge tone={badge.tone} dot className={cn("h-6 px-2 text-xs", className)}>
      {badge.label}
    </Badge>
  );
}

/** Page switcher in the editor topbar: search, status badges and "Neue Seite". */
export function PagePicker({
  pages,
  current,
  title,
  path,
  onSelect,
  onCreated,
  canCreate,
}: {
  pages: PageSummary[];
  /** File name of the open page. */
  current: string;
  /** Title and path of the open page as currently edited. */
  title: string;
  path: string;
  onSelect: (name: string) => void;
  onCreated: (name: string) => void;
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const results = pages.filter((p) => p.title.toLowerCase().includes(q) || p.path.toLowerCase().includes(q) || p.name.includes(q));

  function choose(name: string) {
    setOpen(false);
    setQuery("");
    if (name !== current) onSelect(name);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-border-strong bg-surface px-2.5 text-left transition-colors outline-none hover:border-muted/60 focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 data-popup-open:border-accent sm:min-w-56 sm:gap-3 sm:px-3">
          <FileText className="hidden size-[18px] shrink-0 text-muted sm:block" strokeWidth={1.75} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[15px] font-medium">{title || "Ohne Titel"}</span>
            <span className="hidden truncate font-mono text-xs text-muted sm:block">{path}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))]">
          <label className="flex h-12 items-center gap-2.5 border-b border-border px-4 text-muted">
            <Search className="size-[18px]" strokeWidth={1.75} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && results[0] && choose(results[0].name)}
              aria-label="Seite suchen"
              placeholder="Seite suchen…"
              className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted"
            />
          </label>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {results.length === 0 && <p className="px-3 py-6 text-center text-[15px] text-muted">Keine Seite gefunden</p>}
            {results.map((page) => {
              const active = page.name === current;
              return (
                <button
                  key={page.name}
                  type="button"
                  onClick={() => choose(page.name)}
                  className={cn(
                    "flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-subtle",
                    active && "bg-accent-soft hover:bg-accent-soft",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className={cn("truncate text-[15px] font-medium", active && "text-accent")}>{page.title || page.name}</span>
                    <span className="truncate font-mono text-xs text-muted">{page.path}</span>
                  </span>
                  <StatusBadge status={page.status} />
                  {active && <Check className="size-4 shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>
          {canCreate && (
            <div className="border-t border-border p-3">
              <Button
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
              >
                <Plus />
                Neue Seite
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <NewPageDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={onCreated} />
    </>
  );
}

export function NewPageDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (name: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) {
      setErrors({ title: "Bitte einen Titel eingeben." });
      return;
    }
    setBusy(true);
    const result = await createPage({ title: title.trim(), path: path.trim() });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      toast.error("Seite konnte nicht angelegt werden", { description: result.error });
      return;
    }
    toast.success("Seite angelegt", { description: `${title.trim()} liegt jetzt im Entwurf.` });
    onOpenChange(false);
    setTitle("");
    setPath("");
    setErrors({});
    onCreated(result.data.name);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Neue Seite"
        description="Die Seite wird im Entwurf angelegt und erst mit dem nächsten Veröffentlichen sichtbar."
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Seite anlegen
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field invalid={Boolean(errors.title)}>
            <Label>Titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            {errors.title && <p className="text-sm font-medium text-danger">{errors.title}</p>}
          </Field>
          <Field invalid={Boolean(errors.path)}>
            <Label>Pfad</Label>
            <Input value={path} onChange={(e) => setPath(e.target.value)} className="font-mono" />
            <Description>Wird aus dem Titel gebildet, wenn du ihn leer lässt.</Description>
            {errors.path && <p className="text-sm font-medium text-danger">{errors.path}</p>}
          </Field>
          <button type="submit" hidden />
        </form>
      </DialogContent>
    </Dialog>
  );
}

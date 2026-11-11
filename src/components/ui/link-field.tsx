"use client";

import { useId, useState } from "react";
import { Check, ExternalLink, FileText, Globe, Search } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger, SegmentedControl } from "@/components/ui/overlay";
import { Switch } from "@/components/ui/toggles";
import { useOptionalKern } from "@/components/kern/kern-provider";
import { sitePages as examplePages } from "@/lib/example-content";
import { cn } from "@/lib/utils";

export type LinkValue =
  | { type: "page"; path: string }
  | { type: "external"; url: string; newTab: boolean };

/** Pages of the current site as select options; example pages outside a site (styleguide). */
export function usePageOptions() {
  const kern = useOptionalKern();
  return kern ? kern.pages.map((p) => ({ label: p.title, value: p.path })) : examplePages;
}

/** Short human-readable form of a link, e.g. for the canvas or a list. */
export function describeLink(value: LinkValue, pages: { label: string; value: string }[] = examplePages) {
  if (value.type === "page") {
    return pages.find((p) => p.value === value.path)?.label ?? value.path;
  }
  return value.url;
}

function LinkPicker({
  value,
  onPick,
}: {
  value: LinkValue;
  onPick: (value: LinkValue) => void;
}) {
  const [mode, setMode] = useState<LinkValue["type"]>(value.type);
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState(value.type === "external" ? value.url : "");
  const [newTab, setNewTab] = useState(value.type === "external" ? value.newTab : true);
  const q = query.trim().toLowerCase();
  const sitePages = usePageOptions();
  const results = sitePages.filter((p) => p.label.toLowerCase().includes(q) || p.value.includes(q));
  const validUrl = /^(https?:\/\/|mailto:|tel:)\S+$/.test(url.trim());

  return (
    <div className="flex flex-col gap-4 p-4">
      <SegmentedControl
        label="Linkart"
        value={mode}
        onValueChange={(next) => setMode(next as LinkValue["type"])}
        items={[
          { value: "page", label: "Interne Seite" },
          { value: "external", label: "Externe URL" },
        ]}
        className="[&>button]:flex-1"
      />

      {mode === "page" ? (
        <>
          <label className="flex h-11 items-center gap-2.5 rounded-xl border border-border-strong px-3.5 text-muted focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
            <Search className="size-5" strokeWidth={1.75} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Seiten durchsuchen"
              placeholder="Seite suchen…"
              className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted"
            />
          </label>
          <div className="-mx-1 flex max-h-64 flex-col overflow-y-auto">
            {results.length === 0 ? (
              <p className="py-8 text-center text-[15px] text-muted">Keine Seiten gefunden</p>
            ) : (
              results.map((page) => {
                const active = value.type === "page" && value.path === page.value;
                return (
                  <button
                    key={page.value}
                    type="button"
                    onClick={() => onPick({ type: "page", path: page.value })}
                    className={cn(
                      "flex h-12 items-center gap-3 rounded-lg px-3 text-left transition-colors outline-none hover:bg-subtle focus-visible:bg-subtle focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
                      active && "bg-accent-soft hover:bg-accent-soft",
                    )}
                  >
                    <FileText className="size-[18px] shrink-0 text-muted" strokeWidth={1.75} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-medium">{page.label}</span>
                    </span>
                    <span className="truncate text-sm text-muted">{page.value}</span>
                    {active && <Check className="size-4 shrink-0 text-accent" strokeWidth={2.5} />}
                  </button>
                );
              })
            )}
          </div>
        </>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (validUrl) onPick({ type: "external", url: url.trim(), newTab });
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-medium">URL</span>
            <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" />
            <span className="text-sm text-muted">Mit https://, mailto: oder tel: beginnen.</span>
          </label>
          <Switch label="In neuem Tab öffnen" checked={newTab} onCheckedChange={setNewTab} />
          <Button type="submit" disabled={!validUrl} className="self-end">
            Übernehmen
          </Button>
        </form>
      )}
    </div>
  );
}

/** Link target field: shows the current target and opens a picker for an internal page or external URL. */
export function LinkField({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: LinkValue;
  onChange: (value: LinkValue) => void;
  description?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const sitePages = usePageOptions();
  const page = value.type === "page" ? sitePages.find((p) => p.value === value.path) : undefined;
  const Icon = value.type === "page" ? FileText : Globe;

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
      <span id={`${id}-label`} className="text-[15px] font-medium">
        {label}
      </span>
      <div className="flex min-h-14 items-center gap-3 rounded-xl border border-border-strong bg-surface py-2 pr-2 pl-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-muted">
          <Icon className="size-[18px]" strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {value.type === "page" ? (
            <>
              <span className="truncate text-[15px] font-medium">{page?.label ?? "Unbekannte Seite"}</span>
              <span className="truncate text-sm text-muted">{value.path}</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-[15px] font-medium">
                <span className="truncate">{value.url}</span>
                {value.newTab && <ExternalLink className="size-3.5 shrink-0 text-muted" strokeWidth={1.75} />}
              </span>
              <span className="truncate text-sm text-muted">
                Externe URL{value.newTab ? " · neuer Tab" : ""}
              </span>
            </>
          )}
        </span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger aria-label={`${label} ändern`} className={buttonStyles({ variant: "ghost", size: "sm" })}>
            Ändern
          </PopoverTrigger>
          <PopoverContent align="end">
            <LinkPicker
              value={value}
              onPick={(next) => {
                onChange(next);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      {description && <p className="text-sm text-muted">{description}</p>}
    </div>
  );
}

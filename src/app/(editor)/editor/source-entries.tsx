"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp, Eye, EyeOff, Loader2, Plus } from "lucide-react";
import { Fields } from "@/components/kern/field-renderer";
import { useKern } from "@/components/kern/kern-provider";
import { entryTitle, formatFieldValue } from "@/components/collections/format";
import { Button, buttonStyles } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { BlockEntries, CollectionDef, EntryValues } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { loadEntries, saveEntry } from "@/server/actions/content";

type Entry = { id: string; values: EntryValues };

function readSelection(value: unknown): BlockEntries {
  const v = (value ?? {}) as Partial<BlockEntries>;
  const ids = (list: unknown) => (Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : []);
  return { order: ids(v.order), hidden: ids(v.hidden) };
}

/** Entries in the block's own order; entries not in it (new ones) follow in the default order. */
function arrange(entries: Entry[], order: string[]) {
  if (order.length === 0) return entries;
  const byId = new Map(entries.map((e) => [e.id, e]));
  const first = order.map((id) => byId.get(id)).filter((e): e is Entry => Boolean(e));
  const rest = entries.filter((e) => !order.includes(e.id));
  return [...first, ...rest];
}

/**
 * The entries a block shows (e.g. the events of an "Termine" block): reorder or hide
 * them for this block, and edit an entry right here. Edits to an entry are saved to the
 * collection, so they apply wherever it appears.
 */
export function SourceEntries({
  collection,
  value,
  onChange,
  canEdit,
}: {
  collection: CollectionDef;
  value: unknown;
  onChange: (value: BlockEntries | null) => void;
  canEdit: boolean;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const selection = readSelection(value);
  const list = entries ? arrange(entries, selection.order) : [];
  const sortField = collection.sort ? collection.fields.find((f) => f.name === collection.sort!.field) : null;

  useEffect(() => {
    let cancelled = false;
    void loadEntries(collection.key).then((result) => {
      if (cancelled) return;
      if (!result.ok) return setLoadError(result.error);
      setEntries(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [collection.key]);

  function update(next: BlockEntries) {
    onChange(next.order.length || next.hidden.length ? next : null);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((e) => e.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    update({ ...selection, order: ids });
  }

  function toggleHidden(id: string) {
    const hidden = selection.hidden.includes(id) ? selection.hidden.filter((h) => h !== id) : [...selection.hidden, id];
    update({ ...selection, hidden });
  }

  const subtitle = (entry: Entry) =>
    collection.listFields
      .map((name) => formatFieldValue(collection.fields.find((f) => f.name === name), entry.values[name]))
      .filter(Boolean)
      .join(" · ");

  return (
    <div role="group" aria-label={collection.label} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-medium">
          {collection.label}
          {entries && <span className="ml-2 text-sm font-normal text-muted">{entries.length}</span>}
        </span>
        {selection.order.length > 0 && canEdit && (
          <button
            type="button"
            onClick={() => update({ ...selection, order: [] })}
            className="rounded-md px-1.5 py-0.5 text-sm text-muted transition-colors outline-none hover:bg-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
          >
            Reihenfolge zurücksetzen
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        {selection.order.length > 0
          ? "Eigene Reihenfolge für diesen Block. Neue Einträge kommen ans Ende."
          : sortField
            ? `Sortiert nach ${sortField.label}${collection.sort!.desc ? " (neueste zuerst)" : ""}. Neue Einträge ordnen sich selbst ein.`
            : "Neue Einträge erscheinen hier automatisch."}
      </p>

      {loadError && <p className="text-sm text-danger">{loadError}</p>}
      {!entries && !loadError && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      )}
      {entries && entries.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">Noch keine {collection.label}.</p>}

      <div className="flex flex-col gap-2">
        {list.map((entry, index) => {
          const hidden = selection.hidden.includes(entry.id);
          const isOpen = open === entry.id;
          const sub = subtitle(entry);
          return (
            <div key={entry.id} className={cn("rounded-xl border bg-surface", isOpen ? "border-border-strong" : "border-border")}>
              <div className="flex items-center gap-1 py-1 pr-1 pl-1">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : entry.id)}
                  className={cn(
                    "flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    hidden && "opacity-50",
                  )}
                >
                  <span className={cn("truncate text-[15px] font-medium", hidden && "line-through")}>{entryTitle(collection, entry.values, entry.id)}</span>
                  {sub && <span className="truncate text-sm text-muted">{sub}</span>}
                </button>
                {canEdit && (
                  <>
                    <Tooltip label={hidden ? "Einblenden" : "In diesem Block ausblenden"}>
                      <Button variant="ghost" size="icon" className="size-9" aria-label={hidden ? "Einblenden" : "Ausblenden"} aria-pressed={hidden} onClick={() => toggleHidden(entry.id)}>
                        {hidden ? <EyeOff /> : <Eye />}
                      </Button>
                    </Tooltip>
                    <Tooltip label="Nach oben">
                      <Button variant="ghost" size="icon" className="size-9" aria-label="Nach oben" disabled={index === 0} onClick={() => move(index, -1)}>
                        <ChevronUp />
                      </Button>
                    </Tooltip>
                    <Tooltip label="Nach unten">
                      <Button variant="ghost" size="icon" className="size-9" aria-label="Nach unten" disabled={index === list.length - 1} onClick={() => move(index, 1)}>
                        <ChevronDown />
                      </Button>
                    </Tooltip>
                  </>
                )}
              </div>
              {isOpen && (
                <EntryEditor
                  collection={collection}
                  entry={entry}
                  canEdit={canEdit}
                  onSaved={(values) => setEntries((all) => all?.map((e) => (e.id === entry.id ? { ...e, values } : e)) ?? null)}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {canEdit && (
          // Full navigations, so the editor can warn about unsaved changes.
          <a href={`/collections/${collection.key}/new`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <Plus />
            {collection.singular} anlegen
          </a>
        )}
        <a href={`/collections/${collection.key}`} className={buttonStyles({ variant: "ghost", size: "sm" })}>
          Alle {collection.label}
          <ArrowUpRight />
        </a>
      </div>
    </div>
  );
}

function EntryEditor({
  collection,
  entry,
  canEdit,
  onSaved,
}: {
  collection: CollectionDef;
  entry: Entry;
  canEdit: boolean;
  onSaved: (values: EntryValues) => void;
}) {
  const { config } = useKern();
  const [values, setValues] = useState(entry.values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(values) !== JSON.stringify(entry.values);

  function save() {
    startTransition(async () => {
      const result = await saveEntry(collection.key, entry.id, values);
      if (!result.ok) {
        setErrors(result.errors ?? {});
        toast.error("Speichern fehlgeschlagen", { description: result.error });
        return;
      }
      setErrors({});
      setValues(result.data.values);
      onSaved(result.data.values);
      toast.success(`${collection.singular} gespeichert`);
    });
  }

  return (
    <div className="flex flex-col gap-5 border-t border-border p-4">
      <Fields
        fields={collection.fields}
        values={values}
        onChange={(name, v) => setValues((prev) => ({ ...prev, [name]: v }))}
        errors={errors}
        marks={config.marks}
        compact
      />
      {canEdit && (
        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setValues(entry.values)} disabled={pending}>
              Verwerfen
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!dirty || pending}>
            {pending && <Loader2 className="animate-spin" />}
            {collection.singular} speichern
          </Button>
        </div>
      )}
    </div>
  );
}

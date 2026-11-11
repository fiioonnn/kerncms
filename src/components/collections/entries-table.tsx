"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CopyPlus, FileText, History, MoreHorizontal, Pencil, Plus, Search, SearchX, Trash2 } from "lucide-react";
import { useCan } from "@/components/kern/kern-provider";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Card, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { CollectionDef, ContentStatus, EntrySummary } from "@/lib/kern-types";
import { deleteEntry, duplicateEntry } from "@/server/actions/content";
import { entryTitle, formatFieldValue } from "./format";
import { StatusBadge, statusLabels } from "./status-badge";

export type EntryRow = EntrySummary & { updatedLabel: string };

const statusFilter = [
  { label: "Alle Status", value: "all" },
  ...(Object.keys(statusLabels) as ContentStatus[]).map((s) => ({ label: statusLabels[s], value: s })),
];

export function EntriesTable({ collection, entries }: { collection: CollectionDef; entries: EntryRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const canEdit = useCan("editor");

  const fieldsByName = useMemo(() => new Map(collection.fields.map((f) => [f.name, f])), [collection.fields]);
  const columns = collection.listFields
    .filter((name) => name !== collection.titleField)
    .map((name) => fieldsByName.get(name))
    .filter((f) => f !== undefined);
  const titleField = fieldsByName.get(collection.titleField);

  const needle = query.trim().toLowerCase();
  const rows = entries.filter(
    (entry) =>
      (status === "all" || entry.status === status) &&
      (!needle ||
        entry.id.includes(needle) ||
        Object.entries(entry.values).some(([name, value]) =>
          formatFieldValue(fieldsByName.get(name), value).toLowerCase().includes(needle),
        )),
  );
  const filtered = needle !== "" || status !== "all";

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={FileText}
          title={`Noch keine ${collection.label}`}
          description={`Lege den ersten ${collection.singular} an. Er wird als Datei in ${collection.path} gespeichert.`}
          action={
            canEdit && (
              <Link href={`/collections/${collection.key}/new`} className={buttonStyles()}>
                <Plus />
                {collection.singular} anlegen
              </Link>
            )
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted"
            strokeWidth={1.75}
          />
          <Input
            aria-label={`${collection.label} durchsuchen`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-11"
          />
        </div>
        <Select aria-label="Nach Status filtern" items={statusFilter} value={status} onValueChange={setStatus} className="w-48" />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Keine Treffer"
            description={needle ? `Kein Eintrag passt zu „${query.trim()}“.` : "Kein Eintrag hat diesen Status."}
            action={
              filtered && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                  }}
                >
                  Filter zurücksetzen
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{titleField?.label ?? "Titel"}</Th>
                {columns.map((field) => (
                  <Th key={field.name}>{field.label}</Th>
                ))}
                <Th>Status</Th>
                <Th>Zuletzt geändert</Th>
                <Th className="w-0" aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const title = entryTitle(collection, entry.values, entry.id);
                const editHref = `/collections/${collection.key}/${encodeURIComponent(entry.id)}`;
                return (
                  <tr key={entry.id} className="transition-colors hover:bg-subtle/50">
                    <Td>
                      <Link href={editHref} className="text-base font-medium hover:text-accent">
                        {title}
                      </Link>
                    </Td>
                    {columns.map((field) => (
                      <Td key={field.name} className="text-muted">
                        {formatFieldValue(field, entry.values[field.name]) || "–"}
                      </Td>
                    ))}
                    <Td>
                      <StatusBadge status={entry.status} />
                    </Td>
                    <Td className="whitespace-nowrap text-muted">{entry.updatedLabel}</Td>
                    <Td>
                      <EntryRowActions collection={collection} entry={entry} title={title} editHref={editHref} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function EntryRowActions({
  collection,
  entry,
  title,
  editHref,
}: {
  collection: CollectionDef;
  entry: EntryRow;
  title: string;
  editHref: string;
}) {
  const canEdit = useCan("editor");
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function duplicate() {
    startTransition(async () => {
      const result = await duplicateEntry(collection.key, entry.id);
      if (!result.ok) return void toast.error("Duplizieren fehlgeschlagen", { description: result.error });
      toast.success(`„${title}“ dupliziert`, { description: "Die Kopie liegt im Entwurf." });
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteEntry(collection.key, entry.id);
      if (!result.ok) return void toast.error("Löschen fehlgeschlagen", { description: result.error });
      toast.success(`„${title}“ in den Papierkorb verschoben`);
      router.refresh();
    });
  }

  return (
    <>
      <Menu>
        <Tooltip label="Weitere Aktionen">
          <MenuTrigger
            aria-label={`Aktionen für ${title}`}
            disabled={pending}
            className={buttonStyles({ variant: "ghost", size: "icon", className: "data-popup-open:bg-subtle" })}
          >
            <MoreHorizontal />
          </MenuTrigger>
        </Tooltip>
        <MenuContent>
          <MenuItem icon={Pencil} render={<Link href={editHref} />}>
            {canEdit ? "Bearbeiten" : "Ansehen"}
          </MenuItem>
          <MenuItem icon={History} render={<Link href={`/history?file=${encodeURIComponent(entry.file)}`} />}>
            Verlauf
          </MenuItem>
          {canEdit && (
            <>
              <MenuItem icon={CopyPlus} onClick={duplicate}>
                Duplizieren
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={Trash2} danger onClick={() => setConfirmOpen(true)}>
                Löschen
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`„${title}“ löschen?`}
        description="Der Eintrag wandert in den Papierkorb und lässt sich dort 30 Tage lang wiederherstellen."
        confirmLabel="Löschen"
        danger
        onConfirm={remove}
      />
    </>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, FileText, History, Trash2, Undo2 } from "lucide-react";
import { emptyValues, Fields } from "@/components/kern/field-renderer";
import { useCan, useKern } from "@/components/kern/kern-provider";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Avatar, Badge, Card, CardContent, CardHeader } from "@/components/ui/display";
import { toast } from "@/components/ui/toast";
import type { CollectionDef, ContentStatus, EntryValues } from "@/lib/kern-types";
import { deleteEntry, saveEntry } from "@/server/actions/content";
import { entryTitle } from "./format";
import { StatusBadge } from "./status-badge";

export type EntryHistoryItem = { sha: string; author: string; message: string; when: string; relative: string };

function same(a: EntryValues, b: EntryValues) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Create / edit form generated from the collection's fields. Without `id` it creates a new entry and
 * redirects to it after the first save.
 */
export function CollectionForm({
  collection,
  id,
  initialValues,
  status,
  history,
}: {
  collection: CollectionDef;
  id?: string;
  initialValues?: EntryValues;
  status?: ContentStatus;
  history?: EntryHistoryItem[];
}) {
  const router = useRouter();
  const { config } = useKern();
  const canEdit = useCan("editor");
  const [saved, setSaved] = useState<EntryValues>(() => ({ ...emptyValues(collection.fields), ...initialValues }));
  const [values, setValues] = useState<EntryValues>(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Bumped on discard so uncontrolled editors (rich text) remount with the saved values.
  const [version, setVersion] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = !same(values, saved);
  const isNew = !id;
  const listHref = `/collections/${collection.key}`;
  const heading = isNew ? `${collection.singular} anlegen` : entryTitle(collection, values, id) || entryTitle(collection, saved, id);
  const file = `${collection.path}/${id ?? "…"}.${collection.format}`;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function save() {
    startTransition(async () => {
      const result = await saveEntry(collection.key, id ?? null, values);
      if (!result.ok) {
        setErrors(result.errors ?? {});
        toast.error("Speichern fehlgeschlagen", { description: result.error });
        return;
      }
      setErrors({});
      setSaved(result.data.values);
      setValues(result.data.values);
      toast.success(`${collection.singular} gespeichert`, {
        description: "Die Änderung liegt im Entwurf und geht mit der nächsten Veröffentlichung live.",
      });
      if (isNew) router.replace(`${listHref}/${encodeURIComponent(result.data.id)}`);
      else router.refresh();
    });
  }

  function discard() {
    setValues(saved);
    setErrors({});
    setVersion((v) => v + 1);
    toast.success("Änderungen verworfen");
  }

  function remove() {
    if (!id) return;
    startTransition(async () => {
      const result = await deleteEntry(collection.key, id);
      if (!result.ok) return void toast.error("Löschen fehlgeschlagen", { description: result.error });
      setSaved(values);
      toast.success(`„${heading}“ in den Papierkorb verschoben`);
      router.push(listHref);
    });
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link href={listHref} className={buttonStyles({ variant: "secondary", size: "icon" })} aria-label={`Zurück zu ${collection.label}`}>
            <ArrowLeft />
          </Link>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm text-muted">{collection.label}</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{heading}</h1>
              {status && !dirty && <StatusBadge status={status} />}
              <span aria-live="polite">
                {dirty && (
                  <Badge tone="warning" dot>
                    Ungespeicherte Änderungen
                  </Badge>
                )}
              </span>
            </div>
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-3">
            {dirty && (
              <Button variant="ghost" onClick={() => setConfirmDiscard(true)} disabled={pending}>
                <Undo2 strokeWidth={1.75} />
                Verwerfen
              </Button>
            )}
            <Button onClick={save} disabled={pending || (!dirty && !isNew)}>
              {pending ? "Speichert…" : "Speichern"}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardContent className="py-6">
            {!canEdit && (
              <p className="mb-6 rounded-xl bg-subtle px-4 py-3 text-[15px] text-muted">
                Du kannst diesen Eintrag ansehen, aber nicht bearbeiten.
              </p>
            )}
            <fieldset key={version} disabled={!canEdit} className="min-w-0">
              <Fields
                fields={collection.fields}
                values={values}
                errors={errors}
                marks={config.marks}
                onChange={(name, value) => setValues((prev) => ({ ...prev, [name]: value }))}
              />
            </fieldset>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex items-start gap-3 py-4 text-sm text-muted">
              <FileText className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              <span>
                Wird als {collection.format === "md" ? "Markdown" : "JSON"}-Datei{" "}
                <span className="font-mono break-all text-foreground">{file}</span> gespeichert.
              </span>
            </CardContent>
          </Card>

          {!isNew && history && (
            <Card>
              <CardHeader
                title="Verlauf"
                action={
                  <Link
                    href={`/history?file=${encodeURIComponent(file)}`}
                    className={buttonStyles({ variant: "ghost", size: "sm", className: "-mt-1 -mr-2" })}
                  >
                    <History />
                    Alle
                  </Link>
                }
              />
              <CardContent className="pt-3">
                {history.length === 0 ? (
                  <p className="text-sm text-muted">Noch nicht gespeichert.</p>
                ) : (
                  <ol className="flex flex-col gap-4">
                    {history.slice(0, 6).map((h) => (
                      <li key={h.sha} className="flex gap-3">
                        <Avatar name={h.author} size="sm" />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-[15px] font-medium" title={h.message}>
                            {h.message}
                          </span>
                          <span className="truncate text-sm text-muted" title={h.when}>
                            {h.author} · {h.relative}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          )}

          {!isNew && canEdit && (
            <Button
              variant="secondary"
              className="text-danger hover:bg-danger-soft"
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
            >
              <Trash2 strokeWidth={1.75} />
              {collection.singular} löschen
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Änderungen verwerfen?"
        description="Alle Felder werden auf den zuletzt gespeicherten Stand zurückgesetzt."
        confirmLabel="Verwerfen"
        danger
        onConfirm={discard}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`„${heading}“ löschen?`}
        description="Der Eintrag wandert in den Papierkorb und lässt sich dort 30 Tage lang wiederherstellen."
        confirmLabel="Löschen"
        danger
        onConfirm={remove}
      />
    </>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { ArrowLeft, FileText, Undo2 } from "lucide-react";
import { ImageField } from "@/components/media/media-picker";
import { Button, buttonStyles } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, Card, CardContent, CardHeader } from "@/components/ui/display";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  collectionFolder,
  entryTitle,
  getCollection,
  getEntry,
  type Collection,
  type CollectionEntry,
  type CollectionField,
} from "@/lib/collections";

/** Form state: strings for every text-like field, booleans for switches. */
type FormValues = Record<string, string | boolean>;

function initialValues(collection: Collection, entry?: CollectionEntry): FormValues {
  return Object.fromEntries(
    collection.fields.map((field) => {
      const value = entry?.values[field.name];
      if (field.type === "boolean") return [field.name, value === true];
      if (field.type === "select" && value === undefined) return [field.name, field.options?.[0]?.value ?? ""];
      return [field.name, value === undefined ? "" : String(value)];
    }),
  );
}

/** "2026-11-21" ↔ local Date, without time zone shifts. */
function parseDate(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function serializeDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** An emptied rich text editor still reports an empty paragraph. */
function normalizeHtml(html: string) {
  return html === "<p></p>" ? "" : html;
}

function sameValues(a: FormValues, b: FormValues) {
  return Object.keys(a).every((key) => a[key] === b[key]);
}

/** Controlled variant of the design-system switch (same look as ui/toggles Switch). */
function FormSwitch({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6">
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-medium">{label}</span>
        {description && <span className="text-sm text-muted">{description}</span>}
      </span>
      <BaseSwitch.Root
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        className="relative mt-0.5 flex h-7 w-12 shrink-0 rounded-full bg-border-strong p-0.5 transition-colors outline-none focus-visible:ring-4 focus-visible:ring-accent/20 data-checked:bg-accent"
      >
        <BaseSwitch.Thumb className="size-6 rounded-full bg-white shadow-card transition-transform data-checked:translate-x-5" />
      </BaseSwitch.Root>
    </label>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: CollectionField;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  const label = field.required ? `${field.label} *` : field.label;
  const text = typeof value === "string" ? value : "";
  switch (field.type) {
    case "text":
    case "number":
      return (
        <Field>
          <Label>{label}</Label>
          {field.type === "number" ? (
            <div className="flex items-center gap-3">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={text}
                onChange={(e) => onChange(e.target.value)}
                className="max-w-48"
              />
              {field.suffix && <span className="text-[15px] text-muted">{field.suffix}</span>}
            </div>
          ) : (
            <Input required={field.required} value={text} onChange={(e) => onChange(e.target.value)} />
          )}
          {field.description && <Description>{field.description}</Description>}
        </Field>
      );
    case "textarea":
      return (
        <Field>
          <Label>{label}</Label>
          <Textarea rows={5} value={text} onChange={(e) => onChange(e.target.value)} />
          {field.description && <Description>{field.description}</Description>}
        </Field>
      );
    case "select":
      return (
        <div className="flex flex-col gap-2">
          <Select label={label} items={field.options ?? []} defaultValue={text || undefined} onValueChange={onChange} />
          {field.description && <p className="text-sm text-muted">{field.description}</p>}
        </div>
      );
    case "date":
      return (
        <div className="flex flex-col gap-2">
          <DatePicker label={label} value={parseDate(text)} onValueChange={(date) => onChange(serializeDate(date))} />
          {field.description && <p className="text-sm text-muted">{field.description}</p>}
        </div>
      );
    case "richtext":
      return <RichTextEditor label={label} defaultValue={text} onValueChange={(html) => onChange(normalizeHtml(html))} />;
    case "boolean":
      return (
        <FormSwitch
          label={field.label}
          description={field.description}
          checked={value === true}
          onCheckedChange={onChange}
        />
      );
    case "image":
      return (
        <ImageField
          label={label}
          description={field.description}
          aspect="aspect-[4/3]"
          value={text || undefined}
          onChange={(next) => onChange(next ?? "")}
        />
      );
  }
}

/**
 * Create / edit form generated from the collection's field schema, including the page header
 * with save actions. Pass `entryId` to edit an existing entry.
 */
export function CollectionForm({ slug, entryId }: { slug: string; entryId?: string }) {
  const collection = getCollection(slug);
  const entry = collection && entryId ? getEntry(collection, entryId) : undefined;
  const [saved, setSaved] = useState<FormValues>(() => (collection ? initialValues(collection, entry) : {}));
  const [values, setValues] = useState<FormValues>(saved);
  // Bumped on discard so uncontrolled controls (select, rich text) remount with the saved values.
  const [version, setVersion] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (!collection) return null;

  const dirty = !sameValues(values, saved);
  const titleValue = values[collection.titleField];
  const heading = entry
    ? (typeof titleValue === "string" && titleValue.trim()) || entryTitle(collection, entry)
    : "Neuer Eintrag";

  const mainFields = collection.fields.filter((field) => field.type !== "boolean" && field.type !== "image");
  const imageFields = collection.fields.filter((field) => field.type === "image");
  const optionFields = collection.fields.filter((field) => field.type === "boolean");

  function save(asDraft = false) {
    setSaved(values);
    toast.success(asDraft ? "Entwurf gespeichert" : `${collection!.singular} gespeichert`, {
      description: "Die Änderung liegt im Entwurf und geht mit der nächsten Veröffentlichung live.",
    });
  }

  function discard() {
    setValues(saved);
    setVersion((v) => v + 1);
    toast.success("Änderungen verworfen");
  }

  const control = (field: CollectionField) => (
    <FieldControl
      key={field.name}
      field={field}
      value={values[field.name]}
      onChange={(value) => setValues((prev) => ({ ...prev, [field.name]: value }))}
    />
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href={`/collections/${collection.slug}`}
            className={buttonStyles({ variant: "secondary", size: "icon" })}
            aria-label={`Zurück zu ${collection.name}`}
          >
            <ArrowLeft />
          </Link>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm text-muted">{collection.name}</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{heading}</h1>
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
        <div className="flex flex-wrap gap-3">
          {dirty && (
            <Button variant="ghost" onClick={() => setConfirmDiscard(true)}>
              <Undo2 strokeWidth={1.75} />
              Änderungen verwerfen
            </Button>
          )}
          {!entry && (
            <Button variant="secondary" onClick={() => save(true)}>
              Als Entwurf speichern
            </Button>
          )}
          <Button onClick={() => save()}>Speichern</Button>
        </div>
      </div>

      <div key={version} className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardContent className="flex flex-col gap-6 py-6">{mainFields.map(control)}</CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          {imageFields.length > 0 && (
            <Card>
              <CardHeader title={imageFields.length > 1 ? "Bilder" : imageFields[0].label} />
              <CardContent className="flex flex-col gap-6 pt-4">{imageFields.map(control)}</CardContent>
            </Card>
          )}
          {optionFields.length > 0 && (
            <Card>
              <CardHeader title="Optionen" />
              <CardContent className="flex flex-col gap-6">{optionFields.map(control)}</CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="flex items-start gap-3 py-4 text-sm text-muted">
              <FileText className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              <span>
                Wird als {collection.format === "md" ? "Markdown" : "JSON"}-Datei in{" "}
                <span className="font-mono break-all text-foreground">
                  {collectionFolder(collection)}
                  {entry && `/${entry.id}.${collection.format}`}
                </span>{" "}
                gespeichert.
              </span>
            </CardContent>
          </Card>
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
    </>
  );
}

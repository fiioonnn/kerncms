"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { ImageField } from "@/components/media/media-picker";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { LinkField } from "@/components/ui/link-field";
import { Tooltip } from "@/components/ui/overlay";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { Switch } from "@/components/ui/toggles";
import type { FieldDef, LinkValue, MarkDef } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { InlineEditor } from "./inline-editor";
import { useOptionalKern } from "./kern-provider";
import { defaultMarks } from "./marks";

type Values = Record<string, unknown>;

function toDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return undefined;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function stripHtml(value: unknown) {
  return typeof value === "string" ? value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}

/** Empty value for a field, used when adding list items or new entries. */
export function emptyValue(field: FieldDef): unknown {
  if (field.default !== undefined) return structuredClone(field.default);
  switch (field.type) {
    case "boolean":
      return false;
    case "number":
      return null;
    case "tags":
    case "list":
      return [];
    case "link":
      return { type: "page", path: "/" } satisfies LinkValue;
    case "select":
      return field.options?.[0]?.value ?? "";
    default:
      return "";
  }
}

export function emptyValues(fields: FieldDef[]) {
  return Object.fromEntries(fields.map((f) => [f.name, emptyValue(f)]));
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

function ErrorText({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-sm font-medium text-danger">{error}</p>;
}

/* ---------- Single field ---------- */

export function FieldInput({
  field,
  value,
  onChange,
  error,
  marks: marksProp,
  compact,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  marks?: MarkDef[];
  /** Narrow layout, e.g. the editor sidebar. */
  compact?: boolean;
}) {
  const id = useId();
  const kern = useOptionalKern();
  const marks = marksProp ?? kern?.config.marks ?? defaultMarks;
  const label = field.label + (field.required ? " *" : "");

  switch (field.type) {
    case "boolean":
      return (
        <Switch
          label={field.label}
          description={field.description}
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(checked)}
        />
      );

    case "select":
      return (
        <div className="flex flex-col gap-2">
          <Select
            label={label}
            items={field.options ?? []}
            value={typeof value === "string" && value ? value : null}
            onValueChange={(next) => onChange(next)}
          />
          {field.description && <Hint>{field.description}</Hint>}
          <ErrorText error={error} />
        </div>
      );

    case "date":
      return (
        <div className="flex flex-col gap-2">
          <DatePicker label={label} value={toDate(value)} onValueChange={(date) => onChange(fromDate(date))} />
          {field.description && <Hint>{field.description}</Hint>}
          <ErrorText error={error} />
        </div>
      );

    case "image":
      return (
        <div className="flex flex-col gap-2">
          <ImageField
            label={label}
            description={field.description}
            value={typeof value === "string" && value ? value : undefined}
            onChange={(next) => onChange(next ?? "")}
          />
          <ErrorText error={error} />
        </div>
      );

    case "link":
      return (
        <div className="flex flex-col gap-2">
          <LinkField
            label={label}
            description={field.description}
            value={(value as LinkValue) ?? { type: "page", path: "/" }}
            onChange={(next) => onChange(next)}
          />
          <ErrorText error={error} />
        </div>
      );

    case "tags":
      return (
        <div className="flex flex-col gap-2">
          <TagInput
            label={label}
            description={field.description}
            defaultValue={Array.isArray(value) ? (value as string[]) : []}
            onValueChange={(tags) => onChange(tags)}
          />
          <ErrorText error={error} />
        </div>
      );

    case "richtext":
      return (
        <div className="flex flex-col gap-2">
          <RichTextEditor
            label={label}
            defaultValue={typeof value === "string" ? value : ""}
            onValueChange={(html) => onChange(html)}
            marks={marks}
            compact={compact}
          />
          {field.description && <Hint>{field.description}</Hint>}
          <ErrorText error={error} />
        </div>
      );

    case "inline":
      return (
        <div className="flex flex-col gap-2">
          <label htmlFor={id} className="text-[15px] font-medium">
            {label}
          </label>
          <InlineEditor
            id={id}
            label={field.label}
            defaultValue={typeof value === "string" ? value : ""}
            onValueChange={(html) => onChange(html)}
            marks={marks}
            invalid={Boolean(error)}
          />
          {field.description && <Hint>{field.description}</Hint>}
          <ErrorText error={error} />
        </div>
      );

    case "list":
      return <ListInput field={field} value={value} onChange={onChange} error={error} marks={marks} compact={compact} />;

    case "blocks":
      return null;

    case "textarea":
      return (
        <Field invalid={Boolean(error)}>
          <Label>{label}</Label>
          <Textarea
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            rows={compact ? 3 : 4}
            aria-invalid={Boolean(error) || undefined}
          />
          {field.description && <Description>{field.description}</Description>}
          <ErrorText error={error} />
        </Field>
      );

    case "number":
      return (
        <Field invalid={Boolean(error)}>
          <Label>{label}</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              inputMode="decimal"
              value={value === null || value === undefined ? "" : String(value)}
              min={field.min}
              max={field.max}
              onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
              className={field.suffix ? "max-w-40" : undefined}
            />
            {field.suffix && <span className="text-[15px] text-muted">{field.suffix}</span>}
          </div>
          {field.description && <Description>{field.description}</Description>}
          <ErrorText error={error} />
        </Field>
      );

    default:
      return (
        <Field invalid={Boolean(error)}>
          <Label>{label}</Label>
          <Input
            type={field.type === "email" ? "email" : "text"}
            value={typeof value === "string" ? value : value === undefined || value === null ? "" : String(value)}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.description && <Description>{field.description}</Description>}
          <ErrorText error={error} />
        </Field>
      );
  }
}

/* ---------- Repeatable list of items ---------- */

function itemTitle(field: FieldDef, item: Values, index: number) {
  const key = field.itemLabel ?? field.fields?.find((f) => ["text", "inline", "textarea"].includes(f.type))?.name;
  const text = key ? stripHtml(item[key]) : "";
  return text || `Eintrag ${index + 1}`;
}

function ListInput({
  field,
  value,
  onChange,
  error,
  marks,
  compact,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  marks: MarkDef[];
  compact?: boolean;
}) {
  const items = Array.isArray(value) ? (value as Values[]) : [];
  const [open, setOpen] = useState<number | null>(items.length === 1 ? 0 : null);
  // Stable keys so editors keep their state while items move.
  const [keys, setKeys] = useState(() => items.map(() => crypto.randomUUID()));
  const itemKeys = keys.length === items.length ? keys : items.map((_, i) => keys[i] ?? `${i}-${items.length}`);
  const subFields = field.fields ?? [];

  function update(next: Values[], nextKeys: string[]) {
    setKeys(nextKeys);
    onChange(next);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const nextKeys = [...itemKeys];
    [next[index], next[target]] = [next[target], next[index]];
    [nextKeys[index], nextKeys[target]] = [nextKeys[target], nextKeys[index]];
    update(next, nextKeys);
    if (open === index) setOpen(target);
  }

  /** Moves the item at `from` so it lands before the item that was at `to` (to = length: the end). */
  function moveTo(from: number, to: number) {
    const dest = to > from ? to - 1 : to;
    if (dest === from) return;
    const next = [...items];
    const nextKeys = [...itemKeys];
    const [item] = next.splice(from, 1);
    const [key] = nextKeys.splice(from, 1);
    next.splice(dest, 0, item);
    nextKeys.splice(dest, 0, key);
    update(next, nextKeys);
    if (open !== null) setOpen(nextKeys.indexOf(itemKeys[open]));
  }

  // Dragging starts only from the grip, so text in an open item stays selectable.
  const [armed, setArmed] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number; edge: "before" | "after" } | null>(null);
  const endDrag = () => {
    setArmed(null);
    setDrag(null);
  };

  return (
    <div role="group" aria-label={field.label} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-medium">
          {field.label}
          <span className="ml-2 text-sm font-normal text-muted">{items.length}</span>
        </span>
      </div>
      {field.description && <Hint>{field.description}</Hint>}
      <div className="flex flex-col gap-2">
        {items.map((item, index) => {
          const isOpen = open === index;
          const line = drag && drag.over === index && drag.from !== index ? drag.edge : null;
          return (
            <div
              key={itemKeys[index]}
              draggable={armed === index}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(index));
                setDrag({ from: index, over: index, edge: "before" });
              }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const rect = e.currentTarget.getBoundingClientRect();
                const edge = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                if (drag.over !== index || drag.edge !== edge) setDrag({ ...drag, over: index, edge });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag) moveTo(drag.from, drag.edge === "before" ? drag.over : drag.over + 1);
                endDrag();
              }}
              onDragEnd={endDrag}
              className={cn(
                "relative rounded-xl border bg-surface",
                isOpen ? "border-border-strong" : "border-border",
                drag?.from === index && "opacity-40",
              )}
            >
              {line && (
                <span
                  aria-hidden
                  className={cn("pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-accent", line === "before" ? "-top-[5px]" : "-bottom-[5px]")}
                />
              )}
              <div className="flex items-center gap-1 py-1 pr-1 pl-1">
                <span
                  aria-hidden
                  onPointerDown={() => setArmed(index)}
                  onPointerUp={() => !drag && setArmed(null)}
                  className="flex h-10 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-muted/60 hover:bg-subtle hover:text-muted active:cursor-grabbing"
                >
                  <GripVertical className="size-4" />
                </span>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : index)}
                  className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="truncate">{itemTitle(field, item, index)}</span>
                  <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
                </button>
                <Tooltip label="Nach oben">
                  <Button variant="ghost" size="icon" className="size-9" aria-label="Nach oben" disabled={index === 0} onClick={() => move(index, -1)}>
                    <ChevronUp />
                  </Button>
                </Tooltip>
                <Tooltip label="Nach unten">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label="Nach unten"
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown />
                  </Button>
                </Tooltip>
                <Tooltip label="Duplizieren">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label="Duplizieren"
                    onClick={() => {
                      const next = [...items];
                      next.splice(index + 1, 0, structuredClone(item));
                      const nextKeys = [...itemKeys];
                      nextKeys.splice(index + 1, 0, crypto.randomUUID());
                      update(next, nextKeys);
                      setOpen(index + 1);
                    }}
                  >
                    <Copy />
                  </Button>
                </Tooltip>
                <Tooltip label="Entfernen">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 text-danger hover:text-danger"
                    aria-label="Entfernen"
                    onClick={() => {
                      update(
                        items.filter((_, i) => i !== index),
                        itemKeys.filter((_, i) => i !== index),
                      );
                      setOpen(null);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </Tooltip>
              </div>
              {isOpen && (
                <div className="flex flex-col gap-5 border-t border-border p-4">
                  {subFields.map((sub) => (
                    <FieldInput
                      key={sub.name}
                      field={sub}
                      value={item[sub.name]}
                      marks={marks}
                      compact={compact}
                      onChange={(v) => {
                        const next = [...items];
                        next[index] = { ...item, [sub.name]: v };
                        onChange(next);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => {
          update([...items, emptyValues(subFields)], [...itemKeys, crypto.randomUUID()]);
          setOpen(items.length);
        }}
      >
        <Plus />
        Eintrag hinzufügen
      </Button>
      <ErrorText error={error} />
    </div>
  );
}

/* ---------- A whole form ---------- */

export function Fields({
  fields,
  values,
  onChange,
  errors,
  marks,
  compact,
  className,
}: {
  fields: FieldDef[];
  values: Values;
  onChange: (name: string, value: unknown) => void;
  errors?: Record<string, string>;
  marks?: MarkDef[];
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {fields
        .filter((f) => f.type !== "blocks")
        .map((field) => (
          <FieldInput
            key={field.name}
            field={field}
            value={values[field.name]}
            onChange={(v) => onChange(field.name, v)}
            error={errors?.[field.name]}
            marks={marks}
            compact={compact}
          />
        ))}
    </div>
  );
}

"use client";

import { useState, useRef, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useProjects } from "@/components/project-context";

// Lazy import to avoid circular dependency
import { FieldRenderer } from "../FieldRenderer";

interface FieldProps {
  value: Record<string, unknown>[];
  onChange: (value: Record<string, unknown>[]) => void;
  schema?: Record<string, unknown>[];
  label?: string;
  disabled?: boolean;
}

const TITLE_KEYS = ["title", "name", "label", "heading", "headline", "question", "text", "caption", "quote"];

function plain(v: unknown) {
  return typeof v === "string" ? v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}

/** The most recognisable text of an entry, for its collapsed header. */
function itemTitle(item: Record<string, unknown>, schema: Record<string, unknown>) {
  for (const key of TITLE_KEYS) {
    const v = plain(item[key]);
    if (v) return v;
  }
  for (const [key, type] of Object.entries(schema)) {
    if (type === "image") continue;
    const v = plain(item[key]);
    if (v) return v;
  }
  return "";
}

function itemImage(item: Record<string, unknown>, schema: Record<string, unknown>) {
  const key = Object.keys(schema).find((k) => schema[k] === "image" && typeof item[k] === "string" && item[k]);
  return key ? (item[key] as string) : null;
}

function imageSrc(value: string, siteUrl?: string) {
  if (!value.startsWith("/") || value.startsWith("/api/") || !siteUrl) return value;
  try { return new URL(value, /^https?:\/\//.test(siteUrl) ? siteUrl : `https://${siteUrl}`).href; } catch { return value; }
}

function SortableCard({
  id,
  index,
  item,
  schema,
  defaultOpen,
  onItemChange,
  onRemove,
  onDuplicate,
  disabled,
}: {
  id: string;
  index: number;
  item: Record<string, unknown>;
  schema: Record<string, unknown>;
  defaultOpen?: boolean;
  onItemChange: (item: Record<string, unknown>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { current } = useProjects();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const title = itemTitle(item, schema);
  const image = itemImage(item, schema);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition: isDragging ? undefined : transition }}
      className={`group/item rounded-lg border overflow-hidden transition-colors ${open ? "border-foreground/20" : "border-input"} ${isDragging ? "opacity-50 z-10" : ""}`}
    >
      <div className="flex items-center gap-2 px-2.5 py-2 bg-muted/20">
        {!disabled && (
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
              <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground">{index + 1}</span>
          {image && <img src={imageSrc(image, current?.url)} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />}
          <span className={`truncate text-sm ${title ? "font-medium" : "italic text-muted-foreground"}`}>{title || "Untitled"}</span>
        </button>
        {confirmDelete ? (
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-xs text-muted-foreground">Delete?</span>
            <button type="button" onClick={onRemove} className="rounded px-1.5 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10">Delete</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
          </div>
        ) : (
          <>
            {!disabled && (
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100 focus-within:opacity-100">
                <button type="button" onClick={onDuplicate} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="Duplicate" aria-label="Duplicate item">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                </button>
                <button type="button" onClick={() => setConfirmDelete(true)} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete" aria-label="Delete item">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                </button>
              </div>
            )}
            <button type="button" onClick={() => setOpen(!open)} className="shrink-0 text-muted-foreground" aria-label={open ? "Collapse" : "Expand"}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-4 p-3 border-t border-input">
          {Object.keys(schema).length === 0 && (
            <p className="text-xs text-muted-foreground">This list has no fields yet. Turn on “Edit structure” to add some.</p>
          )}
          {Object.entries(schema).map(([key, schemaValue]) => (
            <FieldRenderer
              key={key}
              fieldKey={key}
              value={item[key]}
              schemaValue={schemaValue}
              onChange={(v) => onItemChange({ ...item, [key]: v })}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function RepeaterField({ value, onChange, schema, label, disabled }: FieldProps) {
  const items = value ?? [];
  const fieldSchema = (schema?.[0] ?? {}) as Record<string, unknown>;
  const counterRef = useRef(0);
  const [ids, setIds] = useState<string[]>(() =>
    items.map(() => `rep-${counterRef.current++}`)
  );
  // Entries created in this session start expanded.
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  if (ids.length !== items.length) {
    const next = [...ids];
    while (next.length < items.length) next.push(`rep-${counterRef.current++}`);
    if (next.length > items.length) next.length = items.length;
    setIds(next);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    setIds(arrayMove(ids, oldIndex, newIndex));
    onChange(arrayMove([...items], oldIndex, newIndex));
  }, [ids, items, onChange]);

  function createEmpty(): Record<string, unknown> {
    const empty: Record<string, unknown> = {};
    for (const [key, schemaVal] of Object.entries(fieldSchema)) {
      if (schemaVal === "text" || schemaVal === "textarea" || schemaVal === "richtext") empty[key] = "";
      else if (schemaVal === "number") empty[key] = 0;
      else if (schemaVal === "boolean") empty[key] = false;
      else if (Array.isArray(schemaVal)) empty[key] = [];
      else empty[key] = "";
    }
    return empty;
  }

  function insertAt(index: number, entry: Record<string, unknown>) {
    const id = `rep-${counterRef.current++}`;
    setIds((prev) => [...prev.slice(0, index), id, ...prev.slice(index)]);
    setFresh((prev) => new Set(prev).add(id));
    onChange([...items.slice(0, index), entry, ...items.slice(index)]);
  }

  const handleRemove = useCallback((index: number) => {
    setIds((prev) => prev.filter((_, i) => i !== index));
    const next = [...items];
    next.splice(index, 1);
    onChange(next);
  }, [items, onChange]);

  const addButton = !disabled && (
    <button
      type="button"
      onClick={() => insertAt(items.length, createEmpty())}
      className="flex items-center gap-1.5 rounded-md border border-dashed border-input px-2.5 py-1.5 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors self-start"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" />
      </svg>
      Add item
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      {items.length === 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-input px-3 py-3">
          <span className="text-xs text-muted-foreground">No items yet.</span>
          {addButton}
        </div>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {items.map((item, i) => (
                  <SortableCard
                    key={ids[i]}
                    id={ids[i]}
                    index={i}
                    item={item}
                    schema={fieldSchema}
                    defaultOpen={fresh.has(ids[i])}
                    onItemChange={(updated) => { const next = [...items]; next[i] = updated; onChange(next); }}
                    onRemove={() => handleRemove(i)}
                    onDuplicate={() => insertAt(i + 1, JSON.parse(JSON.stringify(item)))}
                    disabled={disabled}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {addButton}
        </>
      )}
    </div>
  );
}

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

// Lazy import to avoid circular dependency
import { FieldRenderer } from "../FieldRenderer";

interface FieldProps {
  value: Record<string, unknown>[];
  onChange: (value: Record<string, unknown>[]) => void;
  schema?: Record<string, unknown>[];
  label?: string;
  disabled?: boolean;
}

function SortableCard({
  id,
  item,
  schema,
  onItemChange,
  onRemove,
  disabled,
}: {
  id: string;
  item: Record<string, unknown>;
  schema: Record<string, unknown>;
  onItemChange: (item: Record<string, unknown>) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const firstValue = Object.values(item)[0];
  const preview = typeof firstValue === "string" ? firstValue : JSON.stringify(firstValue);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition: isDragging ? undefined : transition }}
      className={`rounded-lg border border-input overflow-hidden ${isDragging ? "opacity-50 z-10" : ""}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/20">
        {!disabled && (
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground"
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
          className="flex-1 text-left text-sm font-medium truncate"
        >
          {preview || "Empty"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-muted-foreground"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {!disabled && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" />
            </svg>
          </button>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-4 p-3 border-t border-input">
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
  const fieldSchema = schema?.[0] ?? {};
  const counterRef = useRef(0);
  const [ids, setIds] = useState<string[]>(() =>
    items.map(() => `rep-${counterRef.current++}`)
  );

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
      else empty[key] = "";
    }
    return empty;
  }

  const handleAdd = useCallback(() => {
    setIds((prev) => [...prev, `rep-${counterRef.current++}`]);
    onChange([...items, createEmpty()]);
  }, [items, onChange]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemove = useCallback((index: number) => {
    setIds((prev) => prev.filter((_, i) => i !== index));
    const next = [...items];
    next.splice(index, 1);
    onChange(next);
  }, [items, onChange]);

  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {items.map((item, i) => (
              <SortableCard
                key={ids[i]}
                id={ids[i]}
                item={item}
                schema={fieldSchema as Record<string, unknown>}
                onItemChange={(updated) => { const next = [...items]; next[i] = updated; onChange(next); }}
                onRemove={() => handleRemove(i)}
                disabled={disabled}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {!disabled && (
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors self-start"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" />
          </svg>
          Add entry
        </button>
      )}
    </div>
  );
}

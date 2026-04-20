"use client";

import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
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

interface FieldProps {
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
  disabled?: boolean;
}

function SortableItem({
  id,
  value,
  onValueChange,
  onRemove,
  disabled,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition: isDragging ? undefined : transition }}
      className={`flex items-center gap-1.5 ${isDragging ? "opacity-50 z-10" : ""}`}
    >
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
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={disabled}
        className="flex-1"
      />
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function ListField({ value, onChange, label, disabled }: FieldProps) {
  const items = value ?? [];
  const counterRef = useRef(0);
  const [ids, setIds] = useState<string[]>(() =>
    items.map(() => `item-${counterRef.current++}`)
  );

  // Sync ids length with items when parent adds/removes outside of our handlers
  if (ids.length !== items.length) {
    const next = [...ids];
    while (next.length < items.length) next.push(`item-${counterRef.current++}`);
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

  const handleAdd = useCallback(() => {
    setIds((prev) => [...prev, `item-${counterRef.current++}`]);
    onChange([...items, ""]);
  }, [items, onChange]);

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
          <div className="flex flex-col gap-1.5">
            {items.map((item, i) => (
              <SortableItem
                key={ids[i]}
                id={ids[i]}
                value={item}
                onValueChange={(v) => { const next = [...items]; next[i] = v; onChange(next); }}
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
          Add item
        </button>
      )}
    </div>
  );
}

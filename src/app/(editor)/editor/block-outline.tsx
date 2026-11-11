"use client";

import { useState } from "react";
import { Copy, GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { blockMeta, blockSummary, type Block } from "./blocks";

type DropTarget = { index: number; edge: "before" | "after" };

/** Outline of all blocks: click to select, drag to reorder, duplicate or remove per row. */
export function BlockOutline({
  blocks,
  selectedId,
  onSelect,
  onOpen,
  onMove,
  onDuplicate,
  onRemove,
}: {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Double click: select and show the block's properties. */
  onOpen: (id: string) => void;
  /** Moves a block so it ends up at `toIndex` of the list before the move. */
  onMove: (id: string, toIndex: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);

  const endDrag = () => {
    setDragId(null);
    setTarget(null);
  };

  if (blocks.length === 0) {
    return <p className="px-2 py-10 text-center text-[15px] text-muted">Noch keine Blöcke auf dieser Seite.</p>;
  }

  return (
    <ul
      className="flex flex-col gap-1"
      onDragOver={(e) => {
        if (dragId) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTarget(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (dragId && target) onMove(dragId, target.edge === "before" ? target.index : target.index + 1);
        endDrag();
      }}
    >
      {blocks.map((block, index) => {
        const meta = blockMeta[block.type];
        const selected = block.id === selectedId;
        const showBefore = dragId && target?.index === index && target.edge === "before";
        const showAfter = dragId && target?.index === index && target.edge === "after";

        return (
          <li
            key={block.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", block.id);
              setDragId(block.id);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const rect = e.currentTarget.getBoundingClientRect();
              const edge = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
              if (target?.index !== index || target.edge !== edge) setTarget({ index, edge });
            }}
            onDragEnd={endDrag}
            className="relative"
          >
            {(showBefore || showAfter) && (
              <span
                className={cn(
                  "pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-accent",
                  showBefore ? "-top-[3px]" : "-bottom-[3px]",
                )}
              />
            )}
            <div
              className={cn(
                "flex h-16 items-center gap-1 rounded-xl pr-1.5 pl-1 transition-colors",
                selected ? "bg-accent-soft" : "hover:bg-subtle",
                dragId === block.id && "opacity-40",
              )}
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-muted active:cursor-grabbing" strokeWidth={1.75} />
              <button
                type="button"
                onClick={() => onSelect(block.id)}
                onDoubleClick={() => onOpen(block.id)}
                aria-current={selected || undefined}
                className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-lg pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                    selected ? "border-accent/20 bg-surface text-accent" : "border-border bg-surface text-foreground",
                  )}
                >
                  <meta.icon className="size-[18px]" strokeWidth={1.75} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-medium">{meta.label}</span>
                  <span className="truncate text-sm text-muted">{blockSummary(block)}</span>
                </span>
              </button>
              <Tooltip label="Duplizieren">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${meta.label} duplizieren`}
                  onClick={() => onDuplicate(block.id)}
                  className="size-9 rounded-lg text-muted hover:text-foreground [&_svg]:size-[18px]"
                >
                  <Copy strokeWidth={1.75} />
                </Button>
              </Tooltip>
              <Tooltip label="Entfernen">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${meta.label} entfernen`}
                  onClick={() => onRemove(block.id)}
                  className="size-9 rounded-lg text-muted hover:bg-danger-soft hover:text-danger [&_svg]:size-[18px]"
                >
                  <Trash2 strokeWidth={1.75} />
                </Button>
              </Tooltip>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import type { BlockData, BlockDef } from "@/lib/kern-types";
import { BlockIcon } from "./block-icons";
import { blockSummary } from "./paths";

type DropTarget = { index: number; edge: "before" | "after" };

/** Focuses the select button of a block's row (after React has moved it). */
function focusRow(id: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-outline-id="${id}"]`)?.focus());
}

const rowButton = "size-9 rounded-lg text-muted hover:text-foreground [&_svg]:size-[18px]";

/**
 * Outline of all blocks: click to select, drag to reorder, duplicate or remove
 * per row. Keyboard: Alt+ArrowUp / Alt+ArrowDown moves the focused block.
 */
export function BlockOutline({
  blocks,
  defs,
  selectedId,
  onSelect,
  onOpen,
  onMove,
  onDuplicate,
  onRemove,
}: {
  blocks: BlockData[];
  defs: Map<string, BlockDef>;
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
  const [announcement, setAnnouncement] = useState("");

  /** Moves the block at `index` one step up (-1) or down (+1) and announces it. */
  const step = (index: number, direction: -1 | 1) => {
    const block = blocks[index];
    const to = index + direction;
    if (!block || to < 0 || to >= blocks.length) return;
    onMove(block.id, direction < 0 ? to : to + 1);
    setAnnouncement(`${defs.get(block.type)?.label ?? block.type} nach Position ${to + 1} von ${blocks.length} verschoben`);
    focusRow(block.id);
  };

  const endDrag = () => {
    setDragId(null);
    setTarget(null);
  };

  const live = (
    <p role="status" aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );

  if (blocks.length === 0) {
    return (
      <>
        <p className="px-2 py-10 text-center text-[15px] text-muted">Noch keine Blöcke auf dieser Seite.</p>
        {live}
      </>
    );
  }

  return (
    <>
      <ul
        aria-label="Blöcke der Seite"
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
          const def = defs.get(block.type);
          const meta = { label: def?.label ?? block.type };
          const summary = blockSummary(block, def);
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
              onKeyDown={(e) => {
                if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                e.preventDefault();
                step(index, e.key === "ArrowUp" ? -1 : 1);
              }}
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
                <GripVertical aria-hidden className="size-4 shrink-0 cursor-grab text-muted active:cursor-grabbing" strokeWidth={1.75} />
                <button
                  type="button"
                  data-outline-id={block.id}
                  onClick={() => onSelect(block.id)}
                  onDoubleClick={() => onOpen(block.id)}
                  aria-current={selected || undefined}
                  aria-label={`${meta.label}, Position ${index + 1} von ${blocks.length}: ${summary}`}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                  className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-lg pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                      selected ? "border-accent/20 bg-surface text-accent" : "border-border bg-surface text-foreground",
                    )}
                  >
                    <BlockIcon name={def?.icon} className="size-[18px]" strokeWidth={1.75} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px] font-medium">{meta.label}</span>
                    <span className="truncate text-sm text-muted">{summary}</span>
                  </span>
                </button>
                <Tooltip label="Nach oben">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${meta.label} nach oben`}
                    disabled={index === 0}
                    onClick={() => step(index, -1)}
                    className={rowButton}
                  >
                    <ArrowUp strokeWidth={1.75} />
                  </Button>
                </Tooltip>
                <Tooltip label="Nach unten">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${meta.label} nach unten`}
                    disabled={index === blocks.length - 1}
                    onClick={() => step(index, 1)}
                    className={rowButton}
                  >
                    <ArrowDown strokeWidth={1.75} />
                  </Button>
                </Tooltip>
                <Tooltip label="Duplizieren">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${meta.label} duplizieren`}
                    onClick={() => onDuplicate(block.id)}
                    className={rowButton}
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
      {live}
    </>
  );
}

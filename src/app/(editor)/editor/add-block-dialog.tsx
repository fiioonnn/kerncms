"use client";

import { Plus } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { BlockDef } from "@/lib/kern-types";
import { BlockIcon } from "./block-icons";

function BlockChoice({ def, onAdd }: { def: BlockDef; onAdd: (def: BlockDef) => void }) {
  return (
    <DialogClose
      onClick={() => onAdd(def)}
      className="flex items-start gap-4 rounded-xl border border-border p-4 text-left transition-colors outline-none hover:border-accent hover:bg-accent-soft/50 focus-visible:ring-4 focus-visible:ring-accent/15"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-foreground">
        <BlockIcon name={def.icon} className="size-5" strokeWidth={1.75} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-base font-medium">{def.label}</span>
        {def.description && <span className="text-sm text-muted">{def.description}</span>}
      </span>
    </DialogClose>
  );
}

/** Lists the blocks from kern.config.yaml; the chosen one is added below the selected block (or at the end). */
export function AddBlockDialog({
  blocks,
  onAdd,
  className,
  disabled,
}: {
  blocks: BlockDef[];
  onAdd: (def: BlockDef) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger disabled={disabled} className={buttonStyles({ variant: "secondary", className })}>
        <Plus />
        Block hinzufügen
      </DialogTrigger>
      <DialogContent title="Block hinzufügen" description="Der neue Block erscheint unter dem ausgewählten Block." size="lg">
        {blocks.length === 0 ? (
          <p className="text-[15px] text-muted">In der kern.config.yaml sind keine Blöcke definiert.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {blocks.map((def) => (
              <BlockChoice key={def.type} def={def} onAdd={onAdd} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

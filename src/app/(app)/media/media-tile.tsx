"use client";

import { useState } from "react";
import { ImageEditor } from "@/components/media/image-editor";
import { SampleImage } from "@/components/media/sample-image";

export function MediaTile({ name, size }: { name: string; size: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-card transition-shadow outline-none hover:shadow-popover focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="aspect-[4/3] w-full overflow-hidden">
          <SampleImage name={name} className="size-full transition-transform duration-300 group-hover:scale-105" />
        </div>
        <div className="flex flex-col px-4 py-3">
          <span className="truncate text-[15px] font-medium">{name}</span>
          <span className="text-sm text-muted">{size}</span>
        </div>
      </button>
      <ImageEditor name={name} size={size} open={open} onOpenChange={setOpen} />
    </>
  );
}

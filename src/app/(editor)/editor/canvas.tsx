"use client";

import { ImageIcon, Monitor, Plus, Smartphone, Tablet } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describeLink } from "@/components/ui/link-field";
import { toast } from "@/components/ui/toast";
import { SampleImage } from "@/components/media/sample-image";
import { cn } from "@/lib/utils";
import {
  addableBlockTypes,
  blockMeta,
  marks,
  splitHeadline,
  type Block,
  type BlockType,
  type CategoriesBlock,
  type GalleryBlock,
  type HeroBlock,
  type QuoteBlock,
  type TextBlock,
} from "./blocks";
import { Editable, readHeadline, readText } from "./editable";

export const devices = [
  { value: "desktop", label: "Desktop", icon: Monitor, width: undefined },
  { value: "tablet", label: "Tablet", icon: Tablet, width: 820 },
  { value: "mobile", label: "Smartphone", icon: Smartphone, width: 390 },
];

/* ---------- Add block ---------- */

export function AddBlockDialog({ onAdd, className }: { onAdd: (type: BlockType) => void; className?: string }) {
  return (
    <Dialog>
      <DialogTrigger className={buttonStyles({ variant: "secondary", className })}>
        <Plus />
        Block hinzufügen
      </DialogTrigger>
      <DialogContent title="Block hinzufügen" description="Wähle, was unter dem letzten Block erscheinen soll." size="lg">
        <div className="grid gap-3 sm:grid-cols-2">
          {addableBlockTypes.map((type) => {
            const meta = blockMeta[type];
            return (
              <DialogClose
                key={type}
                onClick={() => {
                  onAdd(type);
                  toast.success(`Block „${meta.label}“ hinzugefügt`);
                }}
                className="flex items-start gap-4 rounded-xl border border-border p-4 text-left transition-colors outline-none hover:border-accent hover:bg-accent-soft/50 focus-visible:ring-4 focus-visible:ring-accent/15"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-foreground">
                  <meta.icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-base font-medium">{meta.label}</span>
                  <span className="text-sm text-muted">{meta.description}</span>
                </span>
              </DialogClose>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Block views ---------- */

type ViewProps<B extends Block> = {
  block: B;
  selected: boolean;
  narrow: boolean;
  onChange: (patch: Partial<B>) => void;
  onDirty: () => void;
};

function HeroView({ block, selected, narrow, onChange, onDirty }: ViewProps<HeroBlock>) {
  const markClass = marks.find((m) => m.id === block.mark)!.className;
  const parts = splitHeadline(block.headline, block.highlight);
  const dark = Boolean(block.image);
  const center = block.layout === "center";

  return (
    <div className={cn("relative isolate overflow-hidden rounded-xl", narrow ? "px-5 py-10" : "px-9 py-16", dark && (narrow ? "py-16" : "py-24"), center && "text-center")}>
      {block.image && (
        <>
          <SampleImage name={block.image} className="absolute inset-0 -z-10" />
          <div className="absolute inset-0 -z-10 bg-neutral-950/55" />
        </>
      )}
      <Editable
        key={`${block.headline}|${block.highlight}|${block.mark}`}
        tag="h1"
        editable={selected}
        onDirty={onDirty}
        onCommit={(element) => {
          const next = readHeadline(element, block.highlight);
          if (next.headline !== block.headline || next.highlight !== block.highlight) onChange(next);
        }}
        className={cn(
          "max-w-3xl leading-tight font-bold tracking-tight",
          narrow ? "text-4xl" : "text-5xl",
          center && "mx-auto",
          dark && "text-white",
        )}
      >
        {parts ? (
          <>
            {parts.before}
            <span data-mark className={markClass}>
              {parts.marked}
            </span>
            {parts.after}
          </>
        ) : (
          block.headline
        )}
      </Editable>
      <Editable
        key={block.text}
        editable={selected}
        onDirty={onDirty}
        onCommit={(element) => {
          const text = readText(element);
          if (text !== block.text) onChange({ text });
        }}
        className={cn("mt-6 max-w-xl text-lg", center && "mx-auto", dark ? "text-white/80" : "text-neutral-500")}
      >
        {block.text}
      </Editable>
      <span
        title={describeLink(block.buttonLink)}
        className={cn(
          "mt-8 inline-flex h-12 items-center rounded-full px-6 text-[15px] font-medium",
          dark ? "bg-white text-neutral-900" : "bg-neutral-900 text-white",
        )}
      >
        {block.buttonLabel}
      </span>
    </div>
  );
}

function CategoriesView({ block, narrow }: ViewProps<CategoriesBlock>) {
  return (
    <div className={cn("grid gap-5", narrow ? "grid-cols-1 p-5" : "grid-cols-3 p-9")}>
      {block.tiles.map((tile, i) => (
        <div key={i} className="flex flex-col gap-3" title={describeLink(tile.link)}>
          {tile.image ? (
            <SampleImage name={tile.image} className="aspect-[4/3] rounded-xl" />
          ) : (
            <ImagePlaceholder />
          )}
          <span className="text-[15px] font-medium">{tile.title}</span>
        </div>
      ))}
    </div>
  );
}

function TextView({ block, selected, narrow, onChange, onDirty }: ViewProps<TextBlock>) {
  return (
    <div className={cn(narrow ? "px-5 py-8" : "px-9 py-12")}>
      <Editable
        key={block.heading}
        tag="h2"
        editable={selected}
        onDirty={onDirty}
        onCommit={(element) => {
          const heading = readText(element);
          if (heading !== block.heading) onChange({ heading });
        }}
        className={cn("max-w-2xl font-bold tracking-tight", narrow ? "text-2xl" : "text-3xl")}
      >
        {block.heading}
      </Editable>
      <Editable
        key={block.body}
        editable={selected}
        onDirty={onDirty}
        onCommit={(element) => {
          const body = readText(element);
          if (body !== block.body) onChange({ body });
        }}
        className="mt-4 max-w-2xl text-lg leading-relaxed text-neutral-600"
      >
        {block.body}
      </Editable>
    </div>
  );
}

const galleryColumns = { "2": "grid-cols-2", "3": "grid-cols-3", "4": "grid-cols-4" } as const;

function GalleryView({ block, narrow }: ViewProps<GalleryBlock>) {
  return (
    <div className={cn("grid gap-4", narrow ? "grid-cols-2 p-5" : cn(galleryColumns[block.columns], "p-9"))}>
      {block.images.length === 0 && (
        <div className="col-span-full flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 text-[15px] text-neutral-400">
          Noch keine Bilder
        </div>
      )}
      {block.images.map((image, i) =>
        image ? <SampleImage key={i} name={image} className="aspect-[4/3] rounded-xl" /> : <ImagePlaceholder key={i} />,
      )}
    </div>
  );
}

function QuoteView({ block, selected, narrow, onChange, onDirty }: ViewProps<QuoteBlock>) {
  return (
    <figure className={cn("flex flex-col items-center text-center", narrow ? "px-5 py-10" : "px-16 py-16")}>
      <span aria-hidden className="text-6xl leading-none font-bold text-neutral-300">„</span>
      <Editable
        key={block.text}
        tag="blockquote"
        editable={selected}
        onDirty={onDirty}
        onCommit={(element) => {
          const text = readText(element);
          if (text !== block.text) onChange({ text });
        }}
        className={cn("mt-2 max-w-2xl leading-snug font-medium tracking-tight", narrow ? "text-xl" : "text-2xl")}
      >
        {block.text}
      </Editable>
      <figcaption className="mt-6 flex flex-col gap-0.5 text-[15px]">
        <Editable
          key={block.author}
          tag="span"
          editable={selected}
          onDirty={onDirty}
          onCommit={(element) => {
            const author = readText(element);
            if (author !== block.author) onChange({ author });
          }}
          className="font-semibold"
        >
          {block.author}
        </Editable>
        {block.role && <span className="text-neutral-500">{block.role}</span>}
      </figcaption>
    </figure>
  );
}

function ImagePlaceholder() {
  return (
    <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
      <ImageIcon className="size-7" strokeWidth={1.5} />
    </div>
  );
}

function BlockView(props: ViewProps<Block>) {
  const { block } = props;
  switch (block.type) {
    case "hero":
      return <HeroView {...props} block={block} />;
    case "categories":
      return <CategoriesView {...props} block={block} />;
    case "text":
      return <TextView {...props} block={block} />;
    case "gallery":
      return <GalleryView {...props} block={block} />;
    case "quote":
      return <QuoteView {...props} block={block} />;
  }
}

/* ---------- Canvas ---------- */

export function Canvas({
  device,
  blocks,
  selectedId,
  onSelect,
  onChange,
  onDirty,
  onAdd,
}: {
  device: string;
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<Block>) => void;
  onDirty: () => void;
  onAdd: (type: BlockType) => void;
}) {
  const width = devices.find((d) => d.value === device)?.width;
  const narrow = device === "mobile";

  return (
    <div className={cn("flex-1 overflow-auto", width ? "bg-background p-8" : "bg-white")}>
      <div
        className={cn("mx-auto bg-white transition-[max-width] duration-300", width && "overflow-hidden rounded-2xl border border-border")}
        style={{ maxWidth: width ?? "100%" }}
      >
        <div className={cn("flex items-center justify-between border-b border-neutral-100 py-6", narrow ? "px-6" : "px-12")}>
          <span className="text-lg font-bold">Bäckerei Müller</span>
          {narrow ? (
            <span className="flex flex-col gap-1">
              <span className="h-0.5 w-5 bg-neutral-800" />
              <span className="h-0.5 w-5 bg-neutral-800" />
              <span className="h-0.5 w-5 bg-neutral-800" />
            </span>
          ) : (
            <span className="flex gap-7 text-[15px] text-neutral-500">
              <span>Sortiment</span>
              <span>Über uns</span>
              <span>Kontakt</span>
            </span>
          )}
        </div>

        {blocks.length === 0 && (
          <div className="m-3 flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-neutral-200 px-6 py-16 text-center">
            <span className="text-base font-medium text-neutral-700">Diese Seite hat noch keine Blöcke</span>
            <span className="text-[15px] text-neutral-500">Füge unten den ersten Block hinzu.</span>
          </div>
        )}

        {blocks.map((block) => {
          const selected = block.id === selectedId;
          return (
            <div
              key={block.id}
              data-block-id={block.id}
              onClick={() => onSelect(block.id)}
              className={cn(
                // The frame is a pseudo-element on top so it also shows over a hero background image.
                "relative m-3 cursor-pointer scroll-m-6 rounded-xl after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-xl after:border-2 after:transition-colors",
                selected ? "cursor-default after:border-accent" : "after:border-transparent hover:after:border-accent/40",
              )}
            >
              {selected && (
                <span className="absolute -top-3 left-6 z-30 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-white">
                  {blockMeta[block.type].label}
                </span>
              )}
              <BlockView
                block={block}
                selected={selected}
                narrow={narrow}
                onChange={(patch) => onChange(block.id, patch)}
                onDirty={onDirty}
              />
            </div>
          );
        })}

        <div className="flex justify-center px-12 pt-4 pb-16">
          <AddBlockDialog onAdd={onAdd} />
        </div>
      </div>
    </div>
  );
}

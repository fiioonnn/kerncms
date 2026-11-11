"use client";

import { useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import { LinkField } from "@/components/ui/link-field";
import { Tooltip } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { ImageField } from "@/components/media/media-picker";
import { cn } from "@/lib/utils";
import {
  marks,
  splitHeadline,
  type Block,
  type CategoriesBlock,
  type GalleryBlock,
  type HeroBlock,
  type QuoteBlock,
  type TextBlock,
} from "./blocks";
import { Editable, readHeadline, readText } from "./editable";

type FieldsProps<B extends Block> = {
  block: B;
  onChange: (patch: Partial<B>) => void;
  onDirty: () => void;
};

const layouts = [
  { label: "Text links", value: "left" },
  { label: "Zentriert", value: "center" },
];

const columnOptions = [
  { label: "2 Spalten", value: "2" },
  { label: "3 Spalten", value: "3" },
  { label: "4 Spalten", value: "4" },
];

function Section({ title, first, children }: { title: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-5", !first && "border-t border-border pt-7")}>
      <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">{title}</h3>
      {children}
    </div>
  );
}

/* ---------- Hero ---------- */

function HeadlineField({ block, onChange, onDirty }: FieldsProps<HeroBlock>) {
  const editRef = useRef<HTMLElement>(null);
  const active = marks.find((m) => m.id === block.mark)!;
  const parts = splitHeadline(block.headline, block.highlight);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[15px] font-medium">Überschrift</span>
      <div className="rounded-xl border border-border-strong transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
        <div className="flex flex-wrap gap-1.5 border-b border-border p-2">
          {marks.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={m.id === block.mark}
              // Keep the text selection in the headline while clicking a style.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const selection = window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "";
                const element = editRef.current;
                const headline = element ? readText(element) : block.headline;
                const highlight = selection && headline.includes(selection) ? selection : block.highlight;
                if (m.id !== block.mark || highlight !== block.highlight || headline !== block.headline) {
                  onChange({ mark: m.id, highlight, headline });
                }
              }}
              className={cn(
                "h-9 rounded-lg px-3 text-sm font-medium transition-colors",
                m.id === block.mark ? "bg-accent-soft text-accent" : "hover:bg-subtle",
              )}
            >
              <span className={m.className}>{m.label}</span>
            </button>
          ))}
        </div>
        <Editable
          key={`${block.headline}|${block.highlight}|${block.mark}`}
          editRef={editRef}
          editable
          onDirty={onDirty}
          onCommit={(element) => {
            const next = readHeadline(element, block.highlight);
            if (next.headline !== block.headline || next.highlight !== block.highlight) onChange(next);
          }}
          className="block px-4 py-3 text-[15px] leading-relaxed hover:outline-none focus:outline-none"
        >
          {parts ? (
            <>
              {parts.before}
              <span data-mark className={cn("rounded", active.className)}>
                {parts.marked}
              </span>
              {parts.after}
            </>
          ) : (
            block.headline
          )}
        </Editable>
      </div>
      <p className="text-sm text-muted">Markiere Wörter und wähle einen Stil.</p>
    </div>
  );
}

function HeroFields(props: FieldsProps<HeroBlock>) {
  const { block, onChange } = props;
  return (
    <>
      <HeadlineField {...props} />

      <Field>
        <Label>Text</Label>
        <Textarea rows={3} value={block.text} onChange={(e) => onChange({ text: e.target.value })} />
      </Field>

      <Section title="Button">
        <Field>
          <Label>Text</Label>
          <Input value={block.buttonLabel} onChange={(e) => onChange({ buttonLabel: e.target.value })} />
        </Field>
        <LinkField label="Button-Link" value={block.buttonLink} onChange={(buttonLink) => onChange({ buttonLink })} />
      </Section>

      <Section title="Darstellung">
        <Select
          label="Layout"
          items={layouts}
          value={block.layout}
          onValueChange={(value) => onChange({ layout: value as HeroBlock["layout"] })}
        />
        <ImageField
          label="Hintergrundbild"
          description="Optional. Wird hinter der Überschrift abgedunkelt angezeigt."
          value={block.image}
          onChange={(image) => onChange({ image })}
        />
      </Section>
    </>
  );
}

/* ---------- Categories ---------- */

function CategoryFields({ block, onChange }: FieldsProps<CategoriesBlock>) {
  const updateTile = (index: number, patch: Partial<CategoriesBlock["tiles"][number]>) =>
    onChange({ tiles: block.tiles.map((tile, i) => (i === index ? { ...tile, ...patch } : tile)) });

  return (
    <>
      {block.tiles.map((tile, i) => (
        <Section key={i} title={`Kachel ${i + 1}`} first={i === 0}>
          <ImageField
            label="Bild"
            aspect="aspect-[4/3]"
            value={tile.image}
            onChange={(image) => updateTile(i, { image })}
          />
          <Field>
            <Label>Titel</Label>
            <Input value={tile.title} onChange={(e) => updateTile(i, { title: e.target.value })} />
          </Field>
          <LinkField label="Link" value={tile.link} onChange={(link) => updateTile(i, { link })} />
        </Section>
      ))}
    </>
  );
}

/* ---------- Text ---------- */

function TextFields({ block, onChange }: FieldsProps<TextBlock>) {
  return (
    <>
      <Field>
        <Label>Zwischenüberschrift</Label>
        <Input value={block.heading} onChange={(e) => onChange({ heading: e.target.value })} />
      </Field>
      <Field>
        <Label>Text</Label>
        <Textarea rows={8} value={block.body} onChange={(e) => onChange({ body: e.target.value })} />
      </Field>
    </>
  );
}

/* ---------- Gallery ---------- */

function GalleryFields({ block, onChange }: FieldsProps<GalleryBlock>) {
  return (
    <>
      <Select
        label="Spalten"
        items={columnOptions}
        value={block.columns}
        onValueChange={(value) => onChange({ columns: value as GalleryBlock["columns"] })}
      />
      <Section title="Bilder">
        {block.images.map((image, i) => (
          <div key={i} className="relative">
            <ImageField
              label={`Bild ${i + 1}`}
              aspect="aspect-[4/3]"
              value={image}
              onChange={(next) => onChange({ images: block.images.map((img, j) => (j === i ? next : img)) })}
            />
            <Tooltip label="Platz entfernen" side="left">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Bild ${i + 1} entfernen`}
                onClick={() => onChange({ images: block.images.filter((_, j) => j !== i) })}
                className="absolute -top-2 right-0 size-9 rounded-lg text-muted hover:bg-danger-soft hover:text-danger [&_svg]:size-[18px]"
              >
                <Trash2 strokeWidth={1.75} />
              </Button>
            </Tooltip>
          </div>
        ))}
        <Button variant="secondary" onClick={() => onChange({ images: [...block.images, undefined] })}>
          <Plus />
          Bild hinzufügen
        </Button>
      </Section>
    </>
  );
}

/* ---------- Quote ---------- */

function QuoteFields({ block, onChange }: FieldsProps<QuoteBlock>) {
  return (
    <>
      <Field>
        <Label>Zitat</Label>
        <Textarea rows={4} value={block.text} onChange={(e) => onChange({ text: e.target.value })} />
      </Field>
      <Field>
        <Label>Name</Label>
        <Input value={block.author} onChange={(e) => onChange({ author: e.target.value })} />
      </Field>
      <Field>
        <Label>Zusatz</Label>
        <Input value={block.role} onChange={(e) => onChange({ role: e.target.value })} />
      </Field>
    </>
  );
}

/* ---------- Dispatcher ---------- */

export function BlockFields({
  block,
  onChange,
  onDirty,
}: {
  block: Block;
  onChange: (patch: Partial<Block>) => void;
  onDirty: () => void;
}) {
  switch (block.type) {
    case "hero":
      return <HeroFields block={block} onChange={onChange} onDirty={onDirty} />;
    case "categories":
      return <CategoryFields block={block} onChange={onChange} onDirty={onDirty} />;
    case "text":
      return <TextFields block={block} onChange={onChange} onDirty={onDirty} />;
    case "gallery":
      return <GalleryFields block={block} onChange={onChange} onDirty={onDirty} />;
    case "quote":
      return <QuoteFields block={block} onChange={onChange} onDirty={onDirty} />;
  }
}

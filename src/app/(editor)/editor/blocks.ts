import {
  Images,
  LayoutGrid,
  LayoutTemplate,
  MessageSquareQuote,
  Text,
  type LucideIcon,
} from "lucide-react";
import type { LinkValue } from "@/components/ui/link-field";

/* ---------- Marks (headline highlight styles) ---------- */

export const marks = [
  { id: "accent", label: "Akzent", className: "text-accent" },
  { id: "marker", label: "Marker", className: "bg-warning-soft box-decoration-clone px-1" },
  { id: "wavy", label: "Wellenlinie", className: "underline decoration-wavy decoration-accent decoration-2 underline-offset-[6px]" },
] as const;

export type MarkId = (typeof marks)[number]["id"];

/* ---------- Block model ---------- */

export type HeroBlock = {
  id: string;
  type: "hero";
  headline: string;
  /** Part of the headline rendered with the mark style. */
  highlight: string;
  mark: MarkId;
  text: string;
  buttonLabel: string;
  buttonLink: LinkValue;
  layout: "left" | "center";
  image?: string;
};

export type CategoryTile = { title: string; image?: string; link: LinkValue };

export type CategoriesBlock = { id: string; type: "categories"; tiles: CategoryTile[] };

export type TextBlock = { id: string; type: "text"; heading: string; body: string };

export type GalleryBlock = {
  id: string;
  type: "gallery";
  columns: "2" | "3" | "4";
  images: (string | undefined)[];
};

export type QuoteBlock = { id: string; type: "quote"; text: string; author: string; role: string };

export type Block = HeroBlock | CategoriesBlock | TextBlock | GalleryBlock | QuoteBlock;
export type BlockType = Block["type"];

export const blockMeta: Record<BlockType, { label: string; description: string; icon: LucideIcon }> = {
  hero: { label: "Hero", description: "Große Überschrift mit Text und Button", icon: LayoutTemplate },
  categories: { label: "Kategorien", description: "Kacheln mit Bild und Link", icon: LayoutGrid },
  text: { label: "Text", description: "Fließtext mit Zwischenüberschrift", icon: Text },
  gallery: { label: "Galerie", description: "Bilder im Raster", icon: Images },
  quote: { label: "Zitat", description: "Kundenstimme oder Zitat", icon: MessageSquareQuote },
};

/** Block types offered in the "Block hinzufügen" dialog. */
export const addableBlockTypes: BlockType[] = ["hero", "text", "gallery", "quote", "categories"];

export function createBlock(type: BlockType, id: string): Block {
  switch (type) {
    case "hero":
      return {
        id,
        type,
        headline: "Willkommen in unserer Backstube",
        highlight: "Backstube",
        mark: "accent",
        text: "Handwerk, Zeit und regionale Zutaten.",
        buttonLabel: "Mehr erfahren",
        buttonLink: { type: "page", path: "/ueber-uns" },
        layout: "left",
      };
    case "categories":
      return {
        id,
        type,
        tiles: [
          { title: "Brote", image: "dinkelbrot.jpg", link: { type: "page", path: "/sortiment" } },
          { title: "Brötchen", image: "croissants.jpg", link: { type: "page", path: "/sortiment" } },
          { title: "Kuchen", image: "sauerteig.jpg", link: { type: "page", path: "/sortiment" } },
        ],
      };
    case "text":
      return {
        id,
        type,
        heading: "Handwerk seit drei Generationen",
        body: "Unser Sauerteig reift bis zu 48 Stunden. Wir verzichten auf Fertigmischungen und backen jeden Morgen frisch in der eigenen Backstube.",
      };
    case "gallery":
      return { id, type, columns: "3", images: ["team-backstube.jpg", "laden-aussen.jpg", "wochenmarkt.jpg"] };
    case "quote":
      return {
        id,
        type,
        text: "Das beste Brot der Stadt. Samstags lohnt sich das Anstehen.",
        author: "Familie Schneider",
        role: "Stammkunden seit 1998",
      };
  }
}

export const initialBlocks: Block[] = [
  {
    id: "hero",
    type: "hero",
    headline: "Frisches Brot, jeden Morgen aus unserer Backstube",
    highlight: "jeden Morgen",
    mark: "accent",
    text: "Seit 1962 backen wir mit Zeit, Handwerk und regionalem Mehl.",
    buttonLabel: "Zum Sortiment",
    buttonLink: { type: "page", path: "/sortiment" },
    layout: "left",
  },
  createBlock("categories", "categories"),
  {
    id: "quote",
    type: "quote",
    text: "Seit Jahren holen wir hier jeden Samstag unser Dinkelbrot. Man schmeckt die Zeit, die darin steckt.",
    author: "Anna Schneider",
    role: "Stammkundin",
  },
];

/** One-line description of a block's content for the outline list. */
export function blockSummary(block: Block) {
  switch (block.type) {
    case "hero":
      return block.headline;
    case "categories":
      return block.tiles.map((t) => t.title).join(", ");
    case "text":
      return block.heading;
    case "gallery": {
      const count = block.images.filter(Boolean).length;
      return `${count} ${count === 1 ? "Bild" : "Bilder"} · ${block.columns} Spalten`;
    }
    case "quote":
      return block.text;
  }
}

/** Splits the headline around the first occurrence of the highlight. */
export function splitHeadline(headline: string, highlight: string) {
  const index = highlight ? headline.indexOf(highlight) : -1;
  if (index < 0) return null;
  return {
    before: headline.slice(0, index),
    marked: highlight,
    after: headline.slice(index + highlight.length),
  };
}

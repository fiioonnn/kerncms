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

/* ---------- Example content per page ---------- */

const homeBlocks: Block[] = [
  {
    id: "home-hero",
    type: "hero",
    headline: "Frisches Brot, jeden Morgen aus unserer Backstube",
    highlight: "jeden Morgen",
    mark: "accent",
    text: "Seit 1962 backen wir mit Zeit, Handwerk und regionalem Mehl.",
    buttonLabel: "Zum Sortiment",
    buttonLink: { type: "page", path: "/sortiment" },
    layout: "left",
  },
  createBlock("categories", "home-categories"),
  {
    id: "home-quote",
    type: "quote",
    text: "Seit Jahren holen wir hier jeden Samstag unser Dinkelbrot. Man schmeckt die Zeit, die darin steckt.",
    author: "Anna Schneider",
    role: "Stammkundin",
  },
];

const aboutBlocks: Block[] = [
  {
    id: "about-hero",
    type: "hero",
    headline: "Drei Generationen Bäckerhandwerk in der Lindenstraße",
    highlight: "Drei Generationen",
    mark: "marker",
    text: "Was 1962 mit einem Ofen und einem Sauerteig begann, ist heute ein Team aus vierzehn Menschen.",
    buttonLabel: "Unser Team kennenlernen",
    buttonLink: { type: "page", path: "/kontakt" },
    layout: "center",
    image: "team-backstube.jpg",
  },
  {
    id: "about-history",
    type: "text",
    heading: "Wie alles begann",
    body: "Großvater Heinrich Müller eröffnete die Backstube 1962 mit einem gebrauchten Etagenofen. Sein Sauerteig wird bis heute jeden Tag aufgefrischt und ist älter als die meisten unserer Kundinnen und Kunden.",
  },
  {
    id: "about-values",
    type: "text",
    heading: "Zeit ist unsere wichtigste Zutat",
    body: "Unsere Teige ruhen bis zu 48 Stunden. Das Mehl kommt aus der Mühle Brandt, zwölf Kilometer entfernt. Fertigmischungen und Backmittel gibt es bei uns nicht.",
  },
  { id: "about-gallery", type: "gallery", columns: "3", images: ["team-backstube.jpg", "ofen.jpg", "laden-aussen.jpg"] },
];

const rangeBlocks: Block[] = [
  {
    id: "range-hero",
    type: "hero",
    headline: "Unser Sortiment, täglich frisch gebacken",
    highlight: "täglich frisch",
    mark: "wavy",
    text: "Brote, Brötchen, Kuchen und saisonale Spezialitäten. Was ausverkauft ist, backen wir am nächsten Morgen wieder.",
    buttonLabel: "Vorbestellen",
    buttonLink: { type: "page", path: "/kontakt" },
    layout: "left",
  },
  {
    id: "range-categories",
    type: "categories",
    tiles: [
      { title: "Sauerteigbrote", image: "sauerteig.jpg", link: { type: "page", path: "/sortiment" } },
      { title: "Dinkel & Vollkorn", image: "dinkelbrot.jpg", link: { type: "page", path: "/sortiment" } },
      { title: "Feingebäck", image: "croissants.jpg", link: { type: "page", path: "/sortiment" } },
    ],
  },
  {
    id: "range-season",
    type: "text",
    heading: "Saisonal im November",
    body: "Stollen nach Familienrezept, Martinsgänse aus Hefeteig und unser Kürbiskernbrot gibt es nur, solange die Saison dauert.",
  },
  { id: "range-gallery", type: "gallery", columns: "4", images: ["stollen.jpg", "kuerbisbrot.jpg", "brezeln.jpg", "apfelkuchen.jpg"] },
];

const cateringBlocks: Block[] = [
  {
    id: "catering-hero",
    type: "hero",
    headline: "Catering für Feiern, Büros und Veranstaltungen",
    highlight: "Catering",
    mark: "accent",
    text: "Belegte Brötchen, Kuchenplatten und Frühstücksbuffets ab zehn Personen, geliefert im Umkreis von 20 Kilometern.",
    buttonLabel: "Angebot anfragen",
    buttonLink: { type: "page", path: "/kontakt" },
    layout: "left",
    image: "fruehstuecksbuffet.jpg",
  },
  {
    id: "catering-offer",
    type: "text",
    heading: "So funktioniert die Bestellung",
    body: "Schreib uns bis spätestens drei Werktage vorher, für wie viele Personen und wann du bestellen möchtest. Wir melden uns innerhalb eines Tages mit einem Angebot.",
  },
  { id: "catering-gallery", type: "gallery", columns: "2", images: ["fruehstuecksbuffet.jpg", "kuchenplatte.jpg"] },
  {
    id: "catering-quote",
    type: "quote",
    text: "Das Frühstücksbuffet für unser Team-Event war liebevoll angerichtet und pünktlich da. Wir bestellen wieder.",
    author: "Julia Becker",
    role: "Büroleitung, Becker & Partner",
  },
];

const contactBlocks: Block[] = [
  {
    id: "contact-hero",
    type: "hero",
    headline: "Besuch uns in der Lindenstraße 12",
    highlight: "Lindenstraße 12",
    mark: "marker",
    text: "Montag bis Freitag 6:30 bis 18 Uhr, Samstag 6:30 bis 13 Uhr. Sonntags haben wir geschlossen.",
    buttonLabel: "Route planen",
    buttonLink: { type: "external", url: "https://maps.example.com/baeckerei-mueller", newTab: true },
    layout: "center",
  },
  {
    id: "contact-text",
    type: "text",
    heading: "Vorbestellungen und Fragen",
    body: "Ruf uns unter 0221 123 45 67 an oder schreib an hallo@baeckerei-mueller.de. Vorbestellungen für Samstag nehmen wir bis Freitag 12 Uhr an.",
  },
  { id: "contact-gallery", type: "gallery", columns: "2", images: ["laden-aussen.jpg", "wochenmarkt.jpg"] },
];

const imprintBlocks: Block[] = [
  {
    id: "imprint-text",
    type: "text",
    heading: "Impressum",
    body: "Bäckerei Müller GmbH, Lindenstraße 12, 50674 Köln. Vertreten durch die Geschäftsführerin Katharina Müller. Registergericht Köln, HRB 12345. USt-IdNr. DE123456789.",
  },
  {
    id: "imprint-contact",
    type: "text",
    heading: "Kontakt",
    body: "Telefon 0221 123 45 67, E-Mail hallo@baeckerei-mueller.de.",
  },
  {
    id: "imprint-liability",
    type: "text",
    heading: "Haftung für Inhalte",
    body: "Die Inhalte dieser Seite wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität können wir jedoch keine Gewähr übernehmen.",
  },
];

/** Example blocks of each site page, as last saved. */
export const pageContent: Record<string, Block[]> = {
  "/": homeBlocks,
  "/ueber-uns": aboutBlocks,
  "/sortiment": rangeBlocks,
  "/catering": cateringBlocks,
  "/kontakt": contactBlocks,
  "/impressum": imprintBlocks,
};

const noBlocks: Block[] = [];

export function examplePageBlocks(path: string): Block[] {
  return pageContent[path] ?? noBlocks;
}

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

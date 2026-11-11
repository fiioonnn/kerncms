/* Example content collections (mirrors Astro content collections). Replace with the real schema later. */

import { CalendarDays, ChefHat, Users, type LucideIcon } from "lucide-react";

export type FieldType = "text" | "textarea" | "number" | "select" | "boolean" | "date" | "image" | "richtext";

export type CollectionField = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  description?: string;
  /** Shown after number values, e.g. "Min." */
  suffix?: string;
  options?: { label: string; value: string }[];
};

export type EntryValue = string | number | boolean;

export type CollectionEntry = {
  id: string;
  status: "live" | "draft";
  updated: string;
  values: Record<string, EntryValue>;
};

export type Collection = {
  slug: string;
  name: string;
  /** Name of a single entry, e.g. "Rezept". */
  singular: string;
  description: string;
  icon: LucideIcon;
  format: "md" | "json";
  /** Field used as the entry title. */
  titleField: string;
  /** Extra columns in the entries table. */
  listFields: string[];
  fields: CollectionField[];
  entries: CollectionEntry[];
};

export const collections: Collection[] = [
  {
    slug: "rezepte",
    name: "Rezepte",
    singular: "Rezept",
    description: "Back-Rezepte für den Blog und die Rezeptseite.",
    icon: ChefHat,
    format: "md",
    titleField: "titel",
    listFields: ["zeit", "schwierigkeit", "vegan"],
    fields: [
      { name: "titel", label: "Titel", type: "text", required: true },
      { name: "zeit", label: "Zubereitungszeit", type: "number", suffix: "Min.", description: "In Minuten, inklusive Backzeit." },
      {
        name: "schwierigkeit",
        label: "Schwierigkeit",
        type: "select",
        options: [
          { label: "Leicht", value: "leicht" },
          { label: "Mittel", value: "mittel" },
          { label: "Schwer", value: "schwer" },
        ],
      },
      { name: "zutaten", label: "Zutaten", type: "textarea", description: "Eine Zutat pro Zeile." },
      { name: "bild", label: "Bild", type: "image" },
      { name: "vegan", label: "Vegan", type: "boolean", description: "Wird mit einem Vegan-Hinweis markiert." },
      { name: "anleitung", label: "Anleitung", type: "richtext" },
    ],
    entries: [
      { id: "dinkel-vollkornbrot", status: "live", updated: "21. Okt.", values: { titel: "Dinkel-Vollkornbrot", zeit: 90, schwierigkeit: "mittel", vegan: true, bild: "dinkelbrot.jpg" } },
      { id: "butter-croissants", status: "live", updated: "14. Okt.", values: { titel: "Butter-Croissants", zeit: 180, schwierigkeit: "schwer", vegan: false, bild: "croissants.jpg" } },
      { id: "roggenmischbrot", status: "draft", updated: "Heute", values: { titel: "Roggenmischbrot mit Sauerteig", zeit: 120, schwierigkeit: "mittel", vegan: true, bild: "sauerteig.jpg" } },
      { id: "zimtschnecken", status: "live", updated: "2. Okt.", values: { titel: "Zimtschnecken", zeit: 75, schwierigkeit: "leicht", vegan: false } },
    ],
  },
  {
    slug: "events",
    name: "Events",
    singular: "Event",
    description: "Termine wie Märkte, Backkurse und Aktionen.",
    icon: CalendarDays,
    format: "md",
    titleField: "titel",
    listFields: ["datum", "ort", "anmeldung"],
    fields: [
      { name: "titel", label: "Titel", type: "text", required: true },
      { name: "datum", label: "Datum", type: "date", required: true },
      { name: "ort", label: "Ort", type: "text" },
      { name: "beschreibung", label: "Beschreibung", type: "richtext" },
      { name: "anmeldung", label: "Anmeldung erforderlich", type: "boolean", description: "Zeigt einen Anmelde-Button auf der Website." },
    ],
    entries: [
      { id: "wochenmarkt-november", status: "live", updated: "3. Nov.", values: { titel: "Stand auf dem Wochenmarkt", datum: "2026-11-21", ort: "Marktplatz", anmeldung: false } },
      { id: "backkurs-sauerteig", status: "live", updated: "28. Okt.", values: { titel: "Backkurs: Sauerteig für Einsteiger", datum: "2026-12-05", ort: "Backstube", anmeldung: true } },
      { id: "adventsmarkt", status: "draft", updated: "Gestern", values: { titel: "Adventsmarkt", datum: "2026-12-12", ort: "Rathausplatz", anmeldung: false } },
    ],
  },
  {
    slug: "team",
    name: "Team",
    singular: "Teammitglied",
    description: "Die Menschen auf der Seite „Über uns“.",
    icon: Users,
    format: "json",
    titleField: "name",
    listFields: ["position", "reihenfolge"],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "position", label: "Position", type: "text" },
      { name: "foto", label: "Foto", type: "image" },
      { name: "reihenfolge", label: "Reihenfolge", type: "number", description: "Kleinere Zahlen erscheinen weiter vorne." },
    ],
    entries: [
      { id: "anna-schmidt", status: "live", updated: "8. Nov.", values: { name: "Anna Schmidt", position: "Bäckermeisterin", reihenfolge: 1, foto: "team-backstube.jpg" } },
      { id: "jonas-weber", status: "live", updated: "8. Nov.", values: { name: "Jonas Weber", position: "Konditor", reihenfolge: 2 } },
      { id: "lena-hoffmann", status: "live", updated: "12. Okt.", values: { name: "Lena Hoffmann", position: "Verkauf", reihenfolge: 3 } },
    ],
  },
];

export function getCollection(slug: string) {
  return collections.find((collection) => collection.slug === slug);
}

export function collectionFolder(collection: Collection) {
  return `src/content/${collection.slug}`;
}

const shortMonths = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

/** Deterministic display of a stored value (no locale APIs, so server and client match). */
export function formatEntryValue(field: CollectionField | undefined, value: EntryValue | undefined) {
  if (value === undefined || value === "") return "–";
  if (!field) return String(value);
  if (field.type === "boolean") return value ? "Ja" : "Nein";
  if (field.type === "select") return field.options?.find((o) => o.value === value)?.label ?? String(value);
  if (field.type === "number" && field.suffix) return `${value} ${field.suffix}`;
  if (field.type === "date" && typeof value === "string") {
    const [year, month, day] = value.split("-").map(Number);
    return `${day}. ${shortMonths[month - 1]} ${year}`;
  }
  return String(value);
}

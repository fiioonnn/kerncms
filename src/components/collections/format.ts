import type { CollectionDef, EntryValues, FieldDef } from "@/lib/kern-types";

/* Formatting helpers shared by the content screens (pages, collections, history, trash). */

const dayMs = 86_400_000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "8. Nov. 2026" */
export function formatDate(iso: string | null | undefined) {
  if (!iso) return "–";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
}

/** "8. Nov. 2026, 09:14" */
export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "–";
  const date = new Date(iso);
  return `${formatDate(iso)}, ${date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
}

/** "Heute, 09:42", "Gestern, 16:20" or "8. Nov." (with year when not this year). */
export function formatChange(iso: string | null | undefined, now = new Date()) {
  if (!iso) return "–";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  const time = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const diff = Math.round((startOfDay(now) - startOfDay(date)) / dayMs);
  if (diff === 0) return `Heute, ${time}`;
  if (diff === 1) return `Gestern, ${time}`;
  return date.toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear() && { year: "numeric" }),
  });
}

/** "vor 5 Minuten", "gestern", "vor 3 Tagen" */
export function formatRelative(iso: string | null | undefined, now = new Date()) {
  if (!iso) return "–";
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("de", { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 45) return "gerade eben";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 30 * 86_400) return rtf.format(Math.round(seconds / 86_400), "day");
  if (abs < 365 * 86_400) return rtf.format(Math.round(seconds / (30 * 86_400)), "month");
  return rtf.format(Math.round(seconds / (365 * 86_400)), "year");
}

/** Group heading for a day: "Heute", "Gestern", "Montag, 9. November". */
export function formatDay(iso: string, now = new Date()) {
  const date = new Date(iso);
  const diff = Math.round((startOfDay(now) - startOfDay(date)) / dayMs);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Gestern";
  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== now.getFullYear() && { year: "numeric" }),
  });
}

/** Whole days from now until the given time (0 when past). */
export function daysUntil(iso: string, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / dayMs));
}

/** Local calendar day key, e.g. "2026-11-09". */
export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function stripHtml(value: unknown) {
  return typeof value === "string" ? value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() : "";
}

/** A field value as short text for tables and search. */
export function formatFieldValue(field: FieldDef | undefined, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  switch (field?.type) {
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return String(value);
      const [y, m, d] = value.slice(0, 10).split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
    }
    case "boolean":
      return value === true ? "Ja" : "Nein";
    case "select":
      return field.options?.find((o) => o.value === value)?.label ?? String(value);
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(n)) return String(value);
      const text = n.toLocaleString("de-DE");
      return field.suffix ? `${text} ${field.suffix}` : text;
    }
    case "tags":
      return Array.isArray(value) ? value.join(", ") : String(value);
    case "list":
      return Array.isArray(value) ? (value.length === 1 ? "1 Eintrag" : `${value.length} Einträge`) : "";
    case "image":
      return typeof value === "string" ? (value.split("/").pop() ?? value) : "";
    case "link": {
      const link = value as { type?: string; path?: string; url?: string };
      return link?.type === "external" ? (link.url ?? "") : (link?.path ?? "");
    }
    case "inline":
    case "richtext":
      return stripHtml(value);
    default:
      return typeof value === "object" ? "" : String(value);
  }
}

export function entryTitle(collection: CollectionDef, values: EntryValues, id: string) {
  return stripHtml(values[collection.titleField]) || id;
}

/** Same rules as the server's slugify, for previews while typing. */
export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

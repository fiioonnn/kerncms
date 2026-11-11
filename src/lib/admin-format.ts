/* Small German formatting helpers for the admin screens. */

const dateTime = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" });
const timeOnly = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

/** "vor 5 Min.", "Heute, 09:12", "Gestern, 17:05", "8. Nov., 14:03". */
export function formatWhen(iso: string | Date | null | undefined, now = new Date()) {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = now.getTime() - d.getTime();
  if (diff >= 0 && diff < 60_000) return "gerade eben";
  if (diff >= 0 && diff < 3_600_000) return `vor ${Math.floor(diff / 60_000)} Min.`;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (d >= startOfToday) return `Heute, ${timeOnly.format(d)}`;
  if (d.getTime() >= startOfToday.getTime() - 86_400_000) return `Gestern, ${timeOnly.format(d)}`;
  return dateTime.format(d);
}

export function formatDate(iso: string | Date | null | undefined) {
  if (!iso) return "";
  return dateOnly.format(typeof iso === "string" ? new Date(iso) : iso);
}

export const numberFormat = new Intl.NumberFormat("de-DE");

/** Human label for a repository file, e.g. "src/content/pages/index.json" → "index.json". */
export function fileLabel(file: string) {
  return file.split("/").pop() ?? file;
}

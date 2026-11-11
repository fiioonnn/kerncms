import type { FormDef } from "./kern-types";

/*
 * Shared by the CMS (client) and the notification mail (server): readable field values,
 * {platzhalter} templates and the "Per Mail antworten" mailto link.
 */

export type ReplyTemplate = { replySubject: string; replyBody: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Label without a trailing period or colon, so "Einverstanden." reads "Einverstanden". */
export function cleanLabel(label: string) {
  return label.replace(/[.:]\s*$/, "");
}

/** Human-readable value of a submitted field (select → option label, checkbox → Ja/Nein). */
export function displayValue(form: FormDef | undefined, name: string, value: string) {
  const field = form?.fields.find((f) => f.name === name);
  if (!field) return value;
  if (field.type === "boolean") return value === "true" || value === "on" ? "Ja" : "Nein";
  if (field.type === "select") return field.options?.find((o) => o.value === value)?.label ?? value;
  return value;
}

/** First valid address from an email field. */
export function visitorEmail(form: FormDef | undefined, data: Record<string, string>) {
  const fields = form?.fields ?? [];
  const candidates = [...fields.filter((f) => f.type === "email").map((f) => data[f.name]), data.email];
  return candidates.find((v) => typeof v === "string" && EMAIL.test(v.trim()))?.trim() ?? null;
}

export type TemplateContext = {
  form: FormDef;
  data: Record<string, string>;
  siteName: string;
  createdAt?: string | Date;
};

/** Variables besides the form's own fields. */
export const builtinVariables = [
  { name: "website", label: "Name der Website" },
  { name: "formular", label: "Name des Formulars" },
  { name: "datum", label: "Datum der Anfrage" },
  { name: "anfrage", label: "Alle Angaben als Liste" },
] as const;

function summaryText(form: FormDef, data: Record<string, string>) {
  return form.fields
    .filter((f) => (data[f.name] ?? "") !== "")
    .map((f) => `${cleanLabel(f.label)}: ${displayValue(form, f.name, data[f.name])}`)
    .join("\n");
}

/** Replaces {feld} and built-in placeholders; unknown ones are removed. */
export function fillTemplate(template: string, ctx: TemplateContext, opts: { singleLine?: boolean } = {}) {
  const date = ctx.createdAt ? new Date(ctx.createdAt) : new Date();
  const builtins: Record<string, string> = {
    website: ctx.siteName,
    formular: ctx.form.label,
    datum: date.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }),
    anfrage: summaryText(ctx.form, ctx.data),
  };
  let out = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (ctx.data[key] !== undefined) return displayValue(ctx.form, key, ctx.data[key]);
    return builtins[key] ?? "";
  });
  if (opts.singleLine) out = out.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ");
  return out.trim();
}

/** Subject of the notification mail (also the default for replies, prefixed with "Re:"). */
export function notificationSubject(template: string, ctx: TemplateContext) {
  return fillTemplate(template || `Anfrage über das ${ctx.form.label}`, ctx, { singleLine: true });
}

/** mailto: link that opens a prepared reply in the customer's own mail program. */
export function replyMailto(ctx: TemplateContext, settings: ReplyTemplate & { subject: string }) {
  const to = visitorEmail(ctx.form, ctx.data);
  if (!to) return null;
  const subject = settings.replySubject.trim()
    ? fillTemplate(settings.replySubject, ctx, { singleLine: true })
    : `Re: ${notificationSubject(settings.subject, ctx)}`;
  const body = settings.replyBody.trim() ? fillTemplate(settings.replyBody, ctx) : "";
  // RFC 6068: line breaks as CRLF, everything percent-encoded.
  const params = [`subject=${encodeURIComponent(subject)}`];
  if (body) params.push(`body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`);
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?${params.join("&")}`;
}

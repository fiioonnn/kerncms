import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { formSettings, formSubmissions, type Site } from "@/db/schema";
import type { FormDef } from "@/lib/kern-types";
import { DEFAULT_FROM, defaultTransport, mailLayout } from "./mail";

/*
 * Form notifications go out through the CMS's own SMTP (MAIL_FROM, e.g. noreply@kerncms.com).
 * No Reply-To: replying to the notification would quote it to the visitor. Instead the mail has
 * a button that opens a fresh mail to the visitor in the customer's own mail program.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * "Kontaktformular · Bäckerei Müller <info@kerncms.com>", built from MAIL_FROM's address.
 * The name shows up in the quote line when the customer replies, so it reads naturally for the visitor.
 */
export function notificationFrom(siteName: string, formLabel = "Kontaktformular") {
  const address = /<([^>]+)>/.exec(DEFAULT_FROM)?.[1] ?? DEFAULT_FROM.trim();
  const name = `${formLabel} · ${siteName}`.replace(/["<>\r\n]/g, "");
  return `"${name}" <${address}>`;
}

/** Label without a trailing period, so "Einverstanden.: Ja" reads "Einverstanden: Ja". */
function cleanLabel(label: string) {
  return label.replace(/[.:]\s*$/, "");
}

/** Human-readable value of a submitted field (select → option label, checkbox → Ja/Nein). */
function displayValue(form: FormDef, name: string, value: string) {
  const field = form.fields.find((f) => f.name === name);
  if (!field) return value;
  if (field.type === "boolean") return value === "true" || value === "on" ? "Ja" : "Nein";
  if (field.type === "select") return field.options?.find((o) => o.value === value)?.label ?? value;
  return value;
}

/** Replaces {feld} placeholders with submitted values; unknown ones are removed. */
export function fillSubject(template: string, form: FormDef, data: Record<string, string>) {
  return template
    .replace(/\{(\w+)\}/g, (_, key: string) => (data[key] !== undefined ? displayValue(form, key, data[key]) : ""))
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Sends the notification for one submission and records the result. Never throws. */
export async function sendSubmissionMails(input: {
  site: Pick<Site, "id" | "name">;
  form: FormDef;
  submissionId: string;
  data: Record<string, string>;
  page: string | null;
  cmsUrl: string;
}) {
  const { site, form, submissionId, data, page, cmsUrl } = input;
  const [settings] = await db
    .select()
    .from(formSettings)
    .where(and(eq(formSettings.siteId, site.id), eq(formSettings.form, form.key)))
    .limit(1);

  if (!settings?.notify || settings.recipients.length === 0) {
    await db.update(formSubmissions).set({ mailStatus: "off" }).where(eq(formSubmissions.id, submissionId));
    return;
  }

  try {
    const visitorEmail = Object.entries(data).find(([key, value]) => form.fields.find((f) => f.name === key)?.type === "email" && EMAIL.test(value))?.[1];
    const filled = form.fields.filter((f) => data[f.name] !== undefined && data[f.name] !== "");
    const rows = filled
      .map(
        (f) =>
          `<tr><td style="padding:8px 16px 8px 0;color:#6b6b72;vertical-align:top;white-space:nowrap">${escapeHtml(cleanLabel(f.label))}</td><td style="padding:8px 0;white-space:pre-wrap">${escapeHtml(displayValue(form, f.name, data[f.name]))}</td></tr>`,
      )
      .join("");
    const text = filled.map((f) => `${cleanLabel(f.label)}: ${displayValue(form, f.name, data[f.name])}`).join("\n");
    // Neutral wording: the visitor sees subject and content again when the customer replies.
    const subject = fillSubject(settings.subject || `Anfrage über das ${form.label}`, form, data);
    const visitorName = (data.name ?? "").trim() || visitorEmail;
    const replyHref = visitorEmail ? `mailto:${visitorEmail}?subject=${encodeURIComponent(`Re: ${subject}`)}` : null;
    await defaultTransport.sendMail({
      from: notificationFrom(site.name, form.label),
      to: settings.recipients,
      subject,
      text: `${text}\n\n${visitorEmail ? `Antworten: schreib eine neue Mail an ${visitorEmail}.\n` : ""}Bitte nicht auf diese Benachrichtigung antworten.\n\n—\nGesendet über das ${form.label}${page ? ` auf ${page}` : ""} · Im CMS ansehen: ${cmsUrl}/forms`,
      html: mailLayout(
        escapeHtml(form.label),
        `<table style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table>
${replyHref ? `<p style="margin:24px 0 0"><a href="${escapeHtml(replyHref)}" style="display:inline-block;background:#2f5bea;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">${escapeHtml(visitorName ? `Antworten an ${visitorName}` : "Antworten")}</a></p>
<p style="font-size:13px;color:#6b6b72;margin:10px 0 0">Öffnet eine neue Mail an ${escapeHtml(visitorEmail!)}. Bitte nicht auf diese Benachrichtigung antworten.</p>` : `<p style="font-size:13px;color:#6b6b72;margin:20px 0 0">Bitte nicht auf diese Benachrichtigung antworten.</p>`}
<p style="font-size:13px;color:#6b6b72;margin:20px 0 0">Gesendet über das ${escapeHtml(form.label)}${page ? ` auf ${escapeHtml(page)}` : ""} · <a href="${cmsUrl}/forms" style="color:#6b6b72">Im CMS ansehen</a></p>`,
        { brand: site.name, footer: null },
      ),
    });
    await db.update(formSubmissions).set({ mailStatus: "sent", mailError: null, mailedAt: new Date() }).where(eq(formSubmissions.id, submissionId));
  } catch (error) {
    console.error("[kern] Formular-Mail fehlgeschlagen:", error);
    await db
      .update(formSubmissions)
      .set({ mailStatus: "failed", mailError: (error as Error).message.slice(0, 500) })
      .where(eq(formSubmissions.id, submissionId));
  }
}

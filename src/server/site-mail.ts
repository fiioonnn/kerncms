import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { formSettings, formSubmissions, type Site } from "@/db/schema";
import { cleanLabel, displayValue, notificationSubject, replyMailto, visitorEmail as findVisitorEmail } from "@/lib/form-template";
import type { FormDef } from "@/lib/kern-types";
import { DEFAULT_FROM, defaultTransport, escapeHtml, mailButton, mailFields, mailLayout, mailText } from "./mail";

/*
 * Form notifications go out through the CMS's own SMTP (MAIL_FROM, e.g. noreply@kerncms.com).
 * No Reply-To: replying to the notification would quote it to the visitor. Instead the mail has
 * a button that opens a fresh mail to the visitor in the customer's own mail program.
 */

/**
 * "Kontaktformular · Bäckerei Müller <info@kerncms.com>", built from MAIL_FROM's address.
 * The name shows up in the quote line when the customer replies, so it reads naturally for the visitor.
 */
export function notificationFrom(siteName: string, formLabel = "Kontaktformular") {
  const address = /<([^>]+)>/.exec(DEFAULT_FROM)?.[1] ?? DEFAULT_FROM.trim();
  const name = `${formLabel} · ${siteName}`.replace(/["<>\r\n]/g, "");
  return `"${name}" <${address}>`;
}

/** Sends the notification for one submission and records the result. Never throws. */
export async function sendSubmissionMails(input: {
  site: Pick<Site, "id" | "name">;
  createdAt?: Date;
  form: FormDef;
  submissionId: string;
  data: Record<string, string>;
  page: string | null;
  cmsUrl: string;
}) {
  const { site, form, submissionId, data, page, cmsUrl, createdAt } = input;
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
    const ctx = { form, data, siteName: site.name, createdAt };
    const visitorEmail = findVisitorEmail(form, data);
    const filled = form.fields.filter((f) => data[f.name] !== undefined && data[f.name] !== "");
    const rows = filled.map((f) => ({ label: cleanLabel(f.label), value: displayValue(form, f.name, data[f.name]) }));
    const text = filled.map((f) => `${cleanLabel(f.label)}: ${displayValue(form, f.name, data[f.name])}`).join("\n");
    // Neutral wording: the visitor sees subject and content again when the customer replies.
    const subject = notificationSubject(settings.subject, ctx);
    const visitorName = (data.name ?? "").trim() || visitorEmail;
    const replyHref = replyMailto(ctx, settings);
    await defaultTransport.sendMail({
      from: notificationFrom(site.name, form.label),
      to: settings.recipients,
      subject,
      text: `${text}\n\n${visitorEmail ? `Antworten: schreib eine neue Mail an ${visitorEmail}.\n` : ""}Bitte nicht auf diese Benachrichtigung antworten.\n\n—\nGesendet über das ${form.label}${page ? ` auf ${page}` : ""} · Im CMS ansehen: ${cmsUrl}/forms`,
      html: mailLayout(
        escapeHtml(form.label),
        `${mailText(`Neue Nachricht${page ? ` von <span style="white-space:nowrap">${escapeHtml(page)}</span>` : ""}.`, { muted: true, top: 6 })}
${mailFields(rows)}
${
  replyHref
    ? `${mailButton(replyHref, visitorName ? `Antworten an ${visitorName}` : "Antworten")}
${mailText(`Öffnet eine neue Mail an ${escapeHtml(visitorEmail!)}. Bitte nicht auf diese Benachrichtigung antworten.`, { muted: true, small: true, top: 12 })}`
    : mailText("Bitte nicht auf diese Benachrichtigung antworten.", { muted: true, small: true, top: 24 })
}`,
        { brand: site.name, footer: `<a href="${cmsUrl}/forms" style="color:#a1a1aa">Im CMS ansehen</a>`, preheader: `${form.label}: ${visitorName || "neue Nachricht"}` },
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

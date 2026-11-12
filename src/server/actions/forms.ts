"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { formSettings, formSubmissions, sites } from "@/db/schema";
import { run } from "../action";
import { sampleFormData } from "@/lib/form-template";
import { defaultTransport } from "../mail";
import { notificationMail, sendSubmissionMails } from "../site-mail";
import { cmsOrigin } from "../custom-domains";
import { getForms } from "../queries";
import { getWorkspace, requireRole } from "../sites";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function refresh() {
  revalidatePath("/", "layout");
}

/** Current submissions for the inbox, so it can pick up new ones without a reload. */
export async function loadSubmissions() {
  return run(async () => (await getForms()).submissions);
}

/* ---------- Notification settings per form ---------- */

export type FormSettingsInput = {
  notify: boolean;
  recipients: string[];
  subject: string;
  replySubject: string;
  replyBody: string;
};

function cleanRecipients(list: string[]) {
  const recipients = [...new Set(list.map((r) => r.trim().toLowerCase()).filter(Boolean))];
  const invalid = recipients.find((r) => !EMAIL.test(r));
  if (invalid) throw new Error(`„${invalid}“ ist keine gültige E-Mail-Adresse.`);
  return recipients;
}

/** Sends the notification with example values, using the settings as currently entered (saved or not). */
export async function sendTestFormMail(form: string, input: FormSettingsInput) {
  return run(async () => {
    const ws = await getWorkspace("admin");
    const def = ws.config.forms.find((f) => f.key === form);
    if (!def) throw new Error("Unbekanntes Formular.");
    const recipients = cleanRecipients(input.recipients);
    if (recipients.length === 0) throw new Error("Bitte gib mindestens einen Empfänger an.");
    if (recipients.length > 10) throw new Error("Höchstens 10 Empfänger.");
    const cmsUrl = await cmsOrigin(ws.site.customerId);
    const mail = notificationMail({
      site: ws.site,
      form: def,
      data: sampleFormData(def),
      page: null,
      cmsUrl,
      settings: { ...input, recipients },
    });
    try {
      await defaultTransport.sendMail({ ...mail, subject: `[Test] ${mail.subject}` });
    } catch (error) {
      console.error("[kern] Testmail fehlgeschlagen:", error);
      throw new Error(`Versand fehlgeschlagen: ${(error as Error).message.slice(0, 300)}`);
    }
    return { recipients };
  });
}

export async function saveFormSettings(form: string, input: FormSettingsInput) {
  return run(async () => {
    const ws = await getWorkspace("admin");
    if (!ws.config.forms.some((f) => f.key === form)) throw new Error("Unbekanntes Formular.");
    const recipients = cleanRecipients(input.recipients);
    if (input.notify && recipients.length === 0) throw new Error("Bitte gib mindestens einen Empfänger an.");
    if (recipients.length > 10) throw new Error("Höchstens 10 Empfänger.");
    const values = {
      notify: input.notify,
      recipients,
      subject: input.subject.trim().slice(0, 200),
      replySubject: input.replySubject.trim().slice(0, 200),
      replyBody: input.replyBody.replace(/\s+$/, "").slice(0, 5000),
      updatedAt: new Date(),
    };
    await db
      .insert(formSettings)
      .values({ siteId: ws.site.id, form, ...values })
      .onConflictDoUpdate({ target: [formSettings.siteId, formSettings.form], set: values });
    refresh();
    return null;
  });
}

export async function resendSubmissionMail(id: string) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    const [submission] = await db
      .select()
      .from(formSubmissions)
      .where(and(eq(formSubmissions.id, id), eq(formSubmissions.siteId, ws.site.id)));
    if (!submission) throw new Error("Nachricht nicht gefunden.");
    const form = ws.config.forms.find((f) => f.key === submission.form);
    if (!form) throw new Error("Das Formular gibt es nicht mehr.");
    const cmsUrl = await cmsOrigin(ws.site.customerId);
    await sendSubmissionMails({ site: ws.site, form, submissionId: id, data: submission.data, page: submission.page, cmsUrl, createdAt: submission.createdAt });
    const [after] = await db.select({ status: formSubmissions.mailStatus, error: formSubmissions.mailError }).from(formSubmissions).where(eq(formSubmissions.id, id));
    refresh();
    if (after?.status === "failed") throw new Error(after.error ?? "Versand fehlgeschlagen.");
    if (after?.status === "off") throw new Error("Für dieses Formular ist keine Benachrichtigung eingerichtet.");
    return null;
  });
}

/* ---------- Public key and allowed domains ---------- */

export async function rotatePublicKey() {
  return run(async () => {
    const ctx = await requireRole("admin");
    const publicKey = `pk_${randomBytes(10).toString("hex")}`;
    await db.update(sites).set({ publicKey }).where(eq(sites.id, ctx.site.id));
    refresh();
    return { publicKey };
  });
}

export async function saveAllowedOrigins(origins: string[]) {
  return run(async () => {
    const ctx = await requireRole("admin");
    const clean: string[] = [];
    for (const raw of origins.map((o) => o.trim()).filter(Boolean)) {
      const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
      let origin: string;
      try {
        origin = new URL(withScheme).origin;
      } catch {
        throw new Error(`„${raw}“ ist keine gültige Adresse.`);
      }
      if (!clean.includes(origin)) clean.push(origin);
    }
    if (clean.length > 20) throw new Error("Höchstens 20 Domains.");
    await db.update(sites).set({ allowedOrigins: clean }).where(eq(sites.id, ctx.site.id));
    refresh();
    return clean;
  });
}

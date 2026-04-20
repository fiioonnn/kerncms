import { Resend } from "resend";
import { db } from "@/db";
import { resendConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

export function getResendClient(): Resend | null {
  const row = db.select().from(resendConfig).where(eq(resendConfig.id, "default")).get();

  if (row?.apiKey) {
    try {
      return new Resend(decrypt(row.apiKey));
    } catch { /* fall through to env */ }
  }

  if (process.env.RESEND_API_KEY) {
    return new Resend(process.env.RESEND_API_KEY);
  }

  return null;
}

export function getResendFromAddress(): string {
  const row = db.select({ fromDomain: resendConfig.fromDomain }).from(resendConfig).where(eq(resendConfig.id, "default")).get();
  const domain = row?.fromDomain || process.env.RESEND_FROM_DOMAIN || "resend.dev";
  return `kern CMS <noreply@${domain}>`;
}

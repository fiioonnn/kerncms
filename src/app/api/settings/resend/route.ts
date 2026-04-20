import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession, isAdminRole } from "@/lib/auth-helpers";
import { db } from "@/db";
import { resendConfig } from "@/db/schema";
import { encrypt, decrypt, maskKey } from "@/lib/crypto";

export async function GET() {
  const session = await requireSession();
  if (!isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = db.select().from(resendConfig).where(eq(resendConfig.id, "default")).get();

  const envKey = process.env.RESEND_API_KEY ?? "";
  const hasEnvKey = envKey.length > 0 && !envKey.startsWith("your-") && envKey.startsWith("re_");

  if (!row) {
    return NextResponse.json({
      configured: hasEnvKey,
      source: hasEnvKey ? "env" : null,
      masked_key: null,
      has_key: hasEnvKey,
      from_domain: process.env.RESEND_FROM_DOMAIN ?? "resend.dev",
    });
  }

  let maskedApiKey: string | null = null;
  try {
    if (row.apiKey) maskedApiKey = maskKey(decrypt(row.apiKey));
  } catch { /* unreadable */ }

  return NextResponse.json({
    configured: !!row.apiKey || hasEnvKey,
    source: row.apiKey ? "db" : hasEnvKey ? "env" : null,
    masked_key: maskedApiKey,
    has_key: !!row.apiKey,
    from_domain: row.fromDomain,
  });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { api_key, from_domain } = await request.json();

  const existing = db.select().from(resendConfig).where(eq(resendConfig.id, "default")).get();

  const isMasked = (k: string | undefined) => !k || k.includes("••");
  const encKey = isMasked(api_key) ? existing?.apiKey ?? null : encrypt(api_key);

  if (existing) {
    db.update(resendConfig).set({
      apiKey: encKey,
      fromDomain: from_domain || "resend.dev",
      updatedAt: new Date(),
    }).where(eq(resendConfig.id, "default")).run();
  } else {
    db.insert(resendConfig).values({
      apiKey: encKey,
      fromDomain: from_domain || "resend.dev",
    }).run();
  }

  return NextResponse.json({ success: true });
}

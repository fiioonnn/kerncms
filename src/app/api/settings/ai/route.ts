import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession, isAdminRole } from "@/lib/auth-helpers";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { encrypt, decrypt, maskKey } from "@/lib/crypto";

export async function GET() {
  const session = await requireSession();
  if (!isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await db.select().from(aiSettings).get();

  if (!row) {
    return NextResponse.json({
      provider_1: "anthropic",
      masked_key_1: null,
      has_key_1: false,
      primary_model: "claude-sonnet-4-5",
      provider_2: null,
      masked_key_2: null,
      has_key_2: false,
      fallback_model: null,
    });
  }

  let maskedKey1: string | null = null;
  let maskedKey2: string | null = null;

  try {
    if (row.apiKey1) maskedKey1 = maskKey(decrypt(row.apiKey1));
  } catch { /* key unreadable, treat as absent */ }

  try {
    if (row.apiKey2) maskedKey2 = maskKey(decrypt(row.apiKey2));
  } catch { /* key unreadable, treat as absent */ }

  return NextResponse.json({
    provider_1: row.provider1,
    masked_key_1: maskedKey1,
    has_key_1: !!row.apiKey1,
    primary_model: row.primaryModel,
    provider_2: row.provider2,
    masked_key_2: maskedKey2,
    has_key_2: !!row.apiKey2,
    fallback_model: row.fallbackModel,
  });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { provider_1, api_key_1, primary_model, provider_2, api_key_2, fallback_model } = body;

  if (!provider_1 || !primary_model) {
    return NextResponse.json({ error: "provider_1 and primary_model are required" }, { status: 400 });
  }

  const existing = await db.select().from(aiSettings).get();

  const isMasked = (k: string | undefined) => k === undefined || k === null || k.includes("••");

  const encKey1 = api_key_1 === "" ? null : isMasked(api_key_1) ? existing?.apiKey1 ?? null : encrypt(api_key_1);
  const encKey2 = api_key_2 === "" ? null : isMasked(api_key_2) ? existing?.apiKey2 ?? null : encrypt(api_key_2);

  if (existing) {
    await db.update(aiSettings).set({
      provider1: provider_1,
      apiKey1: encKey1,
      primaryModel: primary_model,
      provider2: provider_2 ?? null,
      apiKey2: encKey2,
      fallbackModel: fallback_model ?? null,
      updatedAt: new Date(),
    }).where(eq(aiSettings.id, existing.id));
  } else {
    await db.insert(aiSettings).values({
      provider1: provider_1,
      apiKey1: encKey1,
      primaryModel: primary_model,
      provider2: provider_2 ?? null,
      apiKey2: encKey2,
      fallbackModel: fallback_model ?? null,
    });
  }

  return NextResponse.json({ success: true });
}

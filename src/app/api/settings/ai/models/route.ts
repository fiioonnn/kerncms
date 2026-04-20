import { NextResponse } from "next/server";
import { requireSession, isAdminRole } from "@/lib/auth-helpers";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { decrypt } from "@/lib/crypto";

async function fetchModels(provider: string, apiKey: string): Promise<{ id: string; name: string }[]> {
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data ?? [])
      .filter((m: { id: string }) => /^claude-/.test(m.id))
      .sort((a: { created_at: string }, b: { created_at: string }) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .map((m: { id: string; display_name?: string }) => ({
        id: m.id,
        name: m.display_name ?? m.id,
      }));
  }

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const exclude = /^(text-|tts-|whisper-|dall-e|embedding|babbage|davinci|curie|ada|canary|ft:)/;
    return (data.data ?? [])
      .filter((m: { id: string }) => !exclude.test(m.id))
      .sort((a: { created: number }, b: { created: number }) => b.created - a.created)
      .map((m: { id: string }) => ({
        id: m.id,
        name: m.id,
      }));
  }

  return [];
}

export async function GET(request: Request) {
  const session = await requireSession();
  if (!isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const slot = searchParams.get("slot") ?? "primary";

  const row = db.select().from(aiSettings).get();
  if (!row) {
    return NextResponse.json({ models: [] });
  }

  const provider = slot === "fallback" ? row.provider2 : row.provider1;
  const encKey = slot === "fallback" ? row.apiKey2 : row.apiKey1;

  if (!provider || !encKey) {
    return NextResponse.json({ models: [] });
  }

  try {
    const apiKey = decrypt(encKey);
    const models = await fetchModels(provider, apiKey);
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] });
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { provider, api_key } = await request.json();

  if (!provider || !api_key) {
    return NextResponse.json({ error: "provider and api_key required" }, { status: 400 });
  }

  try {
    const models = await fetchModels(provider, api_key);
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] });
  }
}

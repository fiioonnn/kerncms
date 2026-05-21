import { NextResponse } from "next/server";
import { requireSession, isAdminRole } from "@/lib/auth-helpers";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { decrypt } from "@/lib/crypto";

export async function POST(request: Request) {
  const session = await requireSession();
  if (!isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { provider, api_key, slot } = await request.json();

  if (!provider || !api_key) {
    return NextResponse.json({ error: "provider and api_key required" }, { status: 400 });
  }

  let resolvedKey = api_key;
  if (resolvedKey.includes("••")) {
    const row = db.select().from(aiSettings).get();
    if (!row) return NextResponse.json({ error: "No saved key found" }, { status: 400 });
    try {
      const encrypted = slot === "fallback" ? row.apiKey2 : row.apiKey1;
      if (!encrypted) return NextResponse.json({ error: "No saved key found" }, { status: 400 });
      resolvedKey = decrypt(encrypted);
    } catch {
      return NextResponse.json({ error: "Could not decrypt saved key" }, { status: 500 });
    }
  }

  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": resolvedKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          error: data.error?.message ?? `HTTP ${res.status}`,
        });
      }
      return NextResponse.json({ success: true });
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resolvedKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          error: data.error?.message ?? `HTTP ${res.status}`,
        });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : "Connection failed",
    });
  }
}

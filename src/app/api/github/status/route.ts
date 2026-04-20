import { NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";
import { requireSession } from "@/lib/auth-helpers";

export async function GET() {
  await requireSession();
  try {
    const octokit = await getOctokit();
    if (!octokit) {
      return NextResponse.json(
        { ok: false, error: "GitHub App not configured. Set it up in Settings → Integrations." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: `GitHub App connection failed: ${message}` },
      { status: 503 },
    );
  }
}

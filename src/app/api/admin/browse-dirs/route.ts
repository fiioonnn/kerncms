import { NextResponse } from "next/server";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { requireSession } from "@/lib/auth-helpers";
import { homedir } from "os";

export async function GET(request: Request) {
  await requireSession();
  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get("path") || homedir();

  const safePath = rawPath.startsWith("/") ? rawPath : join(homedir(), rawPath);

  try {
    const entries = readdirSync(safePath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({ name: e.name, path: join(safePath, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ current: safePath, dirs });
  } catch {
    return NextResponse.json({ current: safePath, dirs: [], error: "Cannot read directory" });
  }
}

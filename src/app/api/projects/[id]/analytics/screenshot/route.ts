import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { db } from "@/db";
import { projectScreenshots } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { captureForPath, fileFor, hashPath } from "@/lib/screenshots";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin", "editor", "viewer"]);

  const url = new URL(req.url);
  const p = url.searchParams.get("path") || "/";
  const ph = hashPath(p);

  const row = db
    .select()
    .from(projectScreenshots)
    .where(and(eq(projectScreenshots.projectId, id), eq(projectScreenshots.pathHash, ph)))
    .get();

  if (!row || row.status !== "ready") {
    return new Response("Not ready", { status: 404 });
  }

  try {
    const buf = await fs.readFile(fileFor(id, ph));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin", "editor"]);

  const url = new URL(req.url);
  const p = url.searchParams.get("path") || "/";

  await captureForPath(id, p);

  const ph = hashPath(p);
  const row = db
    .select()
    .from(projectScreenshots)
    .where(and(eq(projectScreenshots.projectId, id), eq(projectScreenshots.pathHash, ph)))
    .get();

  if (row?.status === "failed") {
    return NextResponse.json({ error: row.error || "Capture failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, width: row?.width, height: row?.height });
}

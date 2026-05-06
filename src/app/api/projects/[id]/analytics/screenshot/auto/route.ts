import { NextResponse } from "next/server";
import { db } from "@/db";
import { pendingChanges, projectScreenshots } from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { chJson } from "@/db/clickhouse";
import { captureMany, hashPath } from "@/lib/screenshots";

const TEN_MIN_MS = 10 * 60 * 1000;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin", "editor", "viewer"]);

  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  let pathRows: { path: string; hits: number }[] = [];
  try {
    pathRows = await chJson<{ path: string; hits: number }>(`
      SELECT path, count() AS hits
      FROM events
      WHERE project_id = '${id}'
        AND timestamp >= now() - INTERVAL 30 DAY
        AND path != ''
      GROUP BY path
      ORDER BY hits DESC
      LIMIT 50
    `);
  } catch {
    return NextResponse.json({ ok: true, scheduled: 0 });
  }

  const now = Date.now();
  const recentChange = db
    .select({ updatedAt: pendingChanges.updatedAt })
    .from(pendingChanges)
    .where(
      and(
        eq(pendingChanges.projectId, id),
        gte(pendingChanges.updatedAt, new Date(now - TEN_MIN_MS)),
      ),
    )
    .get();
  const hasRecentEdit = !!recentChange;

  const existing = db
    .select()
    .from(projectScreenshots)
    .where(eq(projectScreenshots.projectId, id))
    .all();
  const byHash = new Map(existing.map((r) => [r.pathHash, r] as const));

  const toCapture: string[] = [];
  for (const row of pathRows) {
    const ph = hashPath(row.path);
    const s = byHash.get(ph);
    if (!s || s.status === "failed") {
      toCapture.push(row.path);
      continue;
    }
    if (s.status === "ready" && hasRecentEdit) {
      const capturedMs = s.capturedAt ? new Date(s.capturedAt).getTime() : 0;
      if (now - capturedMs >= TEN_MIN_MS) {
        toCapture.push(row.path);
      }
    }
  }

  if (toCapture.length > 0) {
    void captureMany(id, toCapture);
  }

  return NextResponse.json({ ok: true, scheduled: toCapture.length, hasRecentEdit });
}

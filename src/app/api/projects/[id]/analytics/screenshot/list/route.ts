import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectScreenshots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { chJson } from "@/db/clickhouse";
import { hashPath } from "@/lib/screenshots";

function chDateTime(d: Date): string {
  return `toDateTime('${d.toISOString().slice(0, 19).replace("T", " ")}', 'UTC')`;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin", "editor", "viewer"]);

  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return NextResponse.json({ paths: [] });
  }

  const url = new URL(req.url);
  let from = parseDate(url.searchParams.get("from"));
  let to = parseDate(url.searchParams.get("to"));
  if (!from || !to) {
    to = new Date();
    from = new Date(to.getTime() - 30 * 86_400_000);
  }
  const fromExpr = chDateTime(from);
  const toExpr = chDateTime(to);

  let pathRows: { path: string; hits: number }[] = [];
  try {
    pathRows = await chJson<{ path: string; hits: number }>(`
      SELECT path, count() AS hits
      FROM events
      WHERE project_id = '${id}'
        AND name = 'click'
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}
        AND path != ''
      GROUP BY path
      ORDER BY hits DESC
      LIMIT 100
    `);
  } catch {
    pathRows = [];
  }

  const screenshots = db
    .select()
    .from(projectScreenshots)
    .where(eq(projectScreenshots.projectId, id))
    .all();
  const byHash = new Map(screenshots.map((s) => [s.pathHash, s] as const));

  const paths = pathRows.map((r) => {
    const s = byHash.get(hashPath(r.path));
    return {
      path: r.path,
      hits: Number(r.hits),
      status: s?.status ?? "missing",
      capturedAt: s?.capturedAt ? new Date(s.capturedAt).toISOString() : null,
    };
  });

  return NextResponse.json({ paths });
}

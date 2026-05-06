import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectAnalytics } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { chJson } from "@/db/clickhouse";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin", "editor", "viewer"]);

  const settings = db.select().from(projectAnalytics).where(eq(projectAnalytics.projectId, id)).get();
  if (!settings) return NextResponse.json({ received: false, lastEventAt: null });

  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return NextResponse.json({ received: false, lastEventAt: null });
  }

  try {
    const rows = await chJson<{ last_at: string; total: number }>(`
      SELECT
        toString(max(timestamp)) AS last_at,
        count() AS total
      FROM events
      WHERE project_id = '${id}'
        AND timestamp >= now() - INTERVAL 1 HOUR
    `);
    const row = rows[0];
    const total = Number(row?.total ?? 0);
    if (total > 0 && !settings.verifiedAt) {
      db.update(projectAnalytics)
        .set({ verifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(projectAnalytics.projectId, id))
        .run();
    }
    return NextResponse.json({
      received: total > 0,
      lastEventAt: total > 0 ? row?.last_at ?? null : null,
      total,
    });
  } catch {
    return NextResponse.json({ received: false, lastEventAt: null });
  }
}

import { NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { chJson } from "@/db/clickhouse";

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
    return NextResponse.json({ sessions: [] });
  }

  const url = new URL(req.url);
  let from = parseDate(url.searchParams.get("from"));
  let to = parseDate(url.searchParams.get("to"));
  if (!from || !to) {
    to = new Date();
    from = new Date(to.getTime() - 7 * 86_400_000);
  }
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") ?? 100)));

  type Row = {
    session_hash: string;
    visitor_hash: string;
    started_at: string;
    ended_at: string;
    duration_s: number;
    pageviews: number;
    clicks: number;
    events: number;
    device: string;
    browser: string;
    os: string;
    country: string;
    referrer: string;
    entry_path: string;
    exit_path: string;
    paths: string[];
  };

  let rows: Row[] = [];
  try {
    rows = await chJson<Row>(`
      SELECT
        session_hash,
        any(visitor_hash) AS visitor_hash,
        toString(min(timestamp)) AS started_at,
        toString(max(timestamp)) AS ended_at,
        dateDiff('second', min(timestamp), max(timestamp)) AS duration_s,
        countIf(name = 'pageview') AS pageviews,
        countIf(name = 'click') AS clicks,
        count() AS events,
        any(device) AS device,
        any(browser) AS browser,
        any(os) AS os,
        any(country) AS country,
        any(referrer) AS referrer,
        argMin(path, timestamp) AS entry_path,
        argMax(path, timestamp) AS exit_path,
        groupUniqArray(path) AS paths
      FROM events
      WHERE project_id = '${id}'
        AND session_hash != ''
        AND timestamp >= ${chDateTime(from)}
        AND timestamp <= ${chDateTime(to)}
      GROUP BY session_hash
      ORDER BY min(timestamp) DESC
      LIMIT ${limit}
    `);
  } catch {
    rows = [];
  }

  return NextResponse.json({
    sessions: rows.map((r) => ({
      sessionHash: r.session_hash,
      visitorHash: r.visitor_hash,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      durationSeconds: Number(r.duration_s ?? 0),
      pageviews: Number(r.pageviews ?? 0),
      clicks: Number(r.clicks ?? 0),
      events: Number(r.events ?? 0),
      device: r.device || "desktop",
      browser: r.browser || "",
      os: r.os || "",
      country: r.country || "",
      referrer: r.referrer || "",
      entryPath: r.entry_path || "",
      exitPath: r.exit_path || "",
      paths: r.paths ?? [],
    })),
  });
}

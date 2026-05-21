import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectAnalytics } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { chJson } from "@/db/clickhouse";

type Bucket = "hour" | "day" | "week";

function uuidLiteral(id: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Invalid project id");
  return `'${id}'`;
}

function chDateTime(d: Date): string {
  return `toDateTime('${d.toISOString().slice(0, 19).replace("T", " ")}', 'UTC')`;
}

function pickBucket(fromMs: number, toMs: number): Bucket {
  const hours = (toMs - fromMs) / 3_600_000;
  if (hours <= 36) return "hour";
  const days = hours / 24;
  if (days <= 92) return "day";
  return "week";
}

function bucketStartExpr(b: Bucket, col: string): string {
  if (b === "hour") return `toStartOfHour(${col})`;
  if (b === "week") return `toStartOfWeek(${col}, 1)`;
  return `toDate(${col})`;
}

function stepMs(b: Bucket): number {
  if (b === "hour") return 3_600_000;
  if (b === "week") return 7 * 86_400_000;
  return 86_400_000;
}

function bucketKey(d: Date, b: Bucket): string {
  if (b === "hour") {
    return `${d.toISOString().slice(0, 10)} ${String(d.getUTCHours()).padStart(2, "0")}`;
  }
  return d.toISOString().slice(0, 10);
}

function alignBucketStart(d: Date, b: Bucket): Date {
  const out = new Date(d);
  if (b === "hour") {
    out.setUTCMinutes(0, 0, 0);
  } else if (b === "week") {
    out.setUTCHours(0, 0, 0, 0);
    const dow = out.getUTCDay();
    const back = dow === 0 ? 6 : dow - 1;
    out.setUTCDate(out.getUTCDate() - back);
  } else {
    out.setUTCHours(0, 0, 0, 0);
  }
  return out;
}

function formatLabel(d: Date, b: Bucket): string {
  if (b === "hour") return `${String(d.getUTCHours()).padStart(2, "0")}:00`;
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${d.getUTCDate()}`;
}

function buildBuckets(from: Date, to: Date, b: Bucket): { key: string; label: string; date: Date }[] {
  const start = alignBucketStart(from, b);
  const step = stepMs(b);
  const out: { key: string; label: string; date: Date }[] = [];
  let cur = start.getTime();
  const end = to.getTime();
  while (cur <= end) {
    const d = new Date(cur);
    out.push({ key: bucketKey(d, b), label: formatLabel(d, b), date: d });
    cur += step;
  }
  return out;
}

function fillSeries(
  buckets: { key: string }[],
  rows: { bucket: string; value: number }[]
): number[] {
  const map = new Map(rows.map((r) => [r.bucket, r.value]));
  return buckets.map((b) => map.get(b.key) ?? 0);
}

function delta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
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

  const url = new URL(req.url);
  let from = parseDate(url.searchParams.get("from"));
  let to = parseDate(url.searchParams.get("to"));
  const filterPath = url.searchParams.get("path") || "";
  const filterPathSql = filterPath ? `'${filterPath.replace(/'/g, "''")}'` : "";
  const pathClause = filterPathSql ? `AND path = ${filterPathSql}` : "";

  if (!from || !to) {
    const rangeKey = url.searchParams.get("range") ?? "7d";
    const days = rangeKey === "30d" ? 30 : rangeKey === "14d" ? 14 : 7;
    to = new Date();
    from = new Date(to.getTime() - (days - 1) * 86_400_000);
    from.setUTCHours(0, 0, 0, 0);
  }

  if (from.getTime() > to.getTime()) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const settings = db.select().from(projectAnalytics).where(eq(projectAnalytics.projectId, id)).get();
  if (!settings) {
    return NextResponse.json({ error: "Analytics not configured" }, { status: 404 });
  }

  const pid = uuidLiteral(id);
  const bucket = pickBucket(from.getTime(), to.getTime());
  const buckets = buildBuckets(from, to, bucket);
  const rangeMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - rangeMs);

  const fromExpr = chDateTime(from);
  const toExpr = chDateTime(to);
  const prevFromExpr = chDateTime(prevFrom);
  const prevToExpr = chDateTime(prevTo);
  const bucketStart = bucketStartExpr(bucket, "timestamp");
  const bucketColExpr =
    bucket === "hour"
      ? `formatDateTime(${bucketStart}, '%Y-%m-%d %H')`
      : `toString(${bucketStart})`;

  const [
    [cur],
    [prev],
    chartRows,
    topPagesRows,
    sourcesRows,
    devicesRows,
    heatmapRows,
    countriesRows,
  ] = await Promise.all([
    chJson<{ visitors: number; pageviews: number; bounce_rate: number }>(`
      SELECT
        uniqIf(visitor_hash, name = 'pageview' AND visitor_hash != '') AS visitors,
        countIf(name = 'pageview') AS pageviews,
        coalesce((
          SELECT countIf(views = 1) * 100.0 / nullif(count(), 0)
          FROM (
            SELECT countIf(name = 'pageview') AS views
            FROM events
            WHERE project_id = ${pid}
              AND timestamp >= ${fromExpr}
              AND timestamp <= ${toExpr}
              AND visitor_hash != ''
              ${pathClause}
            GROUP BY session_hash
          )
        ), 0) AS bounce_rate
      FROM events
      WHERE project_id = ${pid}
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}
        ${pathClause}
    `),
    chJson<{ visitors: number; pageviews: number; bounce_rate: number }>(`
      SELECT
        uniqIf(visitor_hash, name = 'pageview' AND visitor_hash != '') AS visitors,
        countIf(name = 'pageview') AS pageviews,
        coalesce((
          SELECT countIf(views = 1) * 100.0 / nullif(count(), 0)
          FROM (
            SELECT countIf(name = 'pageview') AS views
            FROM events
            WHERE project_id = ${pid}
              AND timestamp >= ${prevFromExpr}
              AND timestamp <= ${prevToExpr}
              AND visitor_hash != ''
              ${pathClause}
            GROUP BY session_hash
          )
        ), 0) AS bounce_rate
      FROM events
      WHERE project_id = ${pid}
        AND timestamp >= ${prevFromExpr}
        AND timestamp <= ${prevToExpr}
        ${pathClause}
    `),
    chJson<{ bucket: string; visitors: number; pageviews: number }>(`
      SELECT
        ${bucketColExpr} AS bucket,
        uniqIf(visitor_hash, name = 'pageview' AND visitor_hash != '') AS visitors,
        countIf(name = 'pageview') AS pageviews
      FROM events
      WHERE project_id = ${pid}
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}
        ${pathClause}
      GROUP BY bucket
      ORDER BY bucket
    `),
    chJson<{ path: string; views: number }>(`
      SELECT path, count() AS views
      FROM events
      WHERE project_id = ${pid}
        AND name = 'pageview'
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}
      GROUP BY path
      ORDER BY views DESC
      LIMIT 10
    `),
    chJson<{ source: string; views: number }>(`
      SELECT
        coalesce(nullif(domain(referrer), ''), 'Direct') AS source,
        count() AS views
      FROM events
      WHERE project_id = ${pid}
        AND name = 'pageview'
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}
        ${pathClause}
      GROUP BY source
      ORDER BY views DESC
      LIMIT 6
    `),
    chJson<{ device_type: string; views: number }>(`
      SELECT
        multiIf(
          device IN ('mobile', 'tablet'), device,
          device IN ('', 'desktop'), 'desktop',
          'other'
        ) AS device_type,
        count() AS views
      FROM events
      WHERE project_id = ${pid}
        AND name = 'pageview'
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}
        ${pathClause}
      GROUP BY device_type
      ORDER BY views DESC
    `),
    chJson<{ x: number; y: number; hits: number }>(`
      SELECT
        intDiv(click_x_pct, 25) * 25 + 12 AS x,
        intDiv(click_y_pct, 25) * 25 + 12 AS y,
        count() AS hits
      FROM events
      WHERE project_id = ${pid}
        AND name = 'click'
        AND (click_x_pct > 0 OR click_y_pct > 0)
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}
        ${pathClause}
      GROUP BY x, y
      ORDER BY hits DESC
      LIMIT 800
    `),
    chJson<{ country: string; lat: number; lng: number; visitors: number }>(`
      SELECT
        country,
        avg(lat) AS lat,
        avg(lng) AS lng,
        uniq(visitor_hash) AS visitors
      FROM events
      WHERE project_id = ${pid}
        AND name = 'pageview'
        AND country != ''
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}
        ${pathClause}
      GROUP BY country
      ORDER BY visitors DESC
      LIMIT 50
    `),
  ]);

  const visitorsSeries = fillSeries(buckets, chartRows.map((r) => ({ bucket: r.bucket, value: Number(r.visitors) })));
  const pageviewsSeries = fillSeries(buckets, chartRows.map((r) => ({ bucket: r.bucket, value: Number(r.pageviews) })));
  const bounceSeries = visitorsSeries.map(() => Number(cur?.bounce_rate ?? 0));

  const sourcesTotal = sourcesRows.reduce((s, r) => s + Number(r.views), 0);
  const sources = sourcesRows.map((r) => ({
    name: r.source,
    share: sourcesTotal > 0 ? Math.round((Number(r.views) / sourcesTotal) * 100) : 0,
  }));

  const devicesTotal = devicesRows.reduce((s, r) => s + Number(r.views), 0);
  const DEVICE_LABEL: Record<string, string> = {
    desktop: "Desktop",
    mobile: "Mobile",
    tablet: "Tablet",
    other: "Other",
  };
  const devices = devicesRows.map((r) => ({
    name: DEVICE_LABEL[r.device_type] ?? "Other",
    share: devicesTotal > 0 ? Math.round((Number(r.views) / devicesTotal) * 100) : 0,
  }));

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString(), bucket },
    chartLabels: buckets.map((b) => b.label),
    metrics: {
      visitors: {
        value: Number(cur?.visitors ?? 0),
        delta: delta(Number(cur?.visitors ?? 0), Number(prev?.visitors ?? 0)),
        points: visitorsSeries,
      },
      pageviews: {
        value: Number(cur?.pageviews ?? 0),
        delta: delta(Number(cur?.pageviews ?? 0), Number(prev?.pageviews ?? 0)),
        points: pageviewsSeries,
      },
      bounceRate: {
        value: Number(cur?.bounce_rate ?? 0),
        delta: delta(Number(cur?.bounce_rate ?? 0), Number(prev?.bounce_rate ?? 0)),
        points: bounceSeries,
      },
    },
    topPages: topPagesRows.map((r) => ({ path: r.path, views: Number(r.views) })),
    sources,
    devices,
    heatmap: heatmapRows.map((r) => ({ x: Number(r.x), y: Number(r.y), hits: Number(r.hits) })),
    countries: countriesRows.map((r) => ({
      country: r.country,
      lat: Number(r.lat ?? 0),
      lng: Number(r.lng ?? 0),
      visitors: Number(r.visitors ?? 0),
    })),
  });
}

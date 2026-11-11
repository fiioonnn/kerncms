import "server-only";
import { createHash } from "node:crypto";
import { and, count, countDistinct, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { pageViews } from "@/db/schema";

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|curl|wget|python|monitor/i;

export function isBot(userAgent: string) {
  return !userAgent || BOT.test(userAgent);
}

export function deviceOf(userAgent: string, width?: number) {
  if (/ipad|tablet/i.test(userAgent) || (width && width >= 640 && width < 1024)) return "tablet";
  if (/mobi|iphone|android/i.test(userAgent) || (width && width < 640)) return "mobile";
  return "desktop";
}

export function browserOf(userAgent: string) {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/firefox|fxios/i.test(userAgent)) return "Firefox";
  if (/opr\/|opera/i.test(userAgent)) return "Opera";
  if (/chrome|crios/i.test(userAgent)) return "Chrome";
  if (/safari/i.test(userAgent)) return "Safari";
  return "Andere";
}

/**
 * Anonymous visitor id that changes every day, so visitors can be counted
 * per day without cookies and without storing the IP address (like Plausible).
 */
export function visitorHash(siteId: string, ip: string, userAgent: string) {
  const day = new Date().toISOString().slice(0, 10);
  const secret = process.env.KERN_SECRET ?? "kern-dev-secret";
  return createHash("sha256").update(`${secret}|${day}|${siteId}|${ip}|${userAgent}`).digest("hex").slice(0, 24);
}

export function referrerHost(referrer: string | undefined | null, siteHost: string | null) {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (siteHost && host === siteHost.replace(/^www\./, "")) return null;
    if (host === "localhost" || host === "127.0.0.1") return null;
    return host;
  } catch {
    return null;
  }
}

export type Range = { from: Date; to: Date; days: number };

export function rangeFor(days: number): Range {
  const to = new Date();
  const from = new Date(to);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  return { from, to, days };
}

function previousRange(range: Range): Range {
  const span = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - span), to: range.from, days: range.days };
}

async function totals(siteId: string, range: Range) {
  const [row] = await db
    .select({ views: count(), visitors: countDistinct(pageViews.visitor) })
    .from(pageViews)
    .where(and(eq(pageViews.siteId, siteId), gte(pageViews.createdAt, range.from), lt(pageViews.createdAt, range.to)));
  return row;
}

function change(now: number, before: number) {
  if (before === 0) return now > 0 ? 100 : 0;
  return Math.round(((now - before) / before) * 100);
}

export async function analyticsSummary(siteId: string, days: number) {
  const range = rangeFor(days);
  const where = and(eq(pageViews.siteId, siteId), gte(pageViews.createdAt, range.from), lt(pageViews.createdAt, range.to));
  const [now, before, perDay, pages, referrers, devices, browsers, live] = await Promise.all([
    totals(siteId, range),
    totals(siteId, previousRange(range)),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${pageViews.createdAt}), 'YYYY-MM-DD')`,
        views: count(),
        visitors: countDistinct(pageViews.visitor),
      })
      .from(pageViews)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ path: pageViews.path, views: count(), visitors: countDistinct(pageViews.visitor) })
      .from(pageViews)
      .where(where)
      .groupBy(pageViews.path)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({ source: sql<string>`coalesce(${pageViews.referrer}, 'Direkt')`, visitors: countDistinct(pageViews.visitor) })
      .from(pageViews)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(desc(countDistinct(pageViews.visitor)))
      .limit(8),
    db.select({ device: pageViews.device, visitors: countDistinct(pageViews.visitor) }).from(pageViews).where(where).groupBy(pageViews.device),
    db
      .select({ browser: pageViews.browser, visitors: countDistinct(pageViews.visitor) })
      .from(pageViews)
      .where(where)
      .groupBy(pageViews.browser)
      .orderBy(desc(countDistinct(pageViews.visitor))),
    db
      .select({ visitors: countDistinct(pageViews.visitor) })
      .from(pageViews)
      .where(and(eq(pageViews.siteId, siteId), gte(pageViews.createdAt, new Date(Date.now() - 5 * 60_000)))),
  ]);

  // Fill days without visits so the chart has one point per day.
  const byDay = new Map(perDay.map((d) => [d.day, d]));
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(range.from);
    d.setDate(d.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const row = byDay.get(key);
    return { day: key, views: row?.views ?? 0, visitors: row?.visitors ?? 0 };
  });

  const totalDevices = devices.reduce((sum, d) => sum + d.visitors, 0) || 1;
  return {
    days,
    visitors: now.visitors,
    views: now.views,
    viewsPerVisit: now.visitors ? Math.round((now.views / now.visitors) * 10) / 10 : 0,
    visitorsChange: change(now.visitors, before.visitors),
    viewsChange: change(now.views, before.views),
    live: live[0]?.visitors ?? 0,
    series,
    pages,
    referrers,
    devices: devices.map((d) => ({ ...d, share: Math.round((d.visitors / totalDevices) * 100) })),
    browsers,
  };
}

export type AnalyticsSummary = Awaited<ReturnType<typeof analyticsSummary>>;

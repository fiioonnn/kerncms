import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { and, count, countDistinct, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsEvents, analyticsSalts, pageViews } from "@/db/schema";
import { timezoneCountries } from "@/lib/timezone-countries";

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|curl|wget|python|monitor|scan|fetch|http-client|axios|go-http|java\//i;

export function isBot(userAgent: string) {
  return !userAgent || BOT.test(userAgent);
}

export function deviceOf(userAgent: string, width?: number) {
  if (/ipad|tablet/i.test(userAgent) || (width && width >= 640 && width < 1024)) return "tablet";
  if (/mobi|iphone|android/i.test(userAgent) || (width && width < 640)) return "mobile";
  return "desktop";
}

export function browserOf(userAgent: string) {
  if (/edg(e|a|ios)?\//i.test(userAgent)) return "Edge";
  if (/samsungbrowser/i.test(userAgent)) return "Samsung Internet";
  if (/firefox|fxios/i.test(userAgent)) return "Firefox";
  if (/opr\/|opera/i.test(userAgent)) return "Opera";
  if (/chrome|crios/i.test(userAgent)) return "Chrome";
  if (/safari/i.test(userAgent)) return "Safari";
  return "Andere";
}

export function osOf(userAgent: string) {
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
  if (/android/i.test(userAgent)) return "Android";
  if (/cros/i.test(userAgent)) return "ChromeOS";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/mac os x|macintosh/i.test(userAgent)) return "macOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Andere";
}

const GEO_HEADERS = ["cf-ipcountry", "x-vercel-ip-country", "cloudfront-viewer-country", "x-country-code", "x-geo-country"];

/**
 * Country of the visitor without storing the IP: the geo header a CDN/proxy (Cloudflare, Vercel,
 * CloudFront) derives from the IP, otherwise the browser's time zone.
 */
export function countryOf(headers: Headers, timeZone?: unknown) {
  for (const name of GEO_HEADERS) {
    const value = headers.get(name)?.trim().toUpperCase();
    if (value && /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1") return value;
  }
  if (typeof timeZone === "string") return timezoneCountries[timeZone] ?? null;
  return null;
}

/** Main language from Accept-Language, e.g. "de-CH,de;q=0.9" → "de". */
export function languageOf(acceptLanguage: string | null) {
  const first = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim().toLowerCase();
  const code = first?.split("-")[0];
  return code && /^[a-z]{2,3}$/.test(code) ? code : null;
}

/** utm_source / utm_medium / utm_campaign (plus the common ?ref= and ?source=) from a query string. */
export function campaignOf(query: unknown) {
  if (typeof query !== "string" || !query) return { utmSource: null, utmMedium: null, utmCampaign: null };
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const clean = (v: string | null) => (v ? v.trim().toLowerCase().slice(0, 100) || null : null);
  return {
    utmSource: clean(params.get("utm_source") ?? params.get("ref") ?? params.get("source")),
    utmMedium: clean(params.get("utm_medium")),
    utmCampaign: clean(params.get("utm_campaign")),
  };
}

const SEARCH = /(^|\.)(google|bing|duckduckgo|ecosia|yahoo|qwant|startpage|yandex|baidu|brave|search\.brave|ask|web|t-online|gmx|metager)\./;
const SOCIAL =
  /(^|\.)(facebook|fb|instagram|linkedin|lnkd|t\.co|x|twitter|pinterest|youtube|tiktok|reddit|xing|whatsapp|threads|mastodon|bsky|snapchat|telegram)\./;
const AI = /(^|\.)(chatgpt|openai|perplexity|claude|gemini|copilot)\./;

export const CHANNELS = ["Direkt", "Suchmaschinen", "Soziale Netzwerke", "KI-Assistenten", "E-Mail", "Werbung", "Andere Websites"] as const;

/** Marketing channel of a visit from its referrer and utm_medium. */
export function channelOf(referrer: string | null, medium: string | null) {
  if (medium) {
    if (/mail|newsletter/.test(medium)) return "E-Mail";
    if (/cpc|ppc|paid|ads?$|display|banner/.test(medium)) return "Werbung";
    if (/social/.test(medium)) return "Soziale Netzwerke";
  }
  if (!referrer) return "Direkt";
  const host = `${referrer}.`;
  if (AI.test(host)) return "KI-Assistenten";
  if (SEARCH.test(host)) return "Suchmaschinen";
  if (SOCIAL.test(host)) return "Soziale Netzwerke";
  if (/mail\./.test(host)) return "E-Mail";
  return "Andere Websites";
}

/* ---------- Visitor hash ---------- */

const saltCache = ((globalThis as { __kernSalt?: { day: string; salt: string } }).__kernSalt ??= { day: "", salt: "" });

/**
 * Random salt for today (UTC). Created on the first visit of the day and stored so all server
 * instances agree; salts from before yesterday are deleted, which makes old hashes irreversible.
 */
async function dailySalt() {
  const day = new Date().toISOString().slice(0, 10);
  if (saltCache.day === day) return saltCache.salt;
  await db
    .insert(analyticsSalts)
    .values({ day, salt: randomBytes(32).toString("hex") })
    .onConflictDoNothing();
  const [row] = await db.select().from(analyticsSalts).where(eq(analyticsSalts.day, day)).limit(1);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await db.delete(analyticsSalts).where(lt(analyticsSalts.day, yesterday));
  saltCache.day = day;
  saltCache.salt = row.salt;
  return row.salt;
}

/**
 * Anonymous visitor id: IP + browser, hashed with a random salt that changes every day and is then
 * deleted (like Plausible). Visitors can be counted per day, but not recognised or traced back.
 */
export async function visitorHash(siteId: string, ip: string, userAgent: string, personal = false) {
  // Personal statistics: lasting id from IP + browser with a fixed server secret, so returning visitors
  // are recognised. Nothing is stored in the browser (no cookies, no localStorage).
  const salt = personal ? `lasting|${process.env.KERN_SECRET ?? "kern-dev-secret"}` : await dailySalt();
  return createHash("sha256").update(`${salt}|${siteId}|${ip}|${userAgent}`).digest("hex").slice(0, 24);
}

/* ---------- Visits ---------- */

const VISIT_GAP_MS = 30 * 60_000;
const MAX_DURATION = 30 * 60;

/** Last page view of this visitor in the running visit, if any. */
async function lastViewInVisit(siteId: string, visitor: string, path?: string) {
  const [row] = await db
    .select({ id: pageViews.id, session: pageViews.session, createdAt: pageViews.createdAt, duration: pageViews.duration })
    .from(pageViews)
    .where(
      and(
        eq(pageViews.siteId, siteId),
        eq(pageViews.visitor, visitor),
        gte(pageViews.createdAt, new Date(Date.now() - VISIT_GAP_MS)),
        path ? eq(pageViews.path, path) : undefined,
      ),
    )
    .orderBy(desc(pageViews.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Continues the visitor's running visit or starts a new one. The previous page gets the time until
 * this view as its duration, unless the website already reported the exact visible time.
 */
export async function continueVisit(siteId: string, visitor: string) {
  const last = await lastViewInVisit(siteId, visitor);
  if (!last?.session) return randomBytes(9).toString("base64url");
  if (last.duration == null) {
    const seconds = Math.min(MAX_DURATION, Math.round((Date.now() - last.createdAt.getTime()) / 1000));
    await db.update(pageViews).set({ duration: seconds }).where(eq(pageViews.id, last.id));
  }
  return last.session;
}

/** Leave ping from the website: visible seconds on the page. */
export async function recordDuration(siteId: string, visitor: string, path: string, seconds: number) {
  const last = await lastViewInVisit(siteId, visitor, path);
  if (!last) return;
  const value = Math.max(0, Math.min(MAX_DURATION, Math.round(seconds)));
  await db.update(pageViews).set({ duration: value }).where(eq(pageViews.id, last.id));
}

export async function recordEvent(siteId: string, visitor: string, kind: "tel" | "mailto" | "download" | "outbound", target: string, path: string) {
  await db.insert(analyticsEvents).values({ siteId, visitor, kind, target: target.slice(0, 300), path: path.slice(0, 300) });
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

/** Share in percent with one decimal. */
function rate(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0;
}

function change(now: number, before: number) {
  if (before === 0) return now > 0 ? 100 : 0;
  return Math.round(((now - before) / before) * 100);
}

type VisitTotals = { views: number; visitors: number; visits: number; avgDuration: number };

/** Views, visitors and visit figures (duration of a visit = sum of its page times). */
async function totals(siteId: string, range: Range): Promise<VisitTotals> {
  const [row] = await db.execute<{ views: string; visitors: string; visits: string; avg_duration: string | null }>(sql`
    with v as (
      select session, visitor, duration from page_views
      where site_id = ${siteId} and created_at >= ${range.from.toISOString()} and created_at < ${range.to.toISOString()}
    ), s as (
      select session, coalesce(sum(duration), 0) as seconds from v where session is not null group by session
    )
    select
      (select count(*) from v) as views,
      (select count(distinct visitor) from v) as visitors,
      (select count(*) from s) as visits,
      (select avg(seconds) from s) as avg_duration
  `);
  return {
    views: Number(row.views),
    visitors: Number(row.visitors),
    visits: Number(row.visits),
    avgDuration: Math.round(Number(row.avg_duration ?? 0)),
  };
}

export type RecentVisit = {
  session: string;
  start: string;
  ip: string | null;
  country: string | null;
  device: string;
  browser: string;
  os: string | null;
  referrer: string | null;
  entry: string;
  pages: number;
  seconds: number;
  returning: boolean;
};

/** Latest visits with details (personal statistics only). */
async function recentVisits(siteId: string, range: Range): Promise<RecentVisit[]> {
  const rows = await db.execute<{
    session: string;
    visitor: string;
    first_at: Date;
    start: string;
    ip: string | null;
    country: string | null;
    device: string;
    browser: string;
    os: string | null;
    referrer: string | null;
    entry: string;
    pages: string;
    seconds: string;
    returning: boolean;
  }>(sql`
    select s.*, exists (
      select 1 from page_views p where p.site_id = ${siteId} and p.visitor = s.visitor and p.created_at < s.first_at - interval '30 minutes'
    ) as returning
    from (
      -- created_at is UTC without time zone; format it as ISO so it isn't read as local time.
      select session, visitor, min(created_at) as first_at, to_char(min(created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as start,
        (array_agg(ip order by created_at))[1] as ip,
        (array_agg(country order by created_at))[1] as country,
        (array_agg(device order by created_at))[1] as device,
        (array_agg(browser order by created_at))[1] as browser,
        (array_agg(os order by created_at))[1] as os,
        (array_agg(referrer order by created_at))[1] as referrer,
        (array_agg(path order by created_at))[1] as entry,
        count(*) as pages, coalesce(sum(duration), 0) as seconds
      from page_views
      where site_id = ${siteId} and created_at >= ${range.from.toISOString()} and created_at < ${range.to.toISOString()} and session is not null
      group by session, visitor
      order by first_at desc limit 50
    ) s
  `);
  return rows.map((r) => ({
    session: r.session,
    start: r.start,
    ip: r.ip,
    country: r.country,
    device: r.device,
    browser: r.browser,
    os: r.os,
    referrer: r.referrer,
    entry: r.entry,
    pages: Number(r.pages),
    seconds: Number(r.seconds),
    returning: r.returning,
  }));
}

/**
 * Visits that led to a contact: a form message (not spam), a click on a phone number or a mail address
 * by the same visitor during the visit (or up to 30 minutes after its last page).
 */
async function contactVisits(siteId: string, range: Range) {
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  const rows = await db.execute<{ referrer: string | null; medium: string | null; visits: string }>(sql`
    with contacts as (
      select visitor, created_at from form_submissions
      where site_id = ${siteId} and not spam and visitor is not null and created_at >= ${from} and created_at < ${to}
      union all
      select visitor, created_at from analytics_events
      where site_id = ${siteId} and kind in ('tel', 'mailto') and created_at >= ${from} and created_at < ${to}
    ), visits as (
      select session, visitor, min(created_at) as first_at, max(created_at) as last_at,
        (array_agg(referrer order by created_at))[1] as referrer,
        (array_agg(utm_medium order by created_at))[1] as medium
      from page_views
      where site_id = ${siteId} and session is not null and created_at >= ${from} and created_at < ${to}
      group by session, visitor
    )
    select referrer, medium, count(*) as visits from visits v
    where exists (
      select 1 from contacts c
      where c.visitor = v.visitor and c.created_at >= v.first_at and c.created_at <= v.last_at + interval '30 minutes'
    )
    group by referrer, medium
  `);
  const byChannel = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    const n = Number(row.visits);
    total += n;
    const channel = channelOf(row.referrer, row.medium);
    byChannel.set(channel, (byChannel.get(channel) ?? 0) + n);
  }
  return { total, channels: [...byChannel].map(([channel, visits]) => ({ channel, visits })).sort((a, b) => b.visits - a.visits) };
}

async function formCount(siteId: string, range: Range) {
  const [row] = await db.execute<{ n: string }>(sql`
    select count(*) as n from form_submissions
    where site_id = ${siteId} and not spam and created_at >= ${range.from.toISOString()} and created_at < ${range.to.toISOString()}
  `);
  return Number(row.n);
}

const LOCAL_TZ = "Europe/Berlin";

/** Page views per weekday (1 = Monday) and hour in German time, for the peak-times heatmap. */
async function peakTimes(siteId: string, range: Range) {
  const rows = await db.execute<{ dow: number; hour: number; views: string }>(sql`
    select extract(isodow from local)::int as dow, extract(hour from local)::int as hour, count(*) as views
    from (
      select created_at at time zone 'UTC' at time zone ${LOCAL_TZ} as local from page_views
      where site_id = ${siteId} and created_at >= ${range.from.toISOString()} and created_at < ${range.to.toISOString()}
    ) t
    group by 1, 2
  `);
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const r of rows) grid[Number(r.dow) - 1][Number(r.hour)] = Number(r.views);
  return grid;
}

export async function analyticsSummary(siteId: string, days: number, personal = false) {
  const range = rangeFor(days);
  const where = and(eq(pageViews.siteId, siteId), gte(pageViews.createdAt, range.from), lt(pageViews.createdAt, range.to));
  const eventsWhere = and(eq(analyticsEvents.siteId, siteId), gte(analyticsEvents.createdAt, range.from), lt(analyticsEvents.createdAt, range.to));
  const visitors = countDistinct(pageViews.visitor);

  const [now, before, perDay, pages, referrers, sources, campaigns, devices, browsers, countries, events, live, recent, contacts, contactsBefore, forms, peaks, returning] =
    await Promise.all([
      totals(siteId, range),
      totals(siteId, previousRange(range)),
      db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${pageViews.createdAt}), 'YYYY-MM-DD')`,
          views: count(),
          visitors,
        })
        .from(pageViews)
        .where(where)
        .groupBy(sql`1`)
        .orderBy(sql`1`),
      db
        .select({ path: pageViews.path, views: count(), visitors, avgSeconds: sql<string | null>`avg(${pageViews.duration})` })
        .from(pageViews)
        .where(where)
        .groupBy(pageViews.path)
        .orderBy(desc(count()))
        .limit(10),
      db
        .select({ source: sql<string>`coalesce(${pageViews.referrer}, 'Direkt')`, visitors })
        .from(pageViews)
        .where(where)
        .groupBy(sql`1`)
        .orderBy(desc(visitors))
        .limit(10),
      // Referrer + utm_medium pairs, grouped into channels below.
      db
        .select({ referrer: pageViews.referrer, medium: pageViews.utmMedium, visitors })
        .from(pageViews)
        .where(where)
        .groupBy(pageViews.referrer, pageViews.utmMedium),
      db
        .select({ source: pageViews.utmSource, campaign: pageViews.utmCampaign, medium: pageViews.utmMedium, visitors })
        .from(pageViews)
        .where(and(where, isNotNull(pageViews.utmSource)))
        .groupBy(pageViews.utmSource, pageViews.utmCampaign, pageViews.utmMedium)
        .orderBy(desc(visitors))
        .limit(10),
      db.select({ device: pageViews.device, visitors }).from(pageViews).where(where).groupBy(pageViews.device),
      db.select({ browser: pageViews.browser, visitors }).from(pageViews).where(where).groupBy(pageViews.browser).orderBy(desc(visitors)).limit(10),
      db.select({ country: pageViews.country, visitors }).from(pageViews).where(and(where, isNotNull(pageViews.country))).groupBy(pageViews.country).orderBy(desc(visitors)).limit(15),
      db
        .select({ kind: analyticsEvents.kind, target: analyticsEvents.target, clicks: count(), visitors: countDistinct(analyticsEvents.visitor) })
        .from(analyticsEvents)
        .where(eventsWhere)
        .groupBy(analyticsEvents.kind, analyticsEvents.target)
        .orderBy(desc(count()))
        .limit(20),
      db
        .select({ visitors })
        .from(pageViews)
        .where(and(eq(pageViews.siteId, siteId), gte(pageViews.createdAt, new Date(Date.now() - 5 * 60_000)))),
      personal ? recentVisits(siteId, range) : Promise.resolve([] as RecentVisit[]),
      contactVisits(siteId, range),
      contactVisits(siteId, previousRange(range)),
      formCount(siteId, range),
      peakTimes(siteId, range),
      // Visitors seen on more than one day in the range (only meaningful with lasting ids).
      personal
        ? db.execute<{ n: string }>(sql`
            select count(*) as n from (
              select visitor from page_views
              where site_id = ${siteId} and created_at >= ${range.from.toISOString()} and created_at < ${range.to.toISOString()}
              group by visitor having count(distinct date_trunc('day', created_at)) > 1
            ) r
          `)
        : Promise.resolve([{ n: "0" }]),
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

  const channelTotals = new Map<string, number>();
  for (const row of sources) {
    const channel = channelOf(row.referrer, row.medium);
    channelTotals.set(channel, (channelTotals.get(channel) ?? 0) + row.visitors);
  }
  const channels = [...channelTotals].map(([channel, visitors]) => ({ channel, visitors })).sort((a, b) => b.visitors - a.visitors);

  const totalDevices = devices.reduce((sum, d) => sum + d.visitors, 0) || 1;
  const eventTotals = { tel: 0, mailto: 0, download: 0, outbound: 0 };
  for (const e of events) eventTotals[e.kind] += e.clicks;

  return {
    days,
    personal,
    visitors: now.visitors,
    views: now.views,
    visits: now.visits,
    viewsPerVisit: now.visits ? Math.round((now.views / now.visits) * 10) / 10 : 0,
    avgDuration: now.avgDuration,
    visitorsChange: change(now.visitors, before.visitors),
    viewsChange: change(now.views, before.views),
    durationChange: change(now.avgDuration, before.avgDuration),
    returning: Number(returning[0]?.n ?? 0),
    live: live[0]?.visitors ?? 0,
    series,
    pages: pages.map((p) => ({ ...p, avgSeconds: p.avgSeconds == null ? null : Math.round(Number(p.avgSeconds)) })),
    referrers,
    channels,
    campaigns,
    devices: devices.map((d) => ({ ...d, share: Math.round((d.visitors / totalDevices) * 100) })),
    browsers,
    countries: countries.map((c) => ({ country: c.country as string, visitors: c.visitors })),
    events,
    eventTotals,
    recent,
    contacts: contacts.total,
    contactRate: rate(contacts.total, now.visits),
    contactRateChange: Math.round((rate(contacts.total, now.visits) - rate(contactsBefore.total, before.visits)) * 10) / 10,
    contactChannels: contacts.channels,
    forms,
    peaks,
  };
}

export type AnalyticsSummary = Awaited<ReturnType<typeof analyticsSummary>>;

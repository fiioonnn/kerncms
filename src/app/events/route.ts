import { NextResponse } from "next/server";
import { UAParser } from "ua-parser-js";
import geoip from "geoip-lite";
import { db } from "@/db";
import { projectAnalytics } from "@/db/schema";
import { eq } from "drizzle-orm";
import { chInsert } from "@/db/clickhouse";
import { getRotatedSalt, computeVisitorHash, computeSessionHash } from "@/lib/analytics-hash";

type EventInput = {
  name: string;
  path?: string;
  referrer?: string;
  screenWidth?: number;
  properties?: Record<string, unknown>;
};

type EventBody = {
  site: string;
  events?: EventInput[];
  name?: string;
  path?: string;
  referrer?: string;
  screenWidth?: number;
  properties?: Record<string, unknown>;
};

const ALLOWED_NAMES = new Set(["pageview", "click", "scroll", "error"]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

type Bucket = { tokens: number; ts: number };
const buckets = new Map<string, Bucket>();
const BUCKET_CAPACITY = 30;
const REFILL_PER_SEC = 5;
const MAX_BUCKETS = 5000;

function takeToken(key: string): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= MAX_BUCKETS) {
      const cutoff = now - 5 * 60 * 1000;
      for (const [k, v] of buckets) if (v.ts < cutoff) buckets.delete(k);
    }
    b = { tokens: BUCKET_CAPACITY - 1, ts: now };
    buckets.set(key, b);
    return true;
  }
  const elapsed = (now - b.ts) / 1000;
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + elapsed * REFILL_PER_SEC);
  b.ts = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function getIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "0.0.0.0";
}

function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "0.0.0.0") return true;
  if (ip === "::1" || ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const m = v4.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function getDomain(referrer: string, fallback: string): string {
  try {
    return new URL(referrer || fallback).host;
  } catch {
    return fallback;
  }
}

function countryFromAcceptLanguage(req: Request): string {
  const al = req.headers.get("accept-language") ?? "";
  const m = al.match(/[a-z]{2,3}-([A-Z]{2})/);
  return m ? m[1] : "";
}

export async function POST(req: Request) {
  let body: EventBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!body.site) {
    return NextResponse.json({ error: "Missing site" }, { status: 400, headers: CORS_HEADERS });
  }

  const events: EventInput[] = Array.isArray(body.events)
    ? body.events
    : body.name
      ? [{
          name: body.name,
          path: body.path,
          referrer: body.referrer,
          screenWidth: body.screenWidth,
          properties: body.properties,
        }]
      : [];

  if (events.length === 0) {
    return NextResponse.json({ error: "No events" }, { status: 400, headers: CORS_HEADERS });
  }

  const settings = db
    .select()
    .from(projectAnalytics)
    .where(eq(projectAnalytics.siteId, body.site))
    .get();
  if (!settings || !settings.enabled) {
    return NextResponse.json({ error: "Unknown or disabled site" }, { status: 404, headers: CORS_HEADERS });
  }

  const ip = getIp(req);
  if (!takeToken(`${settings.projectId}:${ip}`)) {
    return NextResponse.json({ ok: true, dropped: "rate_limited" }, { headers: CORS_HEADERS });
  }

  const customWhitelist = new Set(JSON.parse(settings.customEvents) as string[]);
  const ua = req.headers.get("user-agent") ?? "";
  const parsed = UAParser(ua);
  const geo = !isPrivateIp(ip) ? geoip.lookup(ip) : null;
  const country = geo?.country || countryFromAcceptLanguage(req);
  const salt = await getRotatedSalt(settings.projectId);
  const nowSql = new Date().toISOString().replace("T", " ").slice(0, 19);

  const rows: Record<string, unknown>[] = [];
  for (const ev of events) {
    if (!ev?.name) continue;
    const isCustom = !ALLOWED_NAMES.has(ev.name);
    const allowed =
      (ev.name === "pageview" && settings.trackPageviews) ||
      (ev.name === "click" && settings.trackClicks) ||
      (ev.name === "scroll" && settings.trackScroll) ||
      (ev.name === "error" && settings.trackErrors) ||
      (isCustom && settings.trackEvents);
    if (!allowed) continue;
    if (isCustom && !customWhitelist.has(ev.name)) continue;

    const referrer = ev.referrer ?? "";
    const domain = getDomain(referrer, settings.siteId);
    const path = ev.path ?? "/";

    const visitorHash = settings.trackUnique ? computeVisitorHash(salt, domain, ip, ua) : "";
    const sessionHash = computeSessionHash(salt, domain, ip, ua, path);

    const props = (ev.properties ?? {}) as Record<string, unknown>;
    const clickX =
      ev.name === "click" ? Math.max(0, Math.min(1000, Math.round(Number(props.x ?? 0)))) : 0;
    const clickY =
      ev.name === "click" ? Math.max(0, Math.min(1000, Math.round(Number(props.y ?? 0)))) : 0;

    rows.push({
      timestamp: nowSql,
      project_id: settings.projectId,
      site_id: settings.siteId,
      name: ev.name,
      visitor_hash: visitorHash,
      session_hash: sessionHash,
      path,
      referrer,
      country,
      region: geo?.region ?? "",
      city: geo?.city ?? "",
      lat: geo?.ll?.[0] ?? 0,
      lng: geo?.ll?.[1] ?? 0,
      device: parsed.device?.type ?? "desktop",
      browser: parsed.browser?.name ?? "",
      os: parsed.os?.name ?? "",
      screen_width: ev.screenWidth ?? 0,
      click_x_pct: clickX,
      click_y_pct: clickY,
      properties: ev.properties ? JSON.stringify(ev.properties) : "",
    });
  }

  if (rows.length > 0) {
    await chInsert("events", rows);
  }

  return NextResponse.json({ ok: true, accepted: rows.length }, { headers: CORS_HEADERS });
}

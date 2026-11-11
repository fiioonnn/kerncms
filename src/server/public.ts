import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sites } from "@/db/schema";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

/** Site for a public key from the URL (/api/public/<publicKey>/…). */
export async function siteByPublicKey(publicKey: string) {
  if (!/^pk_[a-z0-9]{8,40}$/.test(publicKey)) return null;
  const [site] = await db.select().from(sites).where(eq(sites.publicKey, publicKey)).limit(1);
  return site ?? null;
}

function originOf(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Browsers always send an Origin header with cross-site POSTs. Only the site's own domains may post,
 * so other websites can't abuse the form endpoint from their visitors' browsers.
 * Requests without Origin (servers, curl) are allowed but rate-limited.
 */
export function originAllowed(request: Request, site: { liveUrl: string | null; allowedOrigins: string[] }) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return true;
  const allowed = new Set<string>();
  const live = site.liveUrl ? originOf(site.liveUrl) : null;
  if (live) {
    allowed.add(live);
    const url = new URL(live);
    // www and non-www both count as the live site.
    url.hostname = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
    allowed.add(url.origin);
  }
  for (const entry of site.allowedOrigins) {
    const o = originOf(entry);
    if (o) allowed.add(o);
  }
  if (allowed.has(origin)) return true;
  // Local development of the site (astro dev, previews).
  if (process.env.NODE_ENV !== "production" || process.env.KERN_ALLOW_LOCAL_ORIGINS === "1") {
    const host = originOf(origin) ? new URL(origin).hostname : "";
    if (host === "localhost" || host === "127.0.0.1" || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host)) return true;
  }
  return false;
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** Very small in-memory rate limit per key (e.g. ip + site). */
const hits = ((globalThis as { __kernRate?: Map<string, number[]> }).__kernRate ??= new Map());
export function rateLimited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t: number) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}

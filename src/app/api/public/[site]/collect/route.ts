import { db } from "@/db";
import { pageViews } from "@/db/schema";
import {
  browserOf,
  campaignOf,
  continueVisit,
  countryOf,
  deviceOf,
  isBot,
  languageOf,
  osOf,
  recordDuration,
  recordEvent,
  referrerHost,
  visitorHash,
} from "@/server/analytics";
import { clientIp, corsHeaders, originAllowed, rateLimited, siteByPublicKey } from "@/server/public";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

const done = () => new Response(null, { status: 202, headers: corsHeaders });

type Body = {
  /** "view" (default), "leave" (visible seconds on the page) or "click" (tel, mailto, download, outbound). */
  type?: string;
  path?: string;
  query?: string;
  referrer?: string;
  width?: number;
  tz?: string;
  time?: number;
  kind?: string;
  target?: string;
};

const KINDS = new Set(["tel", "mailto", "download", "outbound"]);

/**
 * Page views, leave pings and clicks from the website. No cookies: visitors are recognised on the
 * server only (see visitorHash). Old snippets that send just { path, referrer, width } keep working.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/public/[site]/collect">) {
  const { site: key } = await ctx.params;
  const userAgent = request.headers.get("user-agent") ?? "";
  if (isBot(userAgent)) return done();
  const site = await siteByPublicKey(key);
  if (!site || !site.analyticsEnabled || !originAllowed(request, site)) return done();
  // Do Not Track is respected in anonymous mode; with personal statistics the visitors gave written consent.
  if (!site.analyticsPersonal && request.headers.get("dnt") === "1") return done();
  const ip = clientIp(request);
  if (rateLimited(`collect:${site.id}:${ip}`, 240, 60_000)) return done();

  let body: Body = {};
  try {
    // sendBeacon sends text/plain, so parse the text ourselves.
    body = JSON.parse(await request.text());
  } catch {
    return done();
  }
  if (typeof body.path !== "string" || !body.path.startsWith("/")) return done();
  const [rawPath, pathQuery] = body.path.split("?");
  const path = rawPath.slice(0, 300);
  const visitor = await visitorHash(site.id, ip, userAgent, site.analyticsPersonal);

  if (body.type === "leave") {
    if (typeof body.time === "number" && Number.isFinite(body.time)) await recordDuration(site.id, visitor, path, body.time);
    return done();
  }
  if (body.type === "click") {
    if (typeof body.kind === "string" && KINDS.has(body.kind) && typeof body.target === "string" && body.target) {
      await recordEvent(site.id, visitor, body.kind as "tel", body.target, path);
    }
    return done();
  }

  let siteHost: string | null = null;
  try {
    siteHost = site.liveUrl ? new URL(site.liveUrl).hostname : null;
  } catch {
    siteHost = null;
  }
  const session = await continueVisit(site.id, visitor);
  await db.insert(pageViews).values({
    siteId: site.id,
    path,
    referrer: referrerHost(body.referrer, siteHost),
    device: deviceOf(userAgent, typeof body.width === "number" ? body.width : undefined),
    browser: browserOf(userAgent),
    os: osOf(userAgent),
    country: countryOf(request.headers, body.tz),
    language: languageOf(request.headers.get("accept-language")),
    ...campaignOf(typeof body.query === "string" ? body.query : pathQuery),
    visitor,
    session,
    ip: site.analyticsPersonal ? ip : null,
    userAgent: site.analyticsPersonal ? userAgent.slice(0, 500) : null,
  });
  return done();
}

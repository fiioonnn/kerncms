import { db } from "@/db";
import { pageViews } from "@/db/schema";
import { browserOf, deviceOf, isBot, referrerHost, visitorHash } from "@/server/analytics";
import { clientIp, corsHeaders, rateLimited, siteByKey } from "@/server/public";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

const done = () => new Response(null, { status: 202, headers: corsHeaders });

export async function POST(request: Request, ctx: RouteContext<"/api/public/[site]/collect">) {
  const { site: key } = await ctx.params;
  const userAgent = request.headers.get("user-agent") ?? "";
  if (isBot(userAgent) || request.headers.get("dnt") === "1") return done();
  const site = await siteByKey(key);
  if (!site || !site.analyticsEnabled) return done();
  const ip = clientIp(request);
  if (rateLimited(`collect:${site.id}:${ip}`, 120, 60_000)) return done();

  let body: { path?: string; referrer?: string; width?: number } = {};
  try {
    // sendBeacon sends text/plain, so parse the text ourselves.
    body = JSON.parse(await request.text());
  } catch {
    return done();
  }
  const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path.split("?")[0].slice(0, 300) : null;
  if (!path) return done();
  let siteHost: string | null = null;
  try {
    siteHost = site.liveUrl ? new URL(site.liveUrl).hostname : null;
  } catch {
    siteHost = null;
  }
  await db.insert(pageViews).values({
    siteId: site.id,
    path,
    referrer: referrerHost(body.referrer, siteHost),
    device: deviceOf(userAgent, typeof body.width === "number" ? body.width : undefined),
    browser: browserOf(userAgent),
    visitor: visitorHash(site.id, ip, userAgent),
  });
  return done();
}

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import { mimeOf } from "@/server/media";
import { cmsStore } from "@/server/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Public delivery of media kept in kerncms' own storage. Used by the live website. */
export async function GET(request: Request, ctx: RouteContext<"/files/[site]/[name]">) {
  const { site, name: rawName } = await ctx.params;
  const name = decodeURIComponent(rawName);
  if (!UUID.test(site) || !name || name.includes("/") || name.startsWith(".")) return new Response("Nicht gefunden", { status: 404 });
  const [row] = await db
    .select({ location: media.location, updatedAt: media.updatedAt })
    .from(media)
    .where(and(eq(media.siteId, site), eq(media.name, name)));
  // Files removed from the library stay reachable until the cleanup after the next publish.
  try {
    const etag = row ? `"${row.updatedAt.getTime()}"` : undefined;
    if (etag && request.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });
    const body = await cmsStore(site).get(name);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": mimeOf(name),
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
        ...(etag ? { ETag: etag } : {}),
      },
    });
  } catch {
    return new Response("Nicht gefunden", { status: 404 });
  }
}

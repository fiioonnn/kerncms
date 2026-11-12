import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, sites } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { showBlob } from "@/server/git";

/** Favicon candidates in a site's repository, best first. */
const CANDIDATES: [string, string][] = [
  ["public/favicon.svg", "image/svg+xml"],
  ["public/icon.svg", "image/svg+xml"],
  ["public/apple-touch-icon.png", "image/png"],
  ["public/favicon-196x196.png", "image/png"],
  ["public/favicon-96x96.png", "image/png"],
  ["public/favicon.png", "image/png"],
  ["public/favicon-32x32.png", "image/png"],
  ["public/favicon.ico", "image/x-icon"],
];

type Icon = { body: Buffer; type: string } | null;
const cache = ((globalThis as { __kernSiteIcons?: Map<string, { at: number; icon: Icon }> }).__kernSiteIcons ??= new Map());

/** The site's favicon from its live branch, for the site switcher. 404 when it has none. */
export async function GET(_request: Request, ctx: RouteContext<"/api/site-icon/[site]">) {
  const { site: siteId } = await ctx.params;
  const user = await requireUser();
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return new Response(null, { status: 404 });
  if (!user.isAdmin) {
    const [member] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.siteId, site.id), eq(memberships.userId, user.id)))
      .limit(1);
    if (!member) return new Response(null, { status: 404 });
  }

  let hit = cache.get(site.id);
  if (!hit || Date.now() - hit.at > 10 * 60_000) {
    let icon: Icon = null;
    for (const [file, type] of CANDIDATES) {
      const body = await showBlob(site.repoPath, site.branch, file);
      if (body?.length) {
        icon = { body, type };
        break;
      }
    }
    hit = { at: Date.now(), icon };
    cache.set(site.id, hit);
  }
  if (!hit.icon) return new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=600" } });
  return new Response(new Uint8Array(hit.icon.body), {
    headers: {
      "Content-Type": hit.icon.type,
      "Cache-Control": "private, max-age=3600",
      // SVGs from the repository: show them, never run their scripts.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    },
  });
}

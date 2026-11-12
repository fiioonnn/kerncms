import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

const MAX_HTML_BYTES = 5 * 1024 * 1024;

/**
 * Reports link clicks to the CMS instead of navigating. The preview iframe is
 * sandboxed with scripts but without same-origin, so the page runs in an opaque
 * origin and can only talk to the CMS through postMessage.
 */
const LINK_BRIDGE = `<script>document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;e.preventDefault();parent.postMessage({type:"kern-preview-link",href:a.href},"*")},true);document.addEventListener("submit",function(e){e.preventDefault()},true);</script>`;

/**
 * Prepares site HTML for the preview pane: adds a <base> so CSS, images, fonts
 * and scripts still load from the real site, and the link bridge above.
 */
function prepareHtml(html: string, baseHref: string): string {
  let out = html
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "")
    .replace(/<base\b[^>]*>/gi, "");

  const head = `<base href="${baseHref.replace(/"/g, "&quot;")}">${LINK_BRIDGE}`;
  if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}${head}`);
  } else {
    out = `<head>${head}</head>${out}`;
  }
  return out;
}

// GET ?path=/about — fetch a page of the project's deployed site for the preview pane
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin", "editor", "viewer"]);

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project?.url) {
    return NextResponse.json({ error: "No site URL configured for this project." }, { status: 400 });
  }

  let siteOrigin: URL;
  try {
    siteOrigin = new URL(/^https?:\/\//i.test(project.url) ? project.url : `https://${project.url}`);
  } catch {
    return NextResponse.json({ error: `Invalid site URL: ${project.url}` }, { status: 400 });
  }

  const rawPath = new URL(request.url).searchParams.get("path") || "/";
  // Only paths on the configured site — never a full URL or protocol-relative path.
  if (!rawPath.startsWith("/") || rawPath.startsWith("//")) {
    return NextResponse.json({ error: "Path must start with /" }, { status: 400 });
  }
  const target = new URL(rawPath, siteOrigin.origin);

  let res: Response;
  try {
    res = await fetch(target, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; KernCMS-VisualEditor/1.0)",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `Could not reach ${target.href}: ${(e as Error).message}` }, { status: 502 });
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) {
    return NextResponse.json({ error: `${target.href} did not return an HTML page (${res.status}).` }, { status: 502 });
  }

  const html = await res.text();
  if (html.length > MAX_HTML_BYTES) {
    return NextResponse.json({ error: "Page is too large to preview." }, { status: 502 });
  }

  return NextResponse.json({
    html: prepareHtml(html, res.url || target.href),
    url: res.url || target.href,
    status: res.status,
    siteOrigin: siteOrigin.origin,
  });
}

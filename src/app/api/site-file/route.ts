import { readFile } from "node:fs/promises";
import path from "node:path";
import { getWorkspace } from "@/server/sites";
import { safeJoin } from "@/server/content";
import { IMAGE_TYPES, mimeOf } from "@/server/media";

/**
 * Serves a file from the site's public folder in the draft checkout, e.g. ?path=/logo.svg.
 * For values outside the media folder that the site itself serves (logos, icons).
 */
export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("path") ?? "";
  const ext = value.slice(value.lastIndexOf(".")).toLowerCase();
  if (!value.startsWith("/") || !(ext in IMAGE_TYPES || ext === ".pdf" || ext === ".mp4")) return new Response("Nicht gefunden", { status: 404 });
  const ws = await getWorkspace();
  try {
    // Only inside public/: safeJoin rejects paths that climb out of it.
    const file = await readFile(safeJoin(path.join(ws.dir, "public"), `.${decodeURIComponent(value.split(/[?#]/)[0])}`));
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": mimeOf(value),
        "Cache-Control": "private, no-cache",
        // SVGs from the repository: show them, never run their scripts.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      },
    });
  } catch {
    return new Response("Nicht gefunden", { status: 404 });
  }
}

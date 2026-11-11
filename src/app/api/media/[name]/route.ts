import { readFile } from "node:fs/promises";
import { getWorkspace } from "@/server/sites";
import { mediaPath, mimeOf } from "@/server/media";

/** Serves a file from the draft checkout's media folder to signed-in users. */
export async function GET(_request: Request, ctx: RouteContext<"/api/media/[name]">) {
  const { name } = await ctx.params;
  const ws = await getWorkspace();
  try {
    const file = await readFile(mediaPath(ws.dir, ws.config, decodeURIComponent(name)));
    return new Response(new Uint8Array(file), {
      headers: { "Content-Type": mimeOf(name), "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Nicht gefunden", { status: 404 });
  }
}

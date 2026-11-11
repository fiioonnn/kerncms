import { getChangeSet } from "@/server/content";
import { listMedia } from "@/server/media";
import { getWorkspace } from "@/server/sites";

export async function GET() {
  const ws = await getWorkspace();
  const changes = await getChangeSet(ws.dir, ws.site.branch);
  const items = await listMedia(ws.site.id, ws.dir, ws.config, changes);
  return Response.json(items, { headers: { "Cache-Control": "no-store" } });
}

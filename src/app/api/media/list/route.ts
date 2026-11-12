import { getChangeSet } from "@/server/content";
import { listFolders, listMedia } from "@/server/media";
import { getWorkspace } from "@/server/sites";

export async function GET(request: Request) {
  const ws = await getWorkspace();
  // ?folders=1: only the folder list (the media library asks for it next to the files).
  if (new URL(request.url).searchParams.has("folders")) {
    return Response.json(await listFolders(ws.site.id), { headers: { "Cache-Control": "no-store" } });
  }
  const changes = await getChangeSet(ws.dir, ws.site.branch);
  const items = await listMedia(ws.site.id, ws.dir, ws.config, changes);
  return Response.json(items, { headers: { "Cache-Control": "no-store" } });
}

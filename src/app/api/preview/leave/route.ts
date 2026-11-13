import { previewLeft } from "@/server/preview";
import { getWorkspace } from "@/server/sites";

/** Beacon from an editor tab that closes or navigates away (body: its client id). */
export async function POST(request: Request) {
  const ws = await getWorkspace();
  const client = (await request.text()).trim();
  if (/^[\w-]{8,64}$/.test(client)) previewLeft(ws.site.id, client);
  return new Response(null, { status: 204 });
}

import { getNotifications } from "@/server/queries";

/** Latest notifications for the bell in the topbar. */
export async function GET() {
  const items = await getNotifications();
  return Response.json(items, { headers: { "Cache-Control": "no-store" } });
}

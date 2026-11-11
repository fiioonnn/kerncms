import type { NextRequest } from "next/server";
import { getHistory } from "@/server/queries";

/** Commits of the draft branch, optionally for one file. Used by the version history dialog. */
export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get("file") ?? undefined;
  const { history } = await getHistory({ file, limit: 50 });
  return Response.json(history, { headers: { "Cache-Control": "no-store" } });
}

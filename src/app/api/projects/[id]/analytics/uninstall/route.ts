import { NextResponse } from "next/server";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { removeTrackerScript } from "@/lib/analytics-tracker";
import { clearDetectCache } from "../detect/route";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const result = await removeTrackerScript(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  clearDetectCache(id);
  return NextResponse.json({ ok: true, removed: result.removed });
}

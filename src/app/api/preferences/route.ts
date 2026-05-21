import { NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";

export async function GET() {
  const session = await requireSession();
  const row = db
    .select({ advancedView: user.advancedView })
    .from(user)
    .where(eq(user.id, session.user.id))
    .get();

  return NextResponse.json({ advancedView: row?.advancedView ?? false });
}

export async function PATCH(request: Request) {
  const session = await requireSession();
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (typeof body.advancedView === "boolean") updates.advancedView = body.advancedView;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  db.update(user).set(updates).where(eq(user.id, session.user.id)).run();
  return NextResponse.json({ success: true });
}

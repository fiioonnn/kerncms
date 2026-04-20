import { NextResponse } from "next/server";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const invite = db.select().from(invitations).where(eq(invitations.id, id)).get();
  if (!invite) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await requireRole(invite.projectId, session.user.id, ["admin"]);

  db.delete(invitations).where(eq(invitations.id, id)).run();

  return NextResponse.json({ success: true });
}

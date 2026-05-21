import { NextResponse } from "next/server";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const invite = db.select().from(invitations).where(eq(invitations.id, id)).get();
  if (!invite) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await requireRole(invite.projectId, session.user.id, ["admin"]);

  const body = await request.json();

  const updates: Record<string, string> = {};
  if (body.role && ["admin", "editor", "viewer"].includes(body.role)) {
    updates.role = body.role;
  }
  if (body.systemRole && ["admin", "member"].includes(body.systemRole)) {
    updates.systemRole = body.systemRole;
  }

  if (Object.keys(updates).length > 0) {
    db.update(invitations).set(updates).where(eq(invitations.id, id)).run();
  }

  return NextResponse.json({ success: true });
}

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

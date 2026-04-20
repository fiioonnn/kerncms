import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const { role } = await request.json();

  const member = db.select().from(projectMembers).where(eq(projectMembers.id, id)).get();
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await requireRole(member.projectId, session.user.id, ["admin"]);

  db.update(projectMembers).set({ role }).where(eq(projectMembers.id, id)).run();

  return NextResponse.json({ success: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const member = db.select().from(projectMembers).where(eq(projectMembers.id, id)).get();
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isSelf = member.userId === session.user.id;
  if (!isSelf) {
    await requireRole(member.projectId, session.user.id, ["admin"]);
  }

  db.delete(projectMembers).where(eq(projectMembers.id, id)).run();

  return NextResponse.json({ success: true });
}

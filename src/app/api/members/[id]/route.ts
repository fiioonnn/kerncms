import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectMembers, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole, isAdminRole, getSession } from "@/lib/auth-helpers";

function isAppLevelAdmin(role: string | null | undefined): boolean {
  return role === "admin" || role === "superadmin";
}

async function guardAgainstAppAdmin(targetUserId: string, sessionUserRole: string | undefined) {
  if (isAppLevelAdmin(sessionUserRole)) return;
  const target = db.select({ role: user.role }).from(user).where(eq(user.id, targetUserId)).get();
  if (target && isAppLevelAdmin(target.role)) {
    throw new Response(JSON.stringify({ error: "Cannot modify an app admin" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const { role } = await request.json();

  const member = db.select().from(projectMembers).where(eq(projectMembers.id, id)).get();
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await requireRole(member.projectId, session.user.id, ["admin"]);
  await guardAgainstAppAdmin(member.userId, session.user.role);

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
    await guardAgainstAppAdmin(member.userId, session.user.role);
  }

  db.delete(projectMembers).where(eq(projectMembers.id, id)).run();

  return NextResponse.json({ success: true });
}

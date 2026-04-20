import { NextResponse } from "next/server";
import { db } from "@/db";
import { user, projectMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";

export async function DELETE() {
  const session = await requireSession();
  const userId = session.user.id;

  const memberships = db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.role, "admin")))
    .all();

  for (const membership of memberships) {
    const otherAdmins = db
      .select()
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, membership.projectId),
        eq(projectMembers.role, "admin"),
      ))
      .all()
      .filter((m) => m.userId !== userId);

    if (otherAdmins.length === 0) {
      return NextResponse.json(
        { error: "You are the only admin of a project. Transfer admin role before deleting your account." },
        { status: 400 },
      );
    }
  }

  db.delete(projectMembers).where(eq(projectMembers.userId, userId)).run();
  db.delete(user).where(eq(user.id, userId)).run();

  return NextResponse.json({ success: true });
}

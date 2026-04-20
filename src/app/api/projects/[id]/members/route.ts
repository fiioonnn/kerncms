import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectMembers, user, invitations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession, getMemberRole, requireRole } from "@/lib/auth-helpers";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const role = await getMemberRole(id, session.user.id);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = db
    .select({
      id: projectMembers.id,
      userId: projectMembers.userId,
      role: projectMembers.role,
      joinedAt: projectMembers.joinedAt,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(projectMembers)
    .innerJoin(user, eq(projectMembers.userId, user.id))
    .where(eq(projectMembers.projectId, id))
    .all();

  const pending = db
    .select()
    .from(invitations)
    .where(eq(invitations.projectId, id))
    .all();

  return NextResponse.json({ members, invitations: pending });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const { userId, role } = await request.json();

  const target = db.select({ id: user.id }).from(user).where(eq(user.id, userId)).get();
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, id), eq(projectMembers.userId, userId)))
    .get();

  if (existing) {
    return NextResponse.json({ error: "User is already a member" }, { status: 409 });
  }

  db.insert(projectMembers).values({ projectId: id, userId, role: role ?? "editor" }).run();
  return NextResponse.json({ success: true });
}

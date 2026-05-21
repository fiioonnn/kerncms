import { NextResponse } from "next/server";
import { db } from "@/db";
import { user, projectMembers, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, isAdminRole, isSuperAdminRole } from "@/lib/auth-helpers";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const u = db.select({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    createdAt: user.createdAt,
  }).from(user).where(eq(user.id, id)).get();

  if (!u) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const memberships = db.select({
    projectId: projectMembers.projectId,
    projectName: projects.name,
    projectColor: projects.color,
    role: projectMembers.role,
    joinedAt: projectMembers.joinedAt,
  }).from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, id))
    .all();

  return NextResponse.json({ ...u, projects: memberships });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const currentUser = db.select({ role: user.role }).from(user).where(eq(user.id, session.user.id)).get();
  if (!isAdminRole(currentUser?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { role } = await request.json();

  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot change your own system role" }, { status: 400 });
  }

  const target = db.select({ role: user.role }).from(user).where(eq(user.id, id)).get();

  if (target?.role === "superadmin") {
    return NextResponse.json({ error: "Cannot change a superadmin's role" }, { status: 403 });
  }

  if (isAdminRole(target?.role) && !isSuperAdminRole(currentUser?.role)) {
    return NextResponse.json({ error: "Only superadmins can change an admin's role" }, { status: 403 });
  }

  if (role === "superadmin") {
    return NextResponse.json({ error: "Cannot assign superadmin role" }, { status: 403 });
  }

  db.update(user).set({ role }).where(eq(user.id, id)).run();
  return NextResponse.json({ success: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const currentUser = db.select({ role: user.role }).from(user).where(eq(user.id, session.user.id)).get();
  if (!isAdminRole(currentUser?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  const target = db.select({ role: user.role }).from(user).where(eq(user.id, id)).get();
  if (target?.role === "superadmin") {
    return NextResponse.json({ error: "Cannot delete a superadmin" }, { status: 403 });
  }

  if (isAdminRole(target?.role) && !isSuperAdminRole(currentUser?.role)) {
    return NextResponse.json({ error: "Only superadmins can remove admins" }, { status: 403 });
  }

  db.delete(projectMembers).where(eq(projectMembers.userId, id)).run();
  db.delete(user).where(eq(user.id, id)).run();
  return NextResponse.json({ success: true });
}

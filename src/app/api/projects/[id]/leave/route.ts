import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const admins = db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, id), eq(projectMembers.role, "admin")))
    .all();

  const isSelfAdmin = admins.some((a) => a.userId === session.user.id);
  if (isSelfAdmin && admins.length === 1) {
    return NextResponse.json(
      { error: "Cannot leave: you are the only admin. Transfer admin role first." },
      { status: 400 },
    );
  }

  db.delete(projectMembers)
    .where(and(eq(projectMembers.projectId, id), eq(projectMembers.userId, session.user.id)))
    .run();

  return NextResponse.json({ success: true });
}

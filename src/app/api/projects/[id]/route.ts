import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole, withApi } from "@/lib/auth-helpers";

export const PATCH = withApi(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const body = await request.json();
  db.update(projects).set(body).where(eq(projects.id, id)).run();

  return NextResponse.json({ success: true });
})

export const DELETE = withApi(async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  db.delete(projects).where(eq(projects.id, id)).run();

  return NextResponse.json({ success: true });
})

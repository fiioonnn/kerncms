import { NextResponse } from "next/server";
import { db } from "@/db";
import { customDomains, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, isSuperAdminRole } from "@/lib/auth-helpers";

async function requireSuperAdmin() {
  const session = await requireSession();
  const u = db.select({ role: user.role }).from(user).where(eq(user.id, session.user.id)).get();
  if (!isSuperAdminRole(u?.role)) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  db.update(customDomains).set(updates).where(eq(customDomains.id, id)).run();

  const updated = db.select().from(customDomains).where(eq(customDomains.id, id)).get();
  if (!updated) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;

  const existing = db.select({ id: customDomains.id }).from(customDomains).where(eq(customDomains.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  db.delete(customDomains).where(eq(customDomains.id, id)).run();
  return NextResponse.json({ success: true });
}

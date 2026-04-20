import { NextResponse } from "next/server";
import { db } from "@/db";
import { mediaBuckets } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; bucketId: string }> },
) {
  const session = await requireSession();
  const { id, bucketId } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const body = await request.json();
  const { name, config, isDefault } = body;

  const bucket = db
    .select()
    .from(mediaBuckets)
    .where(and(eq(mediaBuckets.id, bucketId), eq(mediaBuckets.projectId, id)))
    .get();

  if (!bucket) {
    return NextResponse.json({ error: "Bucket not found" }, { status: 404 });
  }

  if (isDefault === true) {
    db.update(mediaBuckets)
      .set({ isDefault: false })
      .where(eq(mediaBuckets.projectId, id))
      .run();
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (config !== undefined) {
    updates.config = typeof config === "string" ? config : JSON.stringify(config);
  }
  if (isDefault !== undefined) updates.isDefault = isDefault;

  db.update(mediaBuckets)
    .set(updates)
    .where(and(eq(mediaBuckets.id, bucketId), eq(mediaBuckets.projectId, id)))
    .run();

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; bucketId: string }> },
) {
  const session = await requireSession();
  const { id, bucketId } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const bucket = db
    .select()
    .from(mediaBuckets)
    .where(and(eq(mediaBuckets.id, bucketId), eq(mediaBuckets.projectId, id)))
    .get();

  if (!bucket) {
    return NextResponse.json({ error: "Bucket not found" }, { status: 404 });
  }

  if (bucket.provider === "github" && bucket.isDefault) {
    return NextResponse.json(
      { error: "Cannot delete the default GitHub bucket" },
      { status: 400 },
    );
  }

  db.delete(mediaBuckets)
    .where(and(eq(mediaBuckets.id, bucketId), eq(mediaBuckets.projectId, id)))
    .run();

  return NextResponse.json({ success: true });
}

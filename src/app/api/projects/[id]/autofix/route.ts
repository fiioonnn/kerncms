import { NextResponse } from "next/server";
import { db } from "@/db";
import { autofixSettings, webhookLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const settings = db
    .select()
    .from(autofixSettings)
    .where(eq(autofixSettings.projectId, id))
    .get();

  const logs = db
    .select()
    .from(webhookLogs)
    .where(eq(webhookLogs.projectId, id))
    .orderBy(desc(webhookLogs.createdAt))
    .limit(10)
    .all();

  return NextResponse.json({
    settings: settings ?? {
      fixSyntax: true,
      fixMissingFields: true,
      fixTypeMismatches: true,
      removeUnknownFields: false,
    },
    logs: logs.map((l) => ({
      ...l,
      errorsFound: JSON.parse(l.errorsFound),
      errorsFixed: JSON.parse(l.errorsFixed),
    })),
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const body = await request.json();

  const existing = db
    .select()
    .from(autofixSettings)
    .where(eq(autofixSettings.projectId, id))
    .get();

  if (existing) {
    db.update(autofixSettings)
      .set({
        fixSyntax: body.fixSyntax ?? true,
        fixMissingFields: body.fixMissingFields ?? true,
        fixTypeMismatches: body.fixTypeMismatches ?? true,
        removeUnknownFields: body.removeUnknownFields ?? false,
      })
      .where(eq(autofixSettings.projectId, id))
      .run();
  } else {
    db.insert(autofixSettings)
      .values({
        projectId: id,
        fixSyntax: body.fixSyntax ?? true,
        fixMissingFields: body.fixMissingFields ?? true,
        fixTypeMismatches: body.fixTypeMismatches ?? true,
        removeUnknownFields: body.removeUnknownFields ?? false,
      })
      .run();
  }

  return NextResponse.json({ success: true });
}

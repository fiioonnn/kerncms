import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectAnalytics } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

type SettingsResponse = {
  enabled: boolean;
  wasConfigured: boolean;
  verified: boolean;
  siteId: string;
  appUrl: string | null;
  eventsUrl: string | null;
  layoutFile: string | null;
  trackPageviews: boolean;
  trackUnique: boolean;
  trackClicks: boolean;
  trackScroll: boolean;
  trackEvents: boolean;
  trackErrors: boolean;
  customEvents: string[];
};

function rowToResponse(row: typeof projectAnalytics.$inferSelect): SettingsResponse {
  return {
    enabled: row.enabled,
    wasConfigured: row.updatedAt.getTime() - row.createdAt.getTime() > 5000,
    verified: !!row.verifiedAt,
    siteId: row.siteId,
    appUrl: row.appUrl,
    eventsUrl: row.eventsUrl,
    layoutFile: row.layoutFile,
    trackPageviews: row.trackPageviews,
    trackUnique: row.trackUnique,
    trackClicks: row.trackClicks,
    trackScroll: row.trackScroll,
    trackEvents: row.trackEvents,
    trackErrors: row.trackErrors,
    customEvents: JSON.parse(row.customEvents) as string[],
  };
}

function ensureRow(projectId: string) {
  let row = db.select().from(projectAnalytics).where(eq(projectAnalytics.projectId, projectId)).get();
  if (!row) {
    db.insert(projectAnalytics).values({ projectId }).run();
    row = db.select().from(projectAnalytics).where(eq(projectAnalytics.projectId, projectId)).get();
  }
  return row!;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin", "editor", "viewer"]);

  const row = ensureRow(id);
  return NextResponse.json(rowToResponse(row));
}

type UpdateBody = Partial<{
  enabled: boolean;
  appUrl: string | null;
  eventsUrl: string | null;
  layoutFile: string | null;
  trackClicks: boolean;
  trackScroll: boolean;
  trackEvents: boolean;
  trackErrors: boolean;
  customEvents: string[];
}>;

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const body = (await req.json()) as UpdateBody;
  ensureRow(id);

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;
  if ("appUrl" in body) {
    const val = body.appUrl?.trim() || null;
    if (val) {
      try { new URL(val); } catch {
        return NextResponse.json({ error: "Invalid App URL" }, { status: 400 });
      }
    }
    update.appUrl = val;
  }
  if ("eventsUrl" in body) {
    const val = body.eventsUrl?.trim() || null;
    if (val) {
      try { new URL(val); } catch {
        return NextResponse.json({ error: "Invalid Events URL" }, { status: 400 });
      }
    }
    update.eventsUrl = val;
  }
  if ("layoutFile" in body) update.layoutFile = body.layoutFile ?? null;
  if (typeof body.trackClicks === "boolean") update.trackClicks = body.trackClicks;
  if (typeof body.trackScroll === "boolean") update.trackScroll = body.trackScroll;
  if (typeof body.trackEvents === "boolean") update.trackEvents = body.trackEvents;
  if (typeof body.trackErrors === "boolean") update.trackErrors = body.trackErrors;
  if (Array.isArray(body.customEvents)) {
    const cleaned = Array.from(new Set(body.customEvents.map((s) => s.trim()).filter(Boolean))).slice(0, 100);
    update.customEvents = JSON.stringify(cleaned);
  }

  db.update(projectAnalytics).set(update).where(eq(projectAnalytics.projectId, id)).run();

  const row = db.select().from(projectAnalytics).where(eq(projectAnalytics.projectId, id)).get()!;
  return NextResponse.json(rowToResponse(row));
}

import { NextResponse } from "next/server";
import { db } from "@/db";
import { githubAppConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, isAdminRole } from "@/lib/auth-helpers";

export async function GET() {
  const session = await requireSession();
  if (!isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = db.select({ appSlug: githubAppConfig.appSlug }).from(githubAppConfig)
    .where(eq(githubAppConfig.id, "default")).get();

  if (!row) {
    return NextResponse.json({ error: "No GitHub App configured" }, { status: 404 });
  }

  return NextResponse.json({
    url: `https://github.com/apps/${row.appSlug}/installations/new`,
  });
}

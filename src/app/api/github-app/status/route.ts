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

  const row = db.select().from(githubAppConfig).where(eq(githubAppConfig.id, "default")).get();

  if (!row) {
    const hasEnv = !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
    if (hasEnv) {
      return NextResponse.json({
        configured: true,
        source: "env",
        app_id: process.env.GITHUB_APP_ID,
      });
    }
    return NextResponse.json({ configured: false });
  }

  return NextResponse.json({
    configured: true,
    source: "db",
    app_id: row.appId,
    app_name: row.appName,
    app_slug: row.appSlug,
    installed_on: row.installedOn,
    installation_id: row.installationId,
  });
}

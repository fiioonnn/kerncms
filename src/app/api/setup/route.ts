import { NextResponse } from "next/server";
import { db } from "@/db";
import { systemConfig, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";

export async function GET() {
  const row = db.select().from(systemConfig).where(eq(systemConfig.key, "setup_complete")).get();
  return NextResponse.json({ complete: row?.value === "true" });
}

export async function POST(request: Request) {
  const row = db.select().from(systemConfig).where(eq(systemConfig.key, "setup_complete")).get();
  if (row?.value === "true") {
    return NextResponse.json({ error: "Setup already complete" }, { status: 400 });
  }

  const session = await requireSession();

  const { pin } = await request.json();
  const setupPin = process.env.SETUP_PIN;

  if (!setupPin) {
    return NextResponse.json({ error: "SETUP_PIN not configured" }, { status: 500 });
  }

  if (pin !== setupPin) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  db.update(user)
    .set({ role: "superadmin" })
    .where(eq(user.id, session.user.id))
    .run();

  db.insert(systemConfig)
    .values({ key: "setup_complete", value: "true" })
    .onConflictDoUpdate({ target: systemConfig.key, set: { value: "true" } })
    .run();

  const response = NextResponse.json({ success: true });
  response.cookies.set("better-auth.session_data", "", { maxAge: 0, path: "/" });
  return response;
}

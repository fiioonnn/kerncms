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

export async function GET() {
  await requireSuperAdmin();
  const domains = db.select().from(customDomains).all();
  return NextResponse.json({ domains });
}

export async function POST(request: Request) {
  await requireSuperAdmin();
  const { domain } = await request.json();

  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "Domain is required" }, { status: 400 });
  }

  const cleaned = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(cleaned)) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  const existing = db.select({ id: customDomains.id })
    .from(customDomains)
    .where(eq(customDomains.domain, cleaned))
    .get();

  if (existing) {
    return NextResponse.json({ error: "Domain already exists" }, { status: 409 });
  }

  const row = db.insert(customDomains)
    .values({ domain: cleaned })
    .returning()
    .get();

  return NextResponse.json(row, { status: 201 });
}

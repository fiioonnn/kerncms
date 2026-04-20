import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireSession, isAdminRole } from "@/lib/auth-helpers";
import { getResendClient } from "@/lib/resend";

export async function POST(request: Request) {
  const session = await requireSession();
  if (!isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { api_key } = await request.json();

  const client = api_key ? new Resend(api_key) : getResendClient();
  if (!client) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 });
  }

  try {
    const { data, error } = await client.domains.list();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const domains = (data?.data ?? [])
      .filter((d) => d.status === "verified")
      .map((d) => d.name);
    return NextResponse.json({ success: true, domains });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid API key";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

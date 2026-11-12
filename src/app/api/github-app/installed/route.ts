import { NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-url";
import { requireAdmin } from "@/server/auth";

/** GitHub sends the browser here after the app was installed on an account. */
export async function GET(request: Request) {
  await requireAdmin();
  return NextResponse.redirect(publicUrl("/admin/github?installed=1", request));
}

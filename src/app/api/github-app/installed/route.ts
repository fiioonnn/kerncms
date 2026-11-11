import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";

/** GitHub sends the browser here after the app was installed on an account. */
export async function GET(request: Request) {
  await requireAdmin();
  return NextResponse.redirect(new URL("/admin/github?installed=1", request.url));
}

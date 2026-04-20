import { NextResponse, type NextRequest } from "next/server";
import { redeemTransferToken } from "@/lib/domains";

const SESSION_COOKIE = process.env.BETTER_AUTH_URL?.startsWith("https")
  ? "__Secure-better-auth.session_token"
  : "better-auth.session_token";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const host = request.headers.get("host") ?? "";

  if (!token) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  const sessionToken = redeemTransferToken(token, host);
  if (!sessionToken) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}

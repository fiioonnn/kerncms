import { NextResponse, type NextRequest } from "next/server";
import { isDomainRegistered } from "@/lib/domains";

const publicPaths = ["/auth", "/api/auth", "/api/setup"];

function isPublic(pathname: string) {
  return publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isMainDomain(host: string): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return true;
  try {
    return new URL(appUrl).host === host;
  } catch {
    return true;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  if (!isMainDomain(host) && !isDomainRegistered(host)) {
    return new NextResponse("Domain not configured", { status: 421 });
  }

  if (isPublic(pathname)) {
    const response = NextResponse.next();
    response.headers.set("x-forwarded-host", host);
    return response;
  }

  const cookieHeader = request.headers.get("cookie") || "";
  const hasSession = cookieHeader.includes("better-auth.session_token=");

  if (!hasSession) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const redirectUrl = appUrl ? new URL("/auth", appUrl) : new URL("/auth", request.url);
    if (!isMainDomain(host)) {
      redirectUrl.searchParams.set("returnDomain", host);
    }
    return NextResponse.redirect(redirectUrl);
  }

  const response = NextResponse.next();
  response.headers.set("x-forwarded-host", host);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

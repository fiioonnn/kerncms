import { NextResponse, type NextRequest } from "next/server";

/** Optimistic check: no session cookie → login. The real check happens on the server for every request. */
export function proxy(request: NextRequest) {
  if (request.cookies.has("kern_session")) return NextResponse.next();
  const url = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except auth pages, public API, static files and the overlay script.
  matcher: ["/((?!login|invite|files/|api/public|api/webhook|_next|favicon.ico|kern-overlay.js|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};

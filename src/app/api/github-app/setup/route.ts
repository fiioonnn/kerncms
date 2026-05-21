import { NextResponse } from "next/server";
import { requireSession, isAdminRole } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  const session = await requireSession();
  if (!isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name") || "kerncms";
  const target = searchParams.get("target") || "user";
  const org = searchParams.get("org") || "";

  const state = crypto.randomUUID();

  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseUrl);

  const manifest: Record<string, unknown> = {
    name,
    url: baseUrl,
    redirect_url: `${baseUrl}/api/github-app/callback`,
    setup_url: `${baseUrl}/api/github-app/installation/callback`,
    setup_on_update: true,
    public: false,
    default_permissions: {
      contents: "write",
      metadata: "read",
      pull_requests: "write",
    },
    default_events: isLocalhost ? [] : ["push"],
  };

  if (!isLocalhost) {
    manifest.hook_attributes = {
      url: `${baseUrl}/api/webhook/github`,
      active: true,
    };
  }

  const githubUrl = target === "org" && org
    ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new`
    : "https://github.com/settings/apps/new";

  const html = `<!DOCTYPE html>
<html><body>
<p>Redirecting to GitHub...</p>
<form id="f" method="post" action="${githubUrl}?state=${state}">
  <input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, "&#39;")}'>
</form>
<script>document.getElementById('f').submit();</script>
</body></html>`;

  const response = new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });

  response.cookies.set("github_app_state", state, {
    httpOnly: true,
    secure: baseUrl.startsWith("https"),
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}

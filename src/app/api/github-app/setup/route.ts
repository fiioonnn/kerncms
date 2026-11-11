import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";

function baseUrl(request: Request) {
  return (process.env.KERN_PUBLIC_URL ?? new URL(request.url).origin).replace(/\/$/, "");
}

/** Starts GitHub's manifest flow: GitHub creates the app with these settings and sends the credentials back. */
export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "kerncms").slice(0, 34);
  const org = url.searchParams.get("org")?.trim() || "";
  const base = baseUrl(request);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(base);
  const state = randomUUID();

  const manifest: Record<string, unknown> = {
    name,
    url: base,
    redirect_url: `${base}/api/github-app/callback`,
    setup_url: `${base}/api/github-app/installed`,
    setup_on_update: true,
    public: false,
    default_permissions: { contents: "write", metadata: "read" },
    default_events: local ? [] : ["push"],
  };
  // GitHub can't reach localhost; webhooks only make sense on a public URL.
  if (!local) manifest.hook_attributes = { url: `${base}/api/webhook/github`, active: true };

  const target = org
    ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new`
    : "https://github.com/settings/apps/new";
  const escaped = JSON.stringify(manifest).replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
  const html = `<!doctype html><html lang="de"><meta charset="utf-8"><title>Weiter zu GitHub</title>
<body style="font-family:system-ui;padding:40px;color:#18181b">Weiter zu GitHub …
<form id="f" method="post" action="${target}?state=${state}"><input type="hidden" name="manifest" value='${escaped}'></form>
<script>document.getElementById("f").submit()</script></body></html>`;
  const response = new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  response.cookies.set("kern_github_state", state, { httpOnly: true, sameSite: "lax", maxAge: 900, path: "/", secure: base.startsWith("https") });
  return response;
}

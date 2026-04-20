import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { githubAppConfig } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { clearOctokitCache } from "@/lib/github";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("github_app_state")?.value;

  if (!code || !state || state !== savedState) {
    return renderPage("Setup Failed", "Invalid or expired request. Please start the setup again.", "error");
  }

  cookieStore.delete("github_app_state");

  let app: {
    id: number;
    name: string;
    slug: string;
    pem: string;
    client_id: string;
    client_secret: string;
    webhook_secret: string;
    owner: { login: string };
  };

  try {
    const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
      method: "POST",
      headers: { Accept: "application/vnd.github.v3+json" },
    });

    if (!res.ok) {
      const body = await res.text();
      if (body.includes("already_exists")) {
        return renderPage("Name Already Taken", "That app name is already in use on GitHub. Please choose a different name.", "error");
      }
      return renderPage("Setup Failed", `GitHub returned an error: ${res.status}. Please try again.`, "error");
    }

    app = await res.json();
  } catch {
    return renderPage("Connection Failed", "Could not connect to GitHub. Please check your connection and try again.", "error");
  }

  const encryptedPem = encrypt(app.pem);
  const encryptedSecret = encrypt(app.client_secret);
  const encryptedWebhook = app.webhook_secret ? encrypt(app.webhook_secret) : "";

  db.insert(githubAppConfig)
    .values({
      id: "default",
      appId: String(app.id),
      appName: app.name,
      appSlug: app.slug,
      privateKey: encryptedPem,
      clientId: app.client_id,
      clientSecret: encryptedSecret,
      webhookSecret: encryptedWebhook,
      installedOn: `@${app.owner.login}`,
    })
    .onConflictDoUpdate({
      target: githubAppConfig.id,
      set: {
        appId: String(app.id),
        appName: app.name,
        appSlug: app.slug,
        privateKey: encryptedPem,
        clientId: app.client_id,
        clientSecret: encryptedSecret,
        webhookSecret: encryptedWebhook,
        installedOn: `@${app.owner.login}`,
        updatedAt: new Date(),
      },
    })
    .run();

  clearOctokitCache();

  return renderPage(
    "App Created!",
    "GitHub App created successfully. You can close this tab and return to Kern.",
    "created",
  );
}

function renderPage(title: string, message: string, step: "created" | "error") {
  const html = `<!DOCTYPE html>
<html>
<head><title>${title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa; }
  .card { text-align: center; max-width: 400px; padding: 2rem; }
  h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
  p { color: #a1a1aa; font-size: 0.875rem; line-height: 1.5; }
</style>
</head>
<body>
<div class="card">
  <h1>${title}</h1>
  <p>${message}</p>
</div>
<script>
  localStorage.setItem('kern-github-setup-step', '${step}');
  try { window.close(); } catch {}
</script>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

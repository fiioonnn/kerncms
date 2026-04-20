import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { db } from "@/db";
import { githubAppConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { clearOctokitCache } from "@/lib/github";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const installationId = searchParams.get("installation_id");

  if (!installationId) {
    return renderPage("Installation Failed", "No installation ID received. Please try again.", "error");
  }

  const row = db.select().from(githubAppConfig).where(eq(githubAppConfig.id, "default")).get();
  if (!row) {
    return renderPage("Installation Failed", "No GitHub App configured. Please start setup from the beginning.", "error");
  }

  let installedOn = row.installedOn;
  try {
    const appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: row.appId, privateKey: decrypt(row.privateKey) },
    });
    const { data } = await appOctokit.rest.apps.getInstallation({ installation_id: Number(installationId) });
    const account = data.account as { login?: string; name?: string } | null;
    installedOn = `@${account?.login ?? account?.name ?? "unknown"}`;
  } catch { /* keep existing installedOn */ }

  db.update(githubAppConfig)
    .set({ installationId, installedOn, updatedAt: new Date() })
    .where(eq(githubAppConfig.id, "default"))
    .run();

  clearOctokitCache();

  return renderPage(
    "Installation Complete!",
    "GitHub App installed successfully. You can close this tab and return to Kern.",
    "done",
  );
}

function renderPage(title: string, message: string, step: "done" | "error") {
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

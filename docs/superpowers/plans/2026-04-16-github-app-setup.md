# GitHub App Setup Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins create and install a GitHub App from the Kern UI, storing credentials in the DB instead of env vars.

**Architecture:** New `github_app_config` DB table holds encrypted credentials. `getGitHubAppConfig()` resolves config from DB first, env vars as fallback. Five API routes handle the GitHub manifest flow (setup → callback → install → installation callback → status). The profile dialog's IntegrationsSection shows a status card with a 3-step setup modal.

**Tech Stack:** Next.js App Router, Drizzle ORM (SQLite), existing `crypto.ts` (AES-256-GCM), Octokit, GitHub App Manifest flow.

**Spec:** `docs/superpowers/specs/2026-04-16-github-app-setup-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/github-app-config.ts` | Config resolution: DB → env fallback. Single export `getGitHubAppConfig()`. |
| `src/app/api/github-app/status/route.ts` | GET — return configured/not + app info |
| `src/app/api/github-app/setup/route.ts` | GET — build manifest, render auto-submit form |
| `src/app/api/github-app/callback/route.ts` | GET — exchange code, encrypt & save credentials |
| `src/app/api/github-app/install-url/route.ts` | GET — return installation URL |
| `src/app/api/github-app/installation/callback/route.ts` | GET — save installation_id, render close page |
| `src/components/github-app-setup-modal.tsx` | 3-step setup modal component (extracted from profile-dialog for size) |

### Modified Files
| File | Change |
|------|--------|
| `src/db/schema.ts` | Add `githubAppConfig` table |
| `src/lib/github.ts` | `getOctokit()` calls `getGitHubAppConfig()` instead of `process.env` |
| `src/components/profile-dialog.tsx` | Replace `IntegrationsSection` stub with real status card + modal trigger |

---

## Task 1: Database Schema

**Files:**
- Modify: `src/db/schema.ts:136` (after `aiSettings` table)

- [ ] **Step 1: Add `githubAppConfig` table to schema**

Add this after the `aiSettings` table definition in `src/db/schema.ts`:

```typescript
export const githubAppConfig = sqliteTable("github_app_config", {
  id: text("id").primaryKey(),
  appId: text("app_id").notNull(),
  appName: text("app_name").notNull(),
  appSlug: text("app_slug").notNull(),
  privateKey: text("private_key").notNull(),
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret").notNull(),
  webhookSecret: text("webhook_secret").notNull(),
  installationId: text("installation_id"),
  installedOn: text("installed_on"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

- [ ] **Step 2: Push schema to database**

Run: `npx drizzle-kit push`

Expected: Table `github_app_config` created in `cms.db`.

- [ ] **Step 3: Verify with type check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add github_app_config table to schema"
```

---

## Task 2: Config Resolution Layer

**Files:**
- Create: `src/lib/github-app-config.ts`
- Modify: `src/lib/github.ts`

- [ ] **Step 1: Create `getGitHubAppConfig()`**

Create `src/lib/github-app-config.ts`:

```typescript
import { db } from "@/db";
import { githubAppConfig } from "@/db/schema";
import { decrypt } from "@/lib/crypto";

type GitHubAppConfig = {
  appId: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  installationId: string | null;
};

export function getGitHubAppConfig(): GitHubAppConfig | null {
  const row = db.select().from(githubAppConfig).where(
    // Single-row table, always id="default"
    require("drizzle-orm").eq(githubAppConfig.id, "default")
  ).get();

  if (row) {
    return {
      appId: row.appId,
      privateKey: decrypt(row.privateKey),
      clientId: row.clientId,
      clientSecret: decrypt(row.clientSecret),
      webhookSecret: decrypt(row.webhookSecret),
      installationId: row.installationId,
    };
  }

  // Fallback to environment variables
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) return null;

  return {
    appId,
    privateKey,
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    webhookSecret: "",
    installationId: null,
  };
}
```

Wait — the `eq` import should be at the top. Fix:

```typescript
import { db } from "@/db";
import { githubAppConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

type GitHubAppConfig = {
  appId: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  installationId: string | null;
};

export function getGitHubAppConfig(): GitHubAppConfig | null {
  const row = db.select().from(githubAppConfig).where(eq(githubAppConfig.id, "default")).get();

  if (row) {
    return {
      appId: row.appId,
      privateKey: decrypt(row.privateKey),
      clientId: row.clientId,
      clientSecret: decrypt(row.clientSecret),
      webhookSecret: decrypt(row.webhookSecret),
      installationId: row.installationId,
    };
  }

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) return null;

  return {
    appId,
    privateKey,
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    webhookSecret: "",
    installationId: null,
  };
}
```

- [ ] **Step 2: Update `getOctokit()` to use config resolution**

Replace the entire contents of `src/lib/github.ts` with:

```typescript
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { getGitHubAppConfig } from "@/lib/github-app-config";

let cachedOctokit: Octokit | null = null;
let cachedConfigHash: string | null = null;

function normalizePem(raw: string): string {
  const body = raw
    .replace(/\\n/g, " ")
    .replace(/-----BEGIN[^-]*-----/, "")
    .replace(/-----END[^-]*-----/, "")
    .replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN RSA PRIVATE KEY-----\n${lines.join("\n")}\n-----END RSA PRIVATE KEY-----\n`;
}

export async function getOctokit() {
  const config = getGitHubAppConfig();
  if (!config) return null;

  const configHash = `${config.appId}:${config.installationId ?? ""}`;
  if (cachedOctokit && cachedConfigHash === configHash) return cachedOctokit;

  // Reset cache when config changes (e.g., after setup flow)
  cachedOctokit = null;
  cachedConfigHash = null;

  const key = normalizePem(config.privateKey);

  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: config.appId, privateKey: key },
  });

  // If we have a stored installation ID, use it directly
  if (config.installationId) {
    cachedOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: config.appId,
        privateKey: key,
        installationId: Number(config.installationId),
      },
    });
    cachedConfigHash = configHash;
    return cachedOctokit;
  }

  // Otherwise discover the first installation
  const { data: installations } = await appOctokit.rest.apps.listInstallations({ per_page: 1 });
  if (installations.length === 0) return null;

  cachedOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.appId,
      privateKey: key,
      installationId: installations[0].id,
    },
  });
  cachedConfigHash = configHash;
  return cachedOctokit;
}
```

- [ ] **Step 3: Verify with type check**

Run: `npx tsc --noEmit`

Expected: No errors. All existing code that calls `getOctokit()` still works — same signature, same return type.

- [ ] **Step 4: Commit**

```bash
git add src/lib/github-app-config.ts src/lib/github.ts
git commit -m "feat: config resolution layer — DB first, env fallback"
```

---

## Task 3: Status API Route

**Files:**
- Create: `src/app/api/github-app/status/route.ts`

- [ ] **Step 1: Create the status route**

Create `src/app/api/github-app/status/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { githubAppConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";

export async function GET() {
  const session = await requireSession();
  if ((session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = db.select().from(githubAppConfig).where(eq(githubAppConfig.id, "default")).get();

  if (!row) {
    // Check if env vars are configured (legacy setup)
    const hasEnv = !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
    if (hasEnv) {
      return NextResponse.json({
        configured: true,
        source: "env",
        app_id: process.env.GITHUB_APP_ID,
      });
    }
    return NextResponse.json({ configured: false });
  }

  return NextResponse.json({
    configured: true,
    source: "db",
    app_id: row.appId,
    app_name: row.appName,
    app_slug: row.appSlug,
    installed_on: row.installedOn,
    installation_id: row.installationId,
  });
}
```

- [ ] **Step 2: Verify with type check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/github-app/status/route.ts
git commit -m "feat: GET /api/github-app/status route"
```

---

## Task 4: Setup Route (Manifest + Auto-Submit Form)

**Files:**
- Create: `src/app/api/github-app/setup/route.ts`

- [ ] **Step 1: Create the setup route**

Create `src/app/api/github-app/setup/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  const session = await requireSession();
  if ((session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name") || "Kern CMS";
  const target = searchParams.get("target") || "user";
  const org = searchParams.get("org") || "";

  const state = crypto.randomUUID();

  const manifest = {
    name,
    url: baseUrl,
    hook_attributes: { url: `${baseUrl}/api/webhook/github` },
    redirect_url: `${baseUrl}/api/github-app/callback`,
    public: false,
    default_permissions: {
      contents: "write",
      metadata: "read",
      pull_requests: "write",
    },
    default_events: ["push", "pull_request"],
  };

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

  // Store state in a cookie for CSRF validation in callback
  response.cookies.set("github_app_state", state, {
    httpOnly: true,
    secure: baseUrl.startsWith("https"),
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
```

- [ ] **Step 2: Verify with type check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/github-app/setup/route.ts
git commit -m "feat: GET /api/github-app/setup — manifest form route"
```

---

## Task 5: Callback Route (Exchange Code + Save Credentials)

**Files:**
- Create: `src/app/api/github-app/callback/route.ts`

- [ ] **Step 1: Create the callback route**

Create `src/app/api/github-app/callback/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { githubAppConfig } from "@/db/schema";
import { encrypt } from "@/lib/crypto";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("github_app_state")?.value;

  if (!code || !state || state !== savedState) {
    return renderPage("Setup Failed", "Invalid or expired request. Please start the setup again.", "error");
  }

  // Clear the state cookie
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

  // Encrypt sensitive fields and save to DB
  db.insert(githubAppConfig)
    .values({
      id: "default",
      appId: String(app.id),
      appName: app.name,
      appSlug: app.slug,
      privateKey: encrypt(app.pem),
      clientId: app.client_id,
      clientSecret: encrypt(app.client_secret),
      webhookSecret: encrypt(app.webhook_secret),
      installedOn: `@${app.owner.login}`,
    })
    .onConflictDoUpdate({
      target: githubAppConfig.id,
      set: {
        appId: String(app.id),
        appName: app.name,
        appSlug: app.slug,
        privateKey: encrypt(app.pem),
        clientId: app.client_id,
        clientSecret: encrypt(app.client_secret),
        webhookSecret: encrypt(app.webhook_secret),
        installedOn: `@${app.owner.login}`,
        updatedAt: new Date(),
      },
    })
    .run();

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
```

- [ ] **Step 2: Verify with type check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/github-app/callback/route.ts
git commit -m "feat: GET /api/github-app/callback — exchange code, save credentials"
```

---

## Task 6: Install URL + Installation Callback Routes

**Files:**
- Create: `src/app/api/github-app/install-url/route.ts`
- Create: `src/app/api/github-app/installation/callback/route.ts`

- [ ] **Step 1: Create the install-url route**

Create `src/app/api/github-app/install-url/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { githubAppConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";

export async function GET() {
  const session = await requireSession();
  if ((session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = db.select({ appSlug: githubAppConfig.appSlug }).from(githubAppConfig)
    .where(eq(githubAppConfig.id, "default")).get();

  if (!row) {
    return NextResponse.json({ error: "No GitHub App configured" }, { status: 404 });
  }

  return NextResponse.json({
    url: `https://github.com/apps/${row.appSlug}/installations/new`,
  });
}
```

- [ ] **Step 2: Create the installation callback route**

Create `src/app/api/github-app/installation/callback/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { githubAppConfig } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  // Fetch installation details to get the account name
  let installedOn = row.installedOn;
  try {
    const res = await fetch(`https://api.github.com/app/installations/${installationId}`, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (res.ok) {
      const data = await res.json();
      installedOn = `@${data.account?.login ?? "unknown"}`;
    }
  } catch { /* keep existing installedOn */ }

  db.update(githubAppConfig)
    .set({ installationId, installedOn, updatedAt: new Date() })
    .where(eq(githubAppConfig.id, "default"))
    .run();

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
```

Note: The installation callback fetching installation details from `https://api.github.com/app/installations/{id}` requires app-level JWT auth. Since we just saved the app credentials, we can use them. However, for simplicity, the `installedOn` field was already set during app creation (step 5 callback). This route updates it if possible, otherwise keeps the existing value.

- [ ] **Step 3: Verify with type check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/github-app/install-url/route.ts src/app/api/github-app/installation/callback/route.ts
git commit -m "feat: install-url and installation callback routes"
```

---

## Task 7: GitHub App Setup Modal Component

**Files:**
- Create: `src/components/github-app-setup-modal.tsx`

This is extracted into its own file to keep `profile-dialog.tsx` manageable.

- [ ] **Step 1: Create the setup modal**

Create `src/components/github-app-setup-modal.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NestedDialogOverlay } from "@/components/ui/nested-dialog-overlay";

type GitHubAppStatus = {
  configured: boolean;
  source?: string;
  app_id?: string;
  app_name?: string;
  app_slug?: string;
  installed_on?: string;
  installation_id?: string;
};

type SetupStep = 1 | 2 | 3;

export function GitHubAppSetupModal({
  open,
  onOpenChange,
  initialStep = 1,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStep?: SetupStep;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<SetupStep>(initialStep);
  const [appName, setAppName] = useState("Kern CMS");
  const [target, setTarget] = useState<"user" | "org">("user");
  const [orgName, setOrgName] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<GitHubAppStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep(initialStep);
      setWaiting(false);
      setError(null);
      localStorage.removeItem("kern-github-setup-step");
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, initialStep]);

  // Poll localStorage for callback signal while waiting
  useEffect(() => {
    if (!waiting) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(() => {
      const value = localStorage.getItem("kern-github-setup-step");
      if (value === "created" && step === 1) {
        localStorage.removeItem("kern-github-setup-step");
        setWaiting(false);
        setStep(2);
        // Fetch fresh status for step 2
        fetch("/api/github-app/status").then((r) => r.json()).then(setStatus).catch(() => {});
      } else if (value === "done" && step === 2) {
        localStorage.removeItem("kern-github-setup-step");
        setWaiting(false);
        setStep(3);
        fetch("/api/github-app/status").then((r) => r.json()).then(setStatus).catch(() => {});
      } else if (value === "error") {
        localStorage.removeItem("kern-github-setup-step");
        setWaiting(false);
        setError("Something went wrong on GitHub. Please try again.");
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [waiting, step]);

  function handleCreateOnGitHub() {
    const params = new URLSearchParams({ name: appName, target });
    if (target === "org" && orgName) params.set("org", orgName);
    window.open(`/api/github-app/setup?${params}`, "_blank");
    setWaiting(true);
    setError(null);
  }

  async function handleInstallOnGitHub() {
    try {
      const res = await fetch("/api/github-app/install-url");
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      window.open(url, "_blank");
      setWaiting(true);
      setError(null);
    } catch {
      setError("Could not get install URL. Please try again.");
    }
  }

  function handleDone() {
    onOpenChange(false);
    onComplete();
  }

  if (!open) return null;

  return (
    <>
      <NestedDialogOverlay open={open} onClose={() => !waiting && onOpenChange(false)} zIndex={55} />
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ zIndex: 56 }}
        onClick={(e) => { if (e.target === e.currentTarget && !waiting) onOpenChange(false); }}
      >
        <div
          className="w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with stepper */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-base font-semibold">GitHub App Setup</h2>
            {!waiting && (
              <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-border text-xs">
            <StepIndicator num={1} label="Create" active={step === 1} done={step > 1} />
            <div className="h-px flex-1 bg-border" />
            <StepIndicator num={2} label="Install" active={step === 2} done={step > 2} />
            <div className="h-px flex-1 bg-border" />
            <StepIndicator num={3} label="Done" active={step === 3} done={false} />
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            {error && (
              <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            {step === 1 && !waiting && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Kern will create a GitHub App with the required permissions automatically. You just need to confirm on GitHub.
                </p>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="app-name">App Name</Label>
                  <Input id="app-name" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="Kern CMS" />
                  <p className="text-[11px] text-muted-foreground">You can change this to anything you like.</p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Install on</Label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="target" checked={target === "user"} onChange={() => setTarget("user")} className="accent-foreground" />
                    <span className="text-sm">My Account</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="target" checked={target === "org"} onChange={() => setTarget("org")} className="accent-foreground" />
                    <span className="text-sm">Organisation</span>
                  </label>
                  {target === "org" && (
                    <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organisation name" className="mt-1" />
                  )}
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Permissions that will be requested:</p>
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex justify-between"><span>Contents</span><span className="text-muted-foreground">Read & Write</span></div>
                    <div className="flex justify-between"><span>Metadata</span><span className="text-muted-foreground">Read only</span></div>
                    <div className="flex justify-between"><span>Pull requests</span><span className="text-muted-foreground">Read & Write</span></div>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground">This will open GitHub in a new tab. Come back here after confirming.</p>
              </div>
            )}

            {step === 1 && waiting && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <svg className="animate-spin text-muted-foreground" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <p className="text-sm font-medium">Waiting for you to confirm on GitHub</p>
                <p className="text-xs text-muted-foreground">A new tab has been opened. Review the app details and click &quot;Create GitHub App&quot; on GitHub.</p>
                <button onClick={handleCreateOnGitHub} className="text-xs text-muted-foreground underline hover:text-foreground">
                  Open GitHub again
                </button>
              </div>
            )}

            {step === 2 && !waiting && (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm text-emerald-400">
                  App &quot;{status?.app_name ?? appName}&quot; created successfully!
                </div>
                <p className="text-sm text-muted-foreground">
                  Now install the app on your account to grant repository access.
                </p>
                <p className="text-[11px] text-muted-foreground">This will open GitHub in a new tab.</p>
              </div>
            )}

            {step === 2 && waiting && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <svg className="animate-spin text-muted-foreground" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <p className="text-sm font-medium">Waiting for installation on GitHub</p>
                <p className="text-xs text-muted-foreground">Select which repositories Kern can access and confirm the installation.</p>
                <button onClick={handleInstallOnGitHub} className="text-xs text-muted-foreground underline hover:text-foreground">
                  Open GitHub again
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  {["GitHub App created", `Installed on ${status?.installed_on ?? "your account"}`, "Credentials saved securely"].map((text) => (
                    <div key={text} className="flex items-center gap-2 text-sm">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 shrink-0">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      {text}
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-border p-3 text-xs">
                  <div className="flex justify-between py-1"><span className="text-muted-foreground">App Name</span><span>{status?.app_name ?? appName}</span></div>
                  <div className="flex justify-between py-1"><span className="text-muted-foreground">App ID</span><span>{status?.app_id}</span></div>
                  <div className="flex justify-between py-1"><span className="text-muted-foreground">Installed</span><span>{status?.installed_on}</span></div>
                </div>

                <p className="text-sm text-muted-foreground">
                  Kern can now read and write to your GitHub repositories.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            {step === 1 && !waiting && (
              <>
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button size="sm" onClick={handleCreateOnGitHub} disabled={!appName.trim() || (target === "org" && !orgName.trim())}>
                  Create on GitHub
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" />
                  </svg>
                </Button>
              </>
            )}
            {step === 2 && !waiting && (
              <>
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button size="sm" onClick={handleInstallOnGitHub}>
                  Install on GitHub
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" />
                  </svg>
                </Button>
              </>
            )}
            {step === 3 && (
              <Button size="sm" onClick={handleDone}>Done</Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function StepIndicator({ num, label, active, done }: { num: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 ${active ? "text-foreground" : done ? "text-emerald-500" : "text-muted-foreground"}`}>
      <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ${
        done ? "bg-emerald-500/20 text-emerald-500" : active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
      }`}>
        {done ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : num}
      </div>
      <span className="font-medium">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify with type check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/github-app-setup-modal.tsx
git commit -m "feat: GitHub App setup modal — 3-step wizard component"
```

---

## Task 8: Update IntegrationsSection in Profile Dialog

**Files:**
- Modify: `src/components/profile-dialog.tsx:260-282`

- [ ] **Step 1: Add import for the setup modal**

At the top of `src/components/profile-dialog.tsx`, add after the existing imports:

```typescript
import { GitHubAppSetupModal } from "@/components/github-app-setup-modal";
```

- [ ] **Step 2: Replace the `IntegrationsSection` stub**

Replace the entire `IntegrationsSection` function (lines 260-282) with:

```tsx
function IntegrationsSection() {
  const [status, setStatus] = useState<{
    configured: boolean;
    source?: string;
    app_id?: string;
    app_name?: string;
    app_slug?: string;
    installed_on?: string;
    installation_id?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialStep, setModalInitialStep] = useState<1 | 2 | 3>(1);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/github-app/status");
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  function openSetup(step: 1 | 2 | 3 = 1) {
    setModalInitialStep(step);
    setModalOpen(true);
  }

  const hasAppUrl = !!process.env.NEXT_PUBLIC_APP_URL;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-medium">Integrations</h3>
        <p className="text-sm text-muted-foreground">Manage third-party integrations and connected accounts.</p>
      </div>
      <Separator />

      {/* GitHub App card */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <div>
              <p className="text-sm font-medium">GitHub</p>
              {loading ? (
                <div className="h-3 w-20 rounded bg-muted/50 animate-pulse mt-1" />
              ) : status?.configured ? (
                <p className="text-xs text-emerald-500">Connected</p>
              ) : (
                <p className="text-xs text-red-400">Not configured</p>
              )}
            </div>
          </div>
          {!loading && !status?.configured && (
            <Button variant="outline" size="sm" onClick={() => openSetup(1)} disabled={!hasAppUrl}>
              Setup GitHub App
            </Button>
          )}
        </div>

        {!loading && status?.configured && status.source === "db" && (
          <div className="border-t border-border px-4 py-3">
            <div className="flex flex-col gap-1 text-xs mb-3">
              <div className="flex justify-between"><span className="text-muted-foreground">App</span><span>{status.app_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">App ID</span><span>{status.app_id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Installed</span><span>{status.installed_on ?? "—"}</span></div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openSetup(1)}>Reconfigure</Button>
              <Button variant="outline" size="sm" onClick={() => openSetup(2)}>Reinstall</Button>
            </div>
          </div>
        )}

        {!loading && status?.configured && status.source === "env" && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Configured via environment variables. Use the setup flow to manage credentials in the UI instead.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => openSetup(1)}>
              Migrate to UI setup
            </Button>
          </div>
        )}
      </div>

      <GitHubAppSetupModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialStep={modalInitialStep}
        onComplete={loadStatus}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify with type check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Manual test — verify the integrations section renders**

1. Run the dev server: `npm run dev`
2. Open browser → navigate to the app
3. Click profile avatar → open profile dialog
4. Click "Integrations" in the sidebar (admin-only section)
5. Verify: GitHub card shows with current status (env vars configured → shows "Connected" with "Configured via environment variables" message)

- [ ] **Step 5: Commit**

```bash
git add src/components/profile-dialog.tsx
git commit -m "feat: replace IntegrationsSection stub with real GitHub App card"
```

---

## Task 9: Update GitHub Status Banner

**Files:**
- Modify: `src/app/api/github/status/route.ts`

The existing `/api/github/status` route hardcodes the error message referencing env vars. Update it to be generic since credentials can now come from the DB.

- [ ] **Step 1: Update error message**

In `src/app/api/github/status/route.ts`, replace:

```typescript
{ ok: false, error: "GitHub App not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY." },
```

with:

```typescript
{ ok: false, error: "GitHub App not configured. Set it up in Settings → Integrations." },
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/github/status/route.ts
git commit -m "fix: update GitHub status error message for new setup flow"
```

---

## Task 10: Invalidate Octokit Cache After Setup

**Files:**
- Modify: `src/lib/github.ts`

The cached Octokit instance needs to be invalidated when credentials change (after the setup flow saves new ones to DB). The current implementation already handles this via `configHash` comparison, but we should also expose a `clearOctokitCache()` for explicit invalidation.

- [ ] **Step 1: Add cache invalidation export**

Add at the bottom of `src/lib/github.ts`:

```typescript
export function clearOctokitCache() {
  cachedOctokit = null;
  cachedConfigHash = null;
}
```

- [ ] **Step 2: Call it from the callback route**

In `src/app/api/github-app/callback/route.ts`, add after the `db.insert` call:

```typescript
import { clearOctokitCache } from "@/lib/github";
```

Add the import at the top, and after the `.run()` call add:

```typescript
  clearOctokitCache();
```

- [ ] **Step 3: Same for installation callback**

In `src/app/api/github-app/installation/callback/route.ts`, add:

```typescript
import { clearOctokitCache } from "@/lib/github";
```

And after the `db.update(...).run()` call add:

```typescript
  clearOctokitCache();
```

- [ ] **Step 4: Verify with type check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/github.ts src/app/api/github-app/callback/route.ts src/app/api/github-app/installation/callback/route.ts
git commit -m "feat: invalidate Octokit cache after GitHub App setup"
```

---

## Task 11: End-to-End Verification

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 2: Verify existing GitHub features still work**

1. Run `npm run dev`
2. Go to Content page → verify repo content loads (uses `getOctokit()` via env var fallback)
3. Go to Settings → verify repo picker still works
4. Verify GitHub status check at `/api/github/status` returns `{ ok: true }`

- [ ] **Step 3: Verify integrations UI**

1. Open profile dialog → Integrations
2. Verify GitHub card shows status based on current config
3. If env vars are set: shows "Connected" + "Configured via environment variables" + "Migrate to UI setup" button

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during E2E verification"
```

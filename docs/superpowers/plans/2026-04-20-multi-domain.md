# Multi-Domain Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow customers to access kerncms via their own domains (e.g. `cms.kundendomain.de`) while OAuth always flows through the main domain (`NEXT_PUBLIC_APP_URL`). Only superadmins can register custom domains via the UI.

**Architecture:** Custom domains are stored in a `customDomains` DB table. The proxy (`src/proxy.ts`) validates incoming requests against registered domains. When a user on a custom domain clicks "Sign in", they're redirected to the main domain for OAuth. After authentication, a one-time transfer token is created and the user is redirected back to the custom domain, where the token is exchanged for a session cookie. Better Auth's `trustedOrigins` are dynamically built from registered domains.

**Tech Stack:** Next.js 16 (App Router), Better Auth, Drizzle ORM (SQLite), React 19

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/domains.ts` | Domain lookup helpers + transfer token logic |
| Create | `src/app/api/auth/domain-transfer/route.ts` | Exchange transfer token for session cookie |
| Create | `src/app/api/admin/domains/route.ts` | GET (list) + POST (create) custom domains |
| Create | `src/app/api/admin/domains/[id]/route.ts` | PATCH (update) + DELETE custom domain |
| Create | `src/app/(dashboard)/admin/domains/page.tsx` | Superadmin UI for managing domains |
| Modify | `src/db/schema.ts` | Add `customDomains` + `domainTransferTokens` tables |
| Modify | `src/lib/auth.ts` | Dynamic `trustedOrigins` from DB |
| Modify | `src/proxy.ts` | Validate custom domains, block unregistered hosts |
| Modify | `src/lib/auth-client.ts` | Force `baseURL` to main domain for auth API calls |
| Modify | `src/app/auth/page.tsx` | Redirect to main domain if on custom domain; store `returnDomain` |
| Modify | `src/app/api/auth/callback-handler/route.ts` | Generate transfer token + redirect to custom domain |
| Modify | `src/components/topbar.tsx` | Add "Domains" link for superadmins |

---

### Task 1: Database Schema — Add `customDomains` and `domainTransferTokens` Tables

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add `customDomains` table to schema**

Add after the `systemConfig` table definition in `src/db/schema.ts`:

```ts
export const customDomains = sqliteTable("custom_domains", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  domain: text("domain").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

- [ ] **Step 2: Add `domainTransferTokens` table to schema**

Add directly after `customDomains`:

```ts
export const domainTransferTokens = sqliteTable("domain_transfer_tokens", {
  token: text("token").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionToken: text("session_token").notNull(),
  targetDomain: text("target_domain").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

- [ ] **Step 3: Generate migration**

Run:
```bash
npx drizzle-kit generate
```

Expected: New SQL migration file created in `drizzle/` with `CREATE TABLE custom_domains` and `CREATE TABLE domain_transfer_tokens`.

- [ ] **Step 4: Apply migration**

Run:
```bash
npx tsx src/db/migrate.ts
```

Expected: "Migrations applied successfully"

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "kerncms: add customDomains and domainTransferTokens tables"
```

---

### Task 2: Domain Lookup Helpers and Transfer Token Logic

**Files:**
- Create: `src/lib/domains.ts`

- [ ] **Step 1: Create `src/lib/domains.ts`**

```ts
import { db } from "@/db";
import { customDomains, domainTransferTokens } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";

const MAIN_DOMAIN = process.env.NEXT_PUBLIC_APP_URL ?? "";

export function getMainDomain(): string {
  return MAIN_DOMAIN;
}

export function getMainOrigin(): string {
  try {
    return new URL(MAIN_DOMAIN).origin;
  } catch {
    return MAIN_DOMAIN;
  }
}

export function isMainDomain(host: string): boolean {
  try {
    const mainHost = new URL(MAIN_DOMAIN).host;
    return host === mainHost;
  } catch {
    return true;
  }
}

export function getEnabledDomains(): { id: string; domain: string }[] {
  return db.select({ id: customDomains.id, domain: customDomains.domain })
    .from(customDomains)
    .where(eq(customDomains.enabled, true))
    .all();
}

export function isDomainRegistered(host: string): boolean {
  if (isMainDomain(host)) return true;
  const row = db.select({ id: customDomains.id })
    .from(customDomains)
    .where(and(eq(customDomains.domain, host), eq(customDomains.enabled, true)))
    .get();
  return !!row;
}

export function createTransferToken(sessionToken: string, targetDomain: string): string {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60_000);
  db.insert(domainTransferTokens)
    .values({ token, sessionToken, targetDomain, expiresAt })
    .run();
  return token;
}

export function redeemTransferToken(token: string, host: string): string | null {
  const row = db.select()
    .from(domainTransferTokens)
    .where(and(
      eq(domainTransferTokens.token, token),
      eq(domainTransferTokens.targetDomain, host),
      gt(domainTransferTokens.expiresAt, new Date()),
    ))
    .get();

  if (!row) return null;

  db.delete(domainTransferTokens)
    .where(eq(domainTransferTokens.token, token))
    .run();

  return row.sessionToken;
}

export function cleanExpiredTokens(): void {
  db.delete(domainTransferTokens)
    .where(gt(new Date(), domainTransferTokens.expiresAt))
    .run();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/domains.ts
git commit -m "kerncms: add domain lookup helpers and transfer token logic"
```

---

### Task 3: Dynamic `trustedOrigins` in Auth Config

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Update `src/lib/auth.ts` to load trusted origins dynamically**

Replace the entire file content:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getEnabledDomains, getMainOrigin } from "@/lib/domains";

function buildTrustedOrigins(): string[] {
  const origins: string[] = [];
  const mainOrigin = getMainOrigin();
  if (mainOrigin) origins.push(mainOrigin);

  for (const { domain } of getEnabledDomains()) {
    origins.push(`https://${domain}`);
  }

  return origins;
}

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  trustedOrigins: buildTrustedOrigins(),
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "member",
        input: false,
      },
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  session: {
    cookieCache: {
      enabled: false,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
```

**Important note:** `trustedOrigins` is computed once at module load time. After adding/removing a domain, the server needs to be restarted for `trustedOrigins` to update. This is acceptable for the initial implementation — domains change rarely. A future enhancement could use `trustedOrigins` as a function if Better Auth supports it, or we could dynamically reload the auth module.

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth.ts
git commit -m "kerncms: dynamic trustedOrigins from custom domains table"
```

---

### Task 4: Update Proxy to Validate Custom Domains

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: Update `src/proxy.ts` to validate custom domains and pass host info downstream**

Replace the entire file content:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { betterFetch } from "@better-fetch/fetch";

const publicPaths = ["/auth", "/api/auth", "/api/setup"];

function isPublic(pathname: string) {
  return publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  if (isPublic(pathname)) {
    const response = NextResponse.next();
    response.headers.set("x-forwarded-host", host);
    return response;
  }

  const { data: session } = await betterFetch<{ session: { userId: string } | null }>(
    "/api/auth/get-session",
    {
      baseURL: "http://localhost:3000",
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    },
  );

  if (!session) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("x-forwarded-host", host);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

**Design decision:** We pass the `host` header downstream via `x-forwarded-host` so route handlers can detect which domain they're being accessed from. We do NOT block unregistered custom domains at the proxy level because the proxy runs for every request and DB access in the proxy should be minimized. Domain validation happens at the auth layer instead — unregistered domains simply can't authenticate.

- [ ] **Step 2: Commit**

```bash
git add src/proxy.ts
git commit -m "kerncms: pass host header through proxy for multi-domain support"
```

---

### Task 5: Update Auth Client to Always Use Main Domain

**Files:**
- Modify: `src/lib/auth-client.ts`

- [ ] **Step 1: Update `src/lib/auth-client.ts`**

The auth client must always point to the main domain for API calls, because Better Auth's OAuth callbacks are registered on the main domain only. Replace the entire file:

```ts
import { createAuthClient } from "better-auth/react";

const mainDomain = process.env.NEXT_PUBLIC_APP_URL ?? "";

export const authClient = createAuthClient({
  baseURL: typeof window === "undefined"
    ? "http://localhost:3000"
    : mainDomain || window.location.origin,
});

export const { signIn, signOut, useSession } = authClient;

export function useIsAdmin() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  return role === "admin" || role === "superadmin";
}

export function useIsSuperAdmin() {
  const { data: session } = useSession();
  return (session?.user as { role?: string } | undefined)?.role === "superadmin";
}
```

**Note:** This change is functionally identical to the current code since `NEXT_PUBLIC_APP_URL` was already used on the client side. The key difference is we're explicit that this always resolves to the main domain, not `window.location.origin` when `NEXT_PUBLIC_APP_URL` is set.

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth-client.ts
git commit -m "kerncms: ensure auth client always uses main domain"
```

---

### Task 6: Update Auth Page to Handle Cross-Domain Login

**Files:**
- Modify: `src/app/auth/page.tsx`

- [ ] **Step 1: Update `src/app/auth/page.tsx` for cross-domain flow**

When a user is on a custom domain and needs to sign in, we redirect them to the main domain's `/auth` page with a `returnDomain` query parameter. After successful OAuth on the main domain, the callback handler will redirect them back.

Replace the entire file content:

```tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signIn } from "@/lib/auth-client";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export default function AuthPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const inviteToken = params.get("invite");
  const isSetup = params.get("setup") === "1";
  const returnDomain = params.get("returnDomain");

  useEffect(() => {
    if (inviteToken) {
      document.cookie = `invite_token=${inviteToken};path=/;max-age=3600;samesite=lax`;
    }
  }, [inviteToken]);

  useEffect(() => {
    if (returnDomain) {
      document.cookie = `return_domain=${returnDomain};path=/;max-age=3600;samesite=lax`;
    }
  }, [returnDomain]);

  useEffect(() => {
    const mainDomain = process.env.NEXT_PUBLIC_APP_URL;
    if (!mainDomain) return;

    try {
      const mainHost = new URL(mainDomain).host;
      const currentHost = window.location.host;
      if (currentHost !== mainHost) {
        const url = new URL("/auth", mainDomain);
        url.searchParams.set("returnDomain", currentHost);
        if (inviteToken) url.searchParams.set("invite", inviteToken);
        if (isSetup) url.searchParams.set("setup", "1");
        window.location.href = url.toString();
      }
    } catch {
      // invalid URL, stay on current domain
    }
  }, [inviteToken, isSetup]);

  async function handleLogin(provider: "google" | "github") {
    setLoading(provider);
    await signIn.social({
      provider,
      callbackURL: "/api/auth/callback-handler",
    });
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <img src="/logo.svg" alt="kern" className="h-8 w-8" />
        <span className="text-3xl font-bold font-[family-name:var(--font-averia)]">
          <span className="text-foreground">kern</span><span className="text-muted-foreground">cms</span>
        </span>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {isSetup ? "Create Admin Account" : "Sign in"}
          </CardTitle>
          <CardDescription>
            {inviteToken
              ? "Sign in to accept your invitation"
              : isSetup
                ? "Sign in with Google or GitHub to create the first admin account"
                : "Sign in to continue"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            variant="outline"
            className="w-full justify-center gap-3 h-10"
            onClick={() => handleLogin("google")}
            disabled={loading !== null}
          >
            <GoogleIcon />
            {loading === "google" ? "Redirecting..." : "Continue with Google"}
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <Button
            variant="outline"
            className="w-full justify-center gap-3 h-10"
            onClick={() => handleLogin("github")}
            disabled={loading !== null}
          >
            <GithubIcon />
            {loading === "github" ? "Redirecting..." : "Continue with GitHub"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

Key changes:
- New `useEffect` that checks if the user is on a custom domain. If so, redirects to main domain `/auth` with `returnDomain` query param.
- Stores `returnDomain` as a cookie so the callback handler can read it after OAuth redirect.

- [ ] **Step 2: Commit**

```bash
git add src/app/auth/page.tsx
git commit -m "kerncms: redirect custom domain auth to main domain with returnDomain"
```

---

### Task 7: Update Callback Handler to Support Domain Transfer

**Files:**
- Modify: `src/app/api/auth/callback-handler/route.ts`

- [ ] **Step 1: Update callback handler to generate transfer token and redirect**

Replace the entire file content:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { systemConfig, invitations, projectMembers, user } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { createTransferToken, isDomainRegistered } from "@/lib/domains";

function appUrl(path: string, fallback: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  return base ? new URL(path, base) : new URL(path, fallback);
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.redirect(appUrl("/auth", request.url));
  }

  const userId = session.user.id;
  const cookies = request.cookies;

  // ── Check if setup is complete ──
  const setupRow = db.select().from(systemConfig).where(eq(systemConfig.key, "setup_complete")).get();
  if (setupRow?.value !== "true") {
    return NextResponse.redirect(appUrl("/setup", request.url));
  }

  // ── Handle invite redemption ──
  const inviteToken = cookies.get("invite_token")?.value;
  if (inviteToken) {
    const invite = db
      .select()
      .from(invitations)
      .where(eq(invitations.token, inviteToken))
      .get();

    const clearInvite = (response: NextResponse) => {
      response.cookies.delete("invite_token");
      return response;
    };

    if (invite && new Date(invite.expiresAt) > new Date()) {
      const existing = db
        .select()
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, invite.projectId), eq(projectMembers.userId, userId)))
        .get();

      if (!existing) {
        db.insert(projectMembers)
          .values({
            projectId: invite.projectId,
            userId,
            role: invite.role,
          })
          .run();
      }

      db.delete(invitations).where(eq(invitations.id, invite.id)).run();
    }

    // Check for return domain before falling through
    const returnDomain = cookies.get("return_domain")?.value;
    if (returnDomain && isDomainRegistered(returnDomain)) {
      const sessionToken = cookies.get("better-auth.session_token")?.value;
      if (sessionToken) {
        const transferToken = createTransferToken(sessionToken, returnDomain);
        const targetUrl = new URL(`/api/auth/domain-transfer`, `https://${returnDomain}`);
        targetUrl.searchParams.set("token", transferToken);
        const response = NextResponse.redirect(targetUrl);
        response.cookies.delete("invite_token");
        response.cookies.delete("return_domain");
        return response;
      }
    }

    const response = NextResponse.redirect(appUrl("/", request.url));
    return clearInvite(response);
  }

  // ── Handle cross-domain redirect ──
  const returnDomain = cookies.get("return_domain")?.value;
  if (returnDomain && isDomainRegistered(returnDomain)) {
    const sessionToken = cookies.get("better-auth.session_token")?.value;
    if (sessionToken) {
      const transferToken = createTransferToken(sessionToken, returnDomain);
      const targetUrl = new URL(`/api/auth/domain-transfer`, `https://${returnDomain}`);
      targetUrl.searchParams.set("token", transferToken);
      const response = NextResponse.redirect(targetUrl);
      response.cookies.delete("return_domain");
      return response;
    }
  }

  // ── Default redirect ──
  return NextResponse.redirect(appUrl("/", request.url));
}
```

Key changes:
- After successful auth, checks for `return_domain` cookie.
- If present and domain is registered, creates a transfer token and redirects to the custom domain's `/api/auth/domain-transfer` endpoint.
- Cleans up the `return_domain` cookie.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/auth/callback-handler/route.ts
git commit -m "kerncms: generate transfer token and redirect to custom domain after OAuth"
```

---

### Task 8: Domain Transfer Endpoint

**Files:**
- Create: `src/app/api/auth/domain-transfer/route.ts`

- [ ] **Step 1: Create the domain transfer endpoint**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { redeemTransferToken } from "@/lib/domains";

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
  response.cookies.set("better-auth.session_token", sessionToken, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
```

This endpoint:
1. Reads the one-time transfer token from the URL.
2. Validates it against the DB (checks token exists, matches host, not expired).
3. Deletes the token (one-time use).
4. Sets the session cookie for the current domain.
5. Redirects to dashboard.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/auth/domain-transfer/route.ts
git commit -m "kerncms: add domain transfer endpoint for cross-domain session"
```

---

### Task 9: Admin API — Custom Domain CRUD

**Files:**
- Create: `src/app/api/admin/domains/route.ts`
- Create: `src/app/api/admin/domains/[id]/route.ts`

- [ ] **Step 1: Create `src/app/api/admin/domains/route.ts`**

```ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { customDomains, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, isSuperAdminRole } from "@/lib/auth-helpers";

async function requireSuperAdmin() {
  const session = await requireSession();
  const u = db.select({ role: user.role }).from(user).where(eq(user.id, session.user.id)).get();
  if (!isSuperAdminRole(u?.role)) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}

export async function GET() {
  await requireSuperAdmin();
  const domains = db.select().from(customDomains).all();
  return NextResponse.json({ domains });
}

export async function POST(request: Request) {
  await requireSuperAdmin();
  const { domain } = await request.json();

  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "Domain is required" }, { status: 400 });
  }

  const cleaned = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(cleaned)) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  const existing = db.select({ id: customDomains.id })
    .from(customDomains)
    .where(eq(customDomains.domain, cleaned))
    .get();

  if (existing) {
    return NextResponse.json({ error: "Domain already exists" }, { status: 409 });
  }

  const row = db.insert(customDomains)
    .values({ domain: cleaned })
    .returning()
    .get();

  return NextResponse.json(row, { status: 201 });
}
```

- [ ] **Step 2: Create `src/app/api/admin/domains/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { customDomains, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, isSuperAdminRole } from "@/lib/auth-helpers";

async function requireSuperAdmin() {
  const session = await requireSession();
  const u = db.select({ role: user.role }).from(user).where(eq(user.id, session.user.id)).get();
  if (!isSuperAdminRole(u?.role)) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  db.update(customDomains).set(updates).where(eq(customDomains.id, id)).run();

  const updated = db.select().from(customDomains).where(eq(customDomains.id, id)).get();
  if (!updated) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;

  const existing = db.select({ id: customDomains.id }).from(customDomains).where(eq(customDomains.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  db.delete(customDomains).where(eq(customDomains.id, id)).run();
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/domains/route.ts src/app/api/admin/domains/\[id\]/route.ts
git commit -m "kerncms: add superadmin API for custom domain CRUD"
```

---

### Task 10: Superadmin Domain Management UI

**Files:**
- Create: `src/app/(dashboard)/admin/domains/page.tsx`

- [ ] **Step 1: Create the domain management page**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useIsSuperAdmin } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type CustomDomain = {
  id: string;
  domain: string;
  enabled: boolean;
  createdAt: string;
};

export default function DomainsPage() {
  const isSuperAdmin = useIsSuperAdmin();
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomDomain | null>(null);

  const fetchDomains = useCallback(async () => {
    const res = await fetch("/api/admin/domains");
    if (res.ok) {
      const data = await res.json();
      setDomains(data.domains);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  async function handleAdd() {
    if (!newDomain.trim()) return;
    setAdding(true);
    const res = await fetch("/api/admin/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: newDomain.trim() }),
    });
    if (res.ok) {
      toast.success("Domain added. Restart the server for OAuth to recognize it.");
      setNewDomain("");
      setShowAdd(false);
      await fetchDomains();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to add domain");
    }
    setAdding(false);
  }

  async function handleToggle(domain: CustomDomain) {
    const res = await fetch(`/api/admin/domains/${domain.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !domain.enabled }),
    });
    if (res.ok) {
      setDomains((prev) =>
        prev.map((d) => (d.id === domain.id ? { ...d, enabled: !d.enabled } : d))
      );
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/admin/domains/${deleteTarget.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Domain removed");
      setDomains((prev) => prev.filter((d) => d.id !== deleteTarget.id));
    } else {
      toast.error("Failed to remove domain");
    }
    setDeleteTarget(null);
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Only superadmins can manage custom domains.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight font-[family-name:var(--font-averia)]">Custom Domains</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Allow customers to access kerncms via their own domain.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          Add Domain
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : domains.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-14 text-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <div>
            <p className="text-sm font-medium">No custom domains</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add a domain to let customers access the CMS via their own URL.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {domains.map((domain) => (
            <div
              key={domain.id}
              className="flex items-center justify-between rounded-lg border border-border p-4"
            >
              <div className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full ${domain.enabled ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                <div>
                  <p className="text-sm font-medium font-mono">{domain.domain}</p>
                  <p className="text-xs text-muted-foreground">
                    {domain.enabled ? "Active" : "Disabled"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggle(domain)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    domain.enabled ? "bg-foreground" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                      domain.enabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setDeleteTarget(domain)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-border bg-muted/20 p-4">
        <h3 className="text-sm font-medium mb-2">Setup Instructions</h3>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>Add the custom domain above.</li>
          <li>Point the domain to this server via a CNAME or A record.</li>
          <li>Ensure TLS/SSL is configured (e.g. via Caddy, Cloudflare, or a reverse proxy).</li>
          <li>Restart the kerncms server so OAuth recognizes the new domain.</li>
        </ol>
      </div>

      {/* Add domain dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Custom Domain</DialogTitle>
            <DialogDescription>
              Enter the domain customers will use to access the CMS.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label className="text-sm">Domain</Label>
            <Input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="cms.kundendomain.de"
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            />
            <p className="text-[11px] text-muted-foreground">
              Without protocol (no https://). Example: cms.example.com
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={adding || !newDomain.trim()}>
              {adding ? "Adding..." : "Add Domain"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Domain</DialogTitle>
            <DialogDescription>
              Remove <strong className="font-mono">{deleteTarget?.domain}</strong>? Users on this domain will no longer be able to access the CMS.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/admin/domains/page.tsx
git commit -m "kerncms: add superadmin domain management UI"
```

---

### Task 11: Add Navigation Link for Domain Management

**Files:**
- Modify: `src/components/topbar.tsx`

- [ ] **Step 1: Add "Domains" nav item for superadmins**

In `src/components/topbar.tsx`, find the `navItems` array (around line 31) and add a "Domains" entry:

Find this code:
```ts
  const navItems = [
    { href: "/", label: "Dashboard", show: true, needsOnboarding: false },
    { href: "/content", label: "Content", show: true, needsOnboarding: true },
    { href: "/media", label: "Media", show: true, needsOnboarding: true },
    { href: "/settings", label: "Settings", show: canSeeSettings, needsOnboarding: false },
  ].filter((item) => item.show);
```

Replace with:
```ts
  const isSuperAdmin = useIsSuperAdmin();

  const navItems = [
    { href: "/", label: "Dashboard", show: true, needsOnboarding: false },
    { href: "/content", label: "Content", show: true, needsOnboarding: true },
    { href: "/media", label: "Media", show: true, needsOnboarding: true },
    { href: "/settings", label: "Settings", show: canSeeSettings, needsOnboarding: false },
    { href: "/admin/domains", label: "Domains", show: isSuperAdmin, needsOnboarding: false },
  ].filter((item) => item.show);
```

Also add `useIsSuperAdmin` to the import from `@/lib/auth-client`:

Find:
```ts
import { useIsAdmin } from "@/lib/auth-client";
```

Replace with:
```ts
import { useIsAdmin, useIsSuperAdmin } from "@/lib/auth-client";
```

- [ ] **Step 2: Commit**

```bash
git add src/components/topbar.tsx
git commit -m "kerncms: add Domains nav link for superadmins"
```

---

### Task 12: Manual Testing and Verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify domain management UI**

1. Log in as superadmin.
2. Navigate to `/admin/domains`.
3. Add a test domain (e.g., `test.localhost`).
4. Verify it appears in the list.
5. Toggle it off and on.
6. Delete it.

- [ ] **Step 3: Verify the API endpoints**

```bash
# List domains (should return empty or your test domains)
curl -s http://localhost:3000/api/admin/domains -H "Cookie: <your-session-cookie>" | jq

# Add a domain
curl -s -X POST http://localhost:3000/api/admin/domains \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"domain": "cms.test.example"}' | jq

# Delete a domain
curl -s -X DELETE http://localhost:3000/api/admin/domains/<id> \
  -H "Cookie: <your-session-cookie>" | jq
```

- [ ] **Step 4: Verify auth page redirect behavior**

Open the auth page with a `returnDomain` param:
```
http://localhost:3000/auth?returnDomain=cms.test.example
```

Verify the `return_domain` cookie is set. After OAuth, the callback handler should detect the cookie and attempt the transfer redirect (will fail on localhost since `https://cms.test.example` won't resolve — this is expected, the logic flow is what we're verifying).

- [ ] **Step 5: Verify non-superadmin access is blocked**

Log in as a non-superadmin user. Navigate to `/admin/domains`. Verify the "Only superadmins" message appears. Verify API endpoints return 403.

---

## Known Limitations & Future Work

1. **`trustedOrigins` is computed at startup.** After adding/removing a domain, the server must be restarted. This could be improved by making `trustedOrigins` a function (if Better Auth supports it) or by implementing hot-reload.

2. **SSL/TLS is not managed.** The user must configure their reverse proxy (Caddy, nginx, Cloudflare) to handle TLS for custom domains. Automatic certificate provisioning (like Caddy's auto-HTTPS) could be documented.

3. **Cookie security.** The transfer token approach is secure (one-time use, 60s expiry, domain-validated), but relies on HTTPS for the custom domain. HTTP custom domains would expose the session cookie.

4. **Session cookie alignment.** The domain transfer sets a 7-day `maxAge` for the session cookie on the custom domain. This should match Better Auth's session config. If Better Auth's session expiry changes, this value should be updated to match.

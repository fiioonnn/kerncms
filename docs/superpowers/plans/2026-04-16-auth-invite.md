# Auth & Invite System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Google/GitHub OAuth login, project-scoped roles, email invites via Resend, and self-service account management for the CMS.

**Architecture:** Better Auth handles OAuth + sessions with Drizzle/SQLite adapter. Projects move from client-state to DB. Invite tokens are stored as cookies and redeemed post-login. Middleware protects dashboard routes. Resend sends invite emails using a React template.

**Tech Stack:** Better Auth, Drizzle ORM, SQLite (better-sqlite3), Resend, Next.js 16 route handlers, React 19

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install better-auth and resend**

```bash
npm install better-auth resend
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('better-auth'); require('resend'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add better-auth and resend dependencies"
```

---

### Task 2: Database Schema

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add all new tables to schema**

Replace the contents of `src/db/schema.ts` with:

```typescript
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── Better Auth managed tables ──────────────────────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ── Application tables ──────────────────────────────────────

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  url: text("url"),
  repo: text("repo"),
  branch: text("branch"),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const projectMembers = sqliteTable("project_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["admin", "editor", "viewer"] }).notNull(),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("project_members_unique").on(table.projectId, table.userId),
]);

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role", { enum: ["admin", "editor", "viewer"] }).notNull(),
  token: text("token").notNull().unique().$defaultFn(() => crypto.randomUUID()),
  invitedBy: text("invited_by").notNull().references(() => user.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("invitations_unique").on(table.projectId, table.email),
]);

export const systemConfig = sqliteTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ── Content tables (existing) ───────────────────────────────

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

- [ ] **Step 2: Run drizzle-kit push to apply schema**

```bash
npx drizzle-kit push
```

Expected: Tables created successfully (user, session, account, verification, projects, project_members, invitations, system_config, posts).

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add auth, projects, members, invitations schema"
```

---

### Task 3: Better Auth Server Configuration

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/auth-client.ts`
- Modify: `.env`

- [ ] **Step 1: Add environment variables to `.env`**

Append to `.env` (user fills in actual values):

```env
BETTER_AUTH_SECRET=change-me-to-a-random-string
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
RESEND_API_KEY=your-resend-api-key
```

- [ ] **Step 2: Create Better Auth server instance**

Create `src/lib/auth.ts`:

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
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
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
});

export type Session = typeof auth.$Infer.Session;
```

- [ ] **Step 3: Create Better Auth client**

Create `src/lib/auth-client.ts`:

```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
});

export const { signIn, signOut, useSession } = authClient;
```

- [ ] **Step 4: Add `NEXT_PUBLIC_APP_URL` to `.env`**

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth-client.ts .env
git commit -m "feat: configure better-auth with google/github providers"
```

---

### Task 4: Auth API Route Handler

**Files:**
- Create: `src/app/api/auth/[...all]/route.ts`

- [ ] **Step 1: Create catch-all auth route**

Create `src/app/api/auth/[...all]/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 2: Verify the route loads**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/auth/[...all]/route.ts"
git commit -m "feat: add better-auth catch-all route handler"
```

---

### Task 5: Auth Helpers (getSession, requireSession, requireRole)

**Files:**
- Create: `src/lib/auth-helpers.ts`

- [ ] **Step 1: Create server-side auth helpers**

Create `src/lib/auth-helpers.ts`:

```typescript
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { projectMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function getSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}

export async function getMemberRole(projectId: string, userId: string) {
  const member = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .get();
  return member?.role ?? null;
}

export async function requireRole(projectId: string, userId: string, allowedRoles: string[]) {
  const role = await getMemberRole(projectId, userId);
  if (!role || !allowedRoles.includes(role)) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return role;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth-helpers.ts
git commit -m "feat: add server-side auth helper functions"
```

---

### Task 6: Middleware (Route Protection)

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Create middleware**

Create `src/middleware.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { betterFetch } from "@better-fetch/fetch";

const publicPaths = ["/auth", "/setup", "/api/auth", "/api/setup"];

function isPublic(pathname: string) {
  return publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Check session via Better Auth
  const { data: session } = await betterFetch<{ session: { userId: string } | null }>(
    "/api/auth/get-session",
    {
      baseURL: request.nextUrl.origin,
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    },
  );

  if (!session) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add auth middleware for route protection"
```

---

### Task 7: Setup Flow (PIN → OAuth → First Admin)

**Files:**
- Modify: `src/app/api/setup/route.ts`
- Modify: `src/app/setup/page.tsx`

- [ ] **Step 1: Update setup API to set cookie and check if already complete**

Replace `src/app/api/setup/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const row = db.select().from(systemConfig).where(eq(systemConfig.key, "setup_complete")).get();
  return NextResponse.json({ complete: row?.value === "true" });
}

export async function POST(request: Request) {
  const row = db.select().from(systemConfig).where(eq(systemConfig.key, "setup_complete")).get();
  if (row?.value === "true") {
    return NextResponse.json({ error: "Setup already complete" }, { status: 400 });
  }

  const { pin } = await request.json();
  const adminPin = process.env.ADMIN_PIN;

  if (!adminPin) {
    return NextResponse.json({ error: "ADMIN_PIN not configured" }, { status: 500 });
  }

  if (pin !== adminPin) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("setup_pin_verified", "true", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes to complete OAuth
    path: "/",
  });

  return response;
}
```

- [ ] **Step 2: Update setup page to redirect to /auth after PIN**

Replace `src/app/setup/page.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function SetupPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/setup").then((r) => r.json()).then((data) => {
      if (data.complete) router.replace("/auth");
    });
  }, [router]);

  async function handleConfirm() {
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    if (res.ok) {
      router.push("/auth?setup=1");
    } else {
      setError(true);
      setPin("");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <CardTitle className="text-xl">Admin Access</CardTitle>
          <CardDescription>
            Enter the admin PIN from your .env file to set up the first admin account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <InputOTP maxLength={6} value={pin} onChange={(value) => { setPin(value); setError(false); }}>
            <InputOTPGroup>
              <InputOTPSlot index={0} className="size-11 text-lg" />
              <InputOTPSlot index={1} className="size-11 text-lg" />
              <InputOTPSlot index={2} className="size-11 text-lg" />
              <InputOTPSlot index={3} className="size-11 text-lg" />
              <InputOTPSlot index={4} className="size-11 text-lg" />
              <InputOTPSlot index={5} className="size-11 text-lg" />
            </InputOTPGroup>
          </InputOTP>
          {error && <p className="text-sm text-destructive">Invalid PIN. Please try again.</p>}
        </CardContent>
        <CardFooter className="border-0 bg-transparent px-4 pb-4">
          <Button className="w-full" disabled={pin.length < 6} onClick={handleConfirm}>
            Confirm
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/setup/route.ts src/app/setup/page.tsx
git commit -m "feat: setup flow sets pin cookie and redirects to auth"
```

---

### Task 8: Auth Page (Login + Invite Token Handling)

**Files:**
- Modify: `src/app/auth/page.tsx`

- [ ] **Step 1: Wire auth page to Better Auth with invite handling**

Replace `src/app/auth/page.tsx`:

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

  // Store invite token as cookie so it survives the OAuth redirect
  useEffect(() => {
    if (inviteToken) {
      document.cookie = `invite_token=${inviteToken};path=/;max-age=3600;samesite=lax`;
    }
  }, [inviteToken]);

  async function handleLogin(provider: "google" | "github") {
    setLoading(provider);
    await signIn.social({
      provider,
      callbackURL: "/api/auth/callback-handler",
    });
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
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

- [ ] **Step 2: Commit**

```bash
git add src/app/auth/page.tsx
git commit -m "feat: wire auth page to better-auth with invite token handling"
```

---

### Task 9: Post-Login Callback Handler (Setup + Invite Redemption)

**Files:**
- Create: `src/app/api/auth/callback-handler/route.ts`

- [ ] **Step 1: Create callback handler that processes setup and invites**

Create `src/app/api/auth/callback-handler/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { systemConfig, invitations, projectMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  const userId = session.user.id;
  const cookies = request.cookies;

  // ── Handle setup flow ──
  const pinVerified = cookies.get("setup_pin_verified")?.value === "true";
  if (pinVerified) {
    // Mark setup as complete
    db.insert(systemConfig)
      .values({ key: "setup_complete", value: "true" })
      .onConflictDoUpdate({ target: systemConfig.key, set: { value: "true" } })
      .run();

    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete("setup_pin_verified");
    return response;
  }

  // ── Handle invite redemption ──
  const inviteToken = cookies.get("invite_token")?.value;
  if (inviteToken) {
    const invite = db
      .select()
      .from(invitations)
      .where(eq(invitations.token, inviteToken))
      .get();

    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete("invite_token");

    if (invite && new Date(invite.expiresAt) > new Date()) {
      // Check not already a member
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

      // Delete the invitation
      db.delete(invitations).where(eq(invitations.id, invite.id)).run();
    }

    return response;
  }

  // ── Default redirect ──
  return NextResponse.redirect(new URL("/", request.url));
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/auth/callback-handler/route.ts"
git commit -m "feat: post-login handler for setup completion and invite redemption"
```

---

### Task 10: Invite Email Template

**Files:**
- Create: `src/emails/invite.tsx`

- [ ] **Step 1: Create the invite email template**

Create `src/emails/invite.tsx`:

```tsx
type InviteEmailProps = {
  projectName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
};

export function InviteEmail({ projectName, inviterName, role, inviteUrl }: InviteEmailProps) {
  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", backgroundColor: "#0a0a0a", padding: "40px 20px" }}>
      <div style={{ maxWidth: "460px", margin: "0 auto", backgroundColor: "#141414", borderRadius: "12px", border: "1px solid #262626", overflow: "hidden" }}>
        <div style={{ padding: "32px 32px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "24px" }}>
            <img src={`${process.env.NEXT_PUBLIC_APP_URL}/logo.svg`} width="28" height="28" alt="kern" style={{ borderRadius: "6px" }} />
            <span style={{ fontSize: "18px", fontWeight: 700, color: "#fafafa" }}>kern</span>
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#fafafa", margin: "0 0 8px", lineHeight: 1.3 }}>
            You&apos;ve been invited to {projectName}
          </h1>
          <p style={{ fontSize: "14px", color: "#a1a1aa", margin: "0 0 24px", lineHeight: 1.6 }}>
            {inviterName} invited you as <strong style={{ color: "#fafafa" }}>{role}</strong>.
          </p>
        </div>
        <div style={{ padding: "0 32px 32px" }}>
          <a
            href={inviteUrl}
            style={{
              display: "block",
              textAlign: "center" as const,
              backgroundColor: "#fafafa",
              color: "#0a0a0a",
              padding: "10px 24px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Accept Invite
          </a>
        </div>
        <div style={{ padding: "16px 32px", borderTop: "1px solid #262626" }}>
          <p style={{ fontSize: "12px", color: "#52525b", margin: 0, textAlign: "center" as const }}>
            This invite expires in 7 days. If you didn&apos;t expect this, you can ignore it.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/emails/invite.tsx
git commit -m "feat: add invite email template matching app design"
```

---

### Task 11: Invite API Routes

**Files:**
- Create: `src/app/api/invites/route.ts`
- Create: `src/app/api/invites/[id]/route.ts`

- [ ] **Step 1: Create invite creation endpoint with Resend**

Create `src/app/api/invites/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/db";
import { invitations, projects } from "@/db/schema";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { InviteEmail } from "@/emails/invite";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  const session = await requireSession();
  const { projectId, email, role } = await request.json();

  await requireRole(projectId, session.user.id, ["admin"]);

  const project = db.select().from(projects).where(
    (await import("drizzle-orm")).eq(projects.id, projectId)
  ).get();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  let invite;
  try {
    [invite] = db.insert(invitations).values({
      projectId,
      email,
      role,
      invitedBy: session.user.id,
      expiresAt,
    }).returning().all();
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return NextResponse.json({ error: "Invitation already sent to this email" }, { status: 409 });
    }
    throw e;
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth?invite=${invite.token}`;

  await resend.emails.send({
    from: "kern CMS <noreply@${process.env.RESEND_FROM_DOMAIN ?? "resend.dev"}>",
    to: email,
    subject: `You've been invited to ${project.name}`,
    react: InviteEmail({
      projectName: project.name,
      inviterName: session.user.name,
      role: role.charAt(0).toUpperCase() + role.slice(1),
      inviteUrl,
    }),
  });

  return NextResponse.json({ id: invite.id });
}
```

- [ ] **Step 2: Create invite deletion endpoint**

Create `src/app/api/invites/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { invitations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const invite = db.select().from(invitations).where(eq(invitations.id, id)).get();
  if (!invite) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await requireRole(invite.projectId, session.user.id, ["admin"]);

  db.delete(invitations).where(eq(invitations.id, id)).run();

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/invites/route.ts "src/app/api/invites/[id]/route.ts"
git commit -m "feat: add invite create and delete API routes with resend email"
```

---

### Task 12: Members API Routes

**Files:**
- Create: `src/app/api/members/[id]/route.ts`

- [ ] **Step 1: Create member update and remove endpoints**

Create `src/app/api/members/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const { role } = await request.json();

  const member = db.select().from(projectMembers).where(eq(projectMembers.id, id)).get();
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await requireRole(member.projectId, session.user.id, ["admin"]);

  db.update(projectMembers).set({ role }).where(eq(projectMembers.id, id)).run();

  return NextResponse.json({ success: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const member = db.select().from(projectMembers).where(eq(projectMembers.id, id)).get();
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Allow self-removal or admin removal
  const isSelf = member.userId === session.user.id;
  if (!isSelf) {
    await requireRole(member.projectId, session.user.id, ["admin"]);
  }

  db.delete(projectMembers).where(eq(projectMembers.id, id)).run();

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/members/[id]/route.ts"
git commit -m "feat: add member role update and removal API routes"
```

---

### Task 13: Projects API Routes

**Files:**
- Create: `src/app/api/projects/route.ts`
- Create: `src/app/api/projects/[id]/route.ts`
- Create: `src/app/api/projects/[id]/leave/route.ts`
- Create: `src/app/api/projects/[id]/members/route.ts`

- [ ] **Step 1: Create project CRUD endpoints**

Create `src/app/api/projects/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";

export async function GET() {
  const session = await requireSession();

  const rows = db
    .select({
      id: projects.id,
      name: projects.name,
      color: projects.color,
      url: projects.url,
      repo: projects.repo,
      branch: projects.branch,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, session.user.id))
    .all();

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await requireSession();
  const { name, color, url } = await request.json();

  const [project] = db.insert(projects).values({
    name,
    color: color ?? "#3b82f6",
    url,
    createdBy: session.user.id,
  }).returning().all();

  db.insert(projectMembers).values({
    projectId: project.id,
    userId: session.user.id,
    role: "admin",
  }).run();

  return NextResponse.json(project);
}
```

- [ ] **Step 2: Create project update/delete endpoints**

Create `src/app/api/projects/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const body = await request.json();
  db.update(projects).set(body).where(eq(projects.id, id)).run();

  return NextResponse.json({ success: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  db.delete(projects).where(eq(projects.id, id)).run();

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create leave project endpoint**

Create `src/app/api/projects/[id]/leave/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  // Check if user is last admin
  const admins = db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, id), eq(projectMembers.role, "admin")))
    .all();

  const isSelfAdmin = admins.some((a) => a.userId === session.user.id);
  if (isSelfAdmin && admins.length === 1) {
    return NextResponse.json(
      { error: "Cannot leave: you are the only admin. Transfer admin role first." },
      { status: 400 },
    );
  }

  db.delete(projectMembers)
    .where(and(eq(projectMembers.projectId, id), eq(projectMembers.userId, session.user.id)))
    .run();

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Create members list endpoint for a project**

Create `src/app/api/projects/[id]/members/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectMembers, user, invitations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, getMemberRole } from "@/lib/auth-helpers";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const role = await getMemberRole(id, session.user.id);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = db
    .select({
      id: projectMembers.id,
      userId: projectMembers.userId,
      role: projectMembers.role,
      joinedAt: projectMembers.joinedAt,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(projectMembers)
    .innerJoin(user, eq(projectMembers.userId, user.id))
    .where(eq(projectMembers.projectId, id))
    .all();

  const pending = db
    .select()
    .from(invitations)
    .where(eq(invitations.projectId, id))
    .all();

  return NextResponse.json({ members, invitations: pending });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projects/route.ts "src/app/api/projects/[id]/route.ts" "src/app/api/projects/[id]/leave/route.ts" "src/app/api/projects/[id]/members/route.ts"
git commit -m "feat: add project CRUD, leave, and members API routes"
```

---

### Task 14: Account Deletion API

**Files:**
- Create: `src/app/api/account/route.ts`

- [ ] **Step 1: Create account deletion endpoint**

Create `src/app/api/account/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { user, projectMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";

export async function DELETE() {
  const session = await requireSession();
  const userId = session.user.id;

  // Check if user is sole admin of any project
  const memberships = db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.role, "admin")))
    .all();

  for (const membership of memberships) {
    const otherAdmins = db
      .select()
      .from(projectMembers)
      .where(and(
        eq(projectMembers.projectId, membership.projectId),
        eq(projectMembers.role, "admin"),
      ))
      .all()
      .filter((m) => m.userId !== userId);

    if (otherAdmins.length === 0) {
      return NextResponse.json(
        { error: `You are the only admin of a project. Transfer admin role before deleting your account.` },
        { status: 400 },
      );
    }
  }

  // Cascade: delete memberships, then user (sessions/accounts cascade via FK)
  db.delete(projectMembers).where(eq(projectMembers.userId, userId)).run();
  db.delete(user).where(eq(user.id, userId)).run();

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/account/route.ts
git commit -m "feat: add account self-deletion API route"
```

---

### Task 15: ProjectProvider — Fetch from DB

**Files:**
- Modify: `src/components/project-context.tsx`

- [ ] **Step 1: Rewrite ProjectProvider to fetch projects from API**

Replace `src/components/project-context.tsx`:

```tsx
"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

type Project = {
  id: string;
  name: string;
  color: string;
  url?: string;
  repo?: string;
  branch?: string;
  role: "admin" | "editor" | "viewer";
};

type ProjectContextType = {
  projects: Project[];
  current: Project | null;
  loading: boolean;
  addProject: (project: { name: string; color?: string; url?: string }) => Promise<void>;
  updateProject: (id: string, data: Partial<Omit<Project, "id" | "role">>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrent: (id: string) => void;
  refresh: () => Promise<void>;
};

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const addProject = useCallback(async (project: { name: string; color?: string; url?: string }) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    if (res.ok) {
      const created = await res.json();
      setProjects((prev) => [...prev, { ...created, role: "admin" }]);
      setCurrentId(created.id);
    }
  }, []);

  const updateProject = useCallback(async (id: string, data: Partial<Omit<Project, "id" | "role">>) => {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
    }
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (currentId === id) setCurrentId(null);
    }
  }, [currentId]);

  const current = projects.find((p) => p.id === currentId) ?? null;

  return (
    <ProjectContext.Provider value={{
      projects, current, loading, addProject, updateProject, deleteProject,
      setCurrent: setCurrentId, refresh: fetchProjects,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectProvider");
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/project-context.tsx
git commit -m "feat: rewrite project context to fetch from DB API"
```

---

### Task 16: Wire Profile Dialog to Real APIs

**Files:**
- Modify: `src/components/profile-dialog.tsx`

- [ ] **Step 1: Update ProfileDialog to use real session and APIs**

Key changes needed in `src/components/profile-dialog.tsx`:

1. Import `useSession`, `signOut` from `@/lib/auth-client` and `useProjects` from `@/components/project-context`
2. **ProfileSection**: Show real user data from session (`session.user.name`, `session.user.email`, `session.user.image`)
3. **AccountSection**: Add "Delete Account" with confirmation that calls `DELETE /api/account`, then `signOut()`
4. **MembersSection**: Fetch members from `GET /api/projects/{id}/members`, wire invite to `POST /api/invites`, wire role change to `PATCH /api/members/{id}`, wire remove to `DELETE /api/members/{id}`. Only show admin actions if `current.role === "admin"`.
5. **Sign Out button**: Call `signOut({ fetchOptions: { onSuccess: () => router.push("/auth") } })`
6. **Avatar in trigger**: Show `session.user.image` or first letter of name

This task modifies many sections of the file. The engineer should read the existing `profile-dialog.tsx` (shown in spec), update each section to use real data, and keep the existing UI structure intact.

- [ ] **Step 2: Commit**

```bash
git add src/components/profile-dialog.tsx
git commit -m "feat: wire profile dialog to auth session and member APIs"
```

---

### Task 17: Wire NewProjectDialog to API

**Files:**
- Modify: `src/components/new-project-dialog.tsx`

- [ ] **Step 1: Update NewProjectDialog to call API**

The `NewProjectDialog` currently calls `addProject` from context which is already wired to the API in Task 15. Verify it works — no code change should be needed if the `addProject` signature matches. If the dialog passes fields like `repo` or `branch`, ensure those are handled in the API.

- [ ] **Step 2: Verify by type-checking**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit if changes were needed**

---

### Task 18: End-to-End Type Check and Smoke Test

**Files:**
- All files from tasks 1-17

- [ ] **Step 1: Run full type check**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Push DB schema**

```bash
npx drizzle-kit push
```

- [ ] **Step 3: Start dev server and test flows**

```bash
npm run dev
```

Test manually:
1. Visit `/` → should redirect to `/setup` (first time) or `/auth`
2. Enter PIN on `/setup` → redirects to `/auth?setup=1`
3. Click Google/GitHub → OAuth flow → redirected to `/`
4. Create a project → appears in project switcher
5. Open Members → invite an email → check Resend dashboard for email delivery
6. Open a private browser → click invite link → login → verify added to project

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete auth and invite system integration"
```

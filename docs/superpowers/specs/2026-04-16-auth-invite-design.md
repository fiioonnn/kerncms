# Auth & Invite System Design

## Overview

Global authentication with Google/GitHub OAuth via Better Auth, project-scoped roles (admin/editor/viewer), email invites via Resend, and self-service account management. SQLite + Drizzle remains the database layer.

---

## Data Model

### Better Auth Managed Tables

Better Auth auto-creates these with its Drizzle adapter:

- **`user`** — `id`, `name`, `email`, `emailVerified`, `image`, `createdAt`, `updatedAt`
- **`session`** — `id`, `userId`, `token`, `expiresAt`, `ipAddress`, `userAgent`, `createdAt`, `updatedAt`
- **`account`** — `id`, `userId`, `providerId` (google/github), `providerAccountId`, `accessToken`, `refreshToken`, `expiresAt`, `createdAt`, `updatedAt`
- **`verification`** — `id`, `identifier`, `value`, `expiresAt`, `createdAt`, `updatedAt`

### Application Tables

```sql
-- Projects (moved from client state to DB)
projects
  id          TEXT PRIMARY KEY (nanoid)
  name        TEXT NOT NULL
  color       TEXT NOT NULL DEFAULT '#3b82f6'
  url         TEXT
  repo        TEXT
  branch      TEXT
  createdBy   TEXT NOT NULL REFERENCES user(id)
  createdAt   INTEGER NOT NULL DEFAULT (unixepoch())

-- Project membership with roles
project_members
  id          TEXT PRIMARY KEY (nanoid)
  projectId   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  userId      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
  role        TEXT NOT NULL CHECK(role IN ('admin', 'editor', 'viewer'))
  joinedAt    INTEGER NOT NULL DEFAULT (unixepoch())
  UNIQUE(projectId, userId)

-- Pending invitations
invitations
  id          TEXT PRIMARY KEY (nanoid)
  projectId   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  email       TEXT NOT NULL
  role        TEXT NOT NULL CHECK(role IN ('admin', 'editor', 'viewer'))
  token       TEXT NOT NULL UNIQUE
  invitedBy   TEXT NOT NULL REFERENCES user(id)
  expiresAt   INTEGER NOT NULL
  createdAt   INTEGER NOT NULL DEFAULT (unixepoch())
  UNIQUE(projectId, email)

-- System-level flag (single row)
system_config
  key         TEXT PRIMARY KEY
  value       TEXT NOT NULL
```

`system_config` stores `setup_complete = "true"` after the first admin is created.

---

## Auth Setup

### Better Auth Configuration

File: `src/lib/auth.ts`

```
- Database: Drizzle adapter with SQLite
- Providers: Google, GitHub
- Session: Cookie-based (default Better Auth behavior)
- Base path: /api/auth
```

### Environment Variables

```env
BETTER_AUTH_SECRET=<random-secret>
GOOGLE_CLIENT_ID=<from-google-console>
GOOGLE_CLIENT_SECRET=<from-google-console>
GITHUB_CLIENT_ID=<from-github-settings>
GITHUB_CLIENT_SECRET=<from-github-settings>
RESEND_API_KEY=<resend-api-key>
ADMIN_PIN=123456
```

### Auth API Route

File: `src/app/api/auth/[...all]/route.ts`

Catch-all route that delegates to Better Auth handler. Handles all OAuth callbacks, session management, sign-in/sign-out.

### Auth Client

File: `src/lib/auth-client.ts`

Better Auth client instance for use in React components. Provides `signIn`, `signOut`, `useSession` hooks.

---

## Flows

### 1. Initial Setup

1. First visit → middleware detects `setup_complete` is not set → redirects to `/setup`
2. User enters admin PIN (validated against `ADMIN_PIN` env var)
3. PIN correct → sets `setup_pin_verified` cookie → redirects to `/auth`
4. User clicks Google or GitHub → OAuth flow → account created
5. Post-login hook checks `setup_pin_verified` cookie:
   - Creates user as system admin
   - Sets `system_config.setup_complete = "true"`
   - Clears the PIN cookie
   - Redirects to `/` (dashboard, which prompts project creation)
6. Subsequent visits to `/setup` redirect to `/auth` if setup is already complete

### 2. Normal Login

1. User visits any `/(dashboard)` route
2. Middleware checks session → no session → redirect to `/auth`
3. User clicks Google or GitHub → OAuth → session cookie set
4. Redirect to `/` → ProjectProvider loads user's projects from DB

### 3. Invite Flow

1. Admin opens Profile Dialog → Invite section → enters email + role
2. `POST /api/invites` → creates invitation row → sends email via Resend
3. Recipient gets email with link: `{APP_URL}/auth?invite={token}`
4. Recipient clicks link → `/auth` page stores token in `invite_token` cookie → shows login buttons
5. User logs in with Google/GitHub → post-login hook:
   - Checks `invite_token` cookie
   - Validates token (exists, not expired, not already used)
   - Creates `project_members` row with invited role
   - Deletes invitation row
   - Clears cookie
   - Redirects to the project dashboard
6. If user already has an account, same flow — just adds them to the new project

### 4. Account Deletion (Self-Service)

1. User clicks "Delete Account" in Profile Dialog
2. Confirmation dialog
3. `DELETE /api/account` → removes user from all `project_members` → deletes `session`, `account`, `user` rows
4. Session cleared → redirect to `/auth`

### 5. Leave Project

1. User clicks "Leave Project" in Profile Dialog or Settings
2. `POST /api/projects/{id}/leave` → removes `project_members` row
3. If user was last admin: block the action (project needs at least one admin)
4. Redirect to `/` → shows remaining projects or empty state

---

## API Routes

### Auth (Better Auth managed)
- `ALL /api/auth/*` — Better Auth catch-all handler

### Invites
- `POST /api/invites` — Create invite + send email. Body: `{ projectId, email, role }`. Auth: admin only.
- `DELETE /api/invites/[id]` — Delete pending invite. Auth: admin of that project.
- `POST /api/invites/accept` — Called post-login to redeem invite cookie. Auth: authenticated user.

### Members
- `PATCH /api/members/[id]` — Update role. Body: `{ role }`. Auth: admin of that project.
- `DELETE /api/members/[id]` — Remove user from project. Auth: admin of that project, or self.

### Projects
- `POST /api/projects` — Create project. Auth: any authenticated user. Creator becomes admin.
- `PATCH /api/projects/[id]` — Update project. Auth: admin of that project.
- `DELETE /api/projects/[id]` — Delete project. Auth: admin of that project.
- `POST /api/projects/[id]/leave` — Leave project. Auth: member of that project. Blocked if last admin.

### Account
- `DELETE /api/account` — Delete own account + all memberships. Auth: authenticated user.

---

## Middleware

File: `src/middleware.ts`

```
Protected: /(dashboard)/* and /api/* (except /api/auth/*)
Unprotected: /auth, /setup, /api/auth/*

Logic:
1. If setup not complete → redirect to /setup (except /setup and /api/setup)
2. If no session → redirect to /auth
3. Otherwise → pass through
```

Setup-complete check: query `system_config` or cache the flag in a cookie after first check to avoid DB hits on every request.

---

## Email Template

File: `src/emails/invite.tsx`

React component (compatible with Resend's React email rendering). Design matches the app: dark background, minimal, clean typography.

Content:
- App logo at top
- "You've been invited to {projectName}"
- Invited by {inviterName} as {role}
- Large "Accept Invite" CTA button linking to `/auth?invite={token}`
- Small footer: "This invite expires in 7 days"

---

## Permissions Matrix

| Action | Admin | Editor | Viewer |
|---|---|---|---|
| View dashboard | Yes | Yes | Yes |
| Edit content | Yes | Yes | No |
| Manage media (upload/delete/crop) | Yes | Yes | View only |
| Edit project settings | Yes | No | No |
| Invite users | Yes | No | No |
| Change user roles | Yes | No | No |
| Remove users | Yes | No | No |
| Delete project | Yes | No | No |
| Delete own account | Yes | Yes | Yes |
| Leave project | Yes | Yes | Yes |

Enforcement: API routes check role via `project_members` lookup. Frontend hides UI elements based on role from session context.

---

## Component Changes

### ProjectProvider (`project-context.tsx`)
- Fetch projects from DB instead of client state
- Include current user's role per project
- Expose `role` in context for permission checks

### ProfileDialog (`profile-dialog.tsx`)
- Wire invite form to `POST /api/invites`
- Wire members list to real data from `project_members`
- Wire role changes to `PATCH /api/members/[id]`
- Wire remove to `DELETE /api/members/[id]`
- Add "Leave Project" action
- Add "Delete Account" action with confirmation

### Auth Page (`/auth/page.tsx`)
- Wire Google/GitHub buttons to Better Auth signIn
- Read `invite` query param → store as cookie
- Show "You've been invited to {project}" message when invite param present

### Setup Page (`/setup/page.tsx`)
- After PIN validation → redirect to `/auth` (instead of dashboard)
- Set `setup_pin_verified` cookie

### Topbar / Layout
- Show current user avatar/name from session
- Wrap dashboard in auth check

---

## File Structure (new/changed files)

```
src/
  lib/
    auth.ts              — Better Auth server config
    auth-client.ts       — Better Auth client
  db/
    schema.ts            — Add projects, project_members, invitations, system_config tables
  emails/
    invite.tsx           — Resend email template (React)
  app/
    api/
      auth/[...all]/route.ts  — Better Auth catch-all
      invites/route.ts         — POST (create invite)
      invites/[id]/route.ts    — DELETE (remove invite)
      invites/accept/route.ts  — POST (redeem invite)
      members/[id]/route.ts    — PATCH (role), DELETE (remove)
      projects/route.ts        — POST (create)
      projects/[id]/route.ts   — PATCH, DELETE
      projects/[id]/leave/route.ts — POST (leave)
      account/route.ts         — DELETE (self-delete)
    auth/page.tsx              — Updated with Better Auth
    setup/page.tsx             — Updated redirect flow
  middleware.ts                — New: session + setup checks
  components/
    project-context.tsx        — Fetch from DB, expose role
    profile-dialog.tsx         — Wire to APIs
```

---

## Edge Cases

- **Invite for existing user**: User already has account but not in project → login → auto-added to project.
- **Invite for existing member**: API rejects with error (already a member).
- **Last admin leaves**: Blocked — must transfer admin role first.
- **Expired invite**: Show "invite expired" message on auth page, don't create membership.
- **Duplicate invite email**: UNIQUE constraint on `(projectId, email)` — API returns error, UI shows message.
- **Account deletion with active projects**: User is removed from all projects. If they were last admin of any project, block deletion until they transfer ownership.
- **OAuth account linking**: If same email logs in with Google then later with GitHub, Better Auth handles account linking by default.

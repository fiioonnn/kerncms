# GitHub App Setup Flow — Design Spec

## Goal

Allow users to create and install a GitHub App directly from the Kern UI without manually visiting GitHub settings or copy-pasting keys. The setup lives in the profile dialog's Integrations section (admin-only, instance-wide).

## What Changes

- `IntegrationsSection` in `src/components/profile-dialog.tsx` — replace stub with real GitHub card + setup modal
- New DB table `github_app_config` for encrypted credential storage
- New API routes under `/api/github-app/` for the manifest flow
- `src/lib/github.ts` `getOctokit()` reads credentials from DB first, env vars as fallback
- New `src/lib/github-app-config.ts` for config resolution

## What Stays the Same

- OAuth login (`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` in env vars) — unchanged
- All existing GitHub API routes (`/api/github/*`) — they just get Octokit from the new config source
- Draft, content, media flows — no changes
- `CRYPTO_KEY` must already be set (existing requirement for AI settings)

## Requires

- `NEXT_PUBLIC_APP_URL` env var for redirect URLs in the GitHub App manifest

---

## Database

### Table: `github_app_config`

Single-row table, instance-wide (not per-project).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | Always `"default"` |
| app_id | text | GitHub App ID |
| app_name | text | Display name |
| app_slug | text | URL slug on GitHub |
| private_key | text | Encrypted (AES-256-GCM via `crypto.ts`) |
| client_id | text | Plain text |
| client_secret | text | Encrypted |
| webhook_secret | text | Encrypted |
| installation_id | text | Set after installation step |
| installed_on | text | e.g. `"@fiioonnn"` or org name |
| created_at | text | ISO timestamp |
| updated_at | text | ISO timestamp |

---

## Config Resolution

`src/lib/github-app-config.ts`:

```
getGitHubAppConfig():
  1. Query github_app_config table for row id="default"
  2. If found → decrypt private_key, client_secret, webhook_secret → return
  3. If not found → fall back to process.env.GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY
  4. If neither → return null
```

`src/lib/github.ts` `getOctokit()` calls `getGitHubAppConfig()` instead of reading `process.env` directly.

---

## API Routes

### `GET /api/github-app/status`

Returns current GitHub App configuration status. Admin-only.

Response when configured:
```json
{
  "configured": true,
  "app_id": "123456",
  "app_name": "Kern CMS",
  "app_slug": "kern-cms",
  "installed_on": "@fiioonnn",
  "installation_id": "789"
}
```

Response when not configured:
```json
{
  "configured": false
}
```

### `GET /api/github-app/setup`

Query params: `name`, `target` ("user" | "org"), `org` (optional).

1. Build GitHub App manifest with permissions (contents: write, metadata: read, pull_requests: write)
2. Generate CSRF state token, store in a cookie
3. Render an auto-submit HTML form that POSTs the manifest to GitHub:
   - User target: `https://github.com/settings/apps/new?state={state}`
   - Org target: `https://github.com/organizations/{org}/settings/apps/new?state={state}`
4. `redirect_url` in manifest points to `/api/github-app/callback`

### `GET /api/github-app/callback`

Query params: `code`, `state`.

1. Validate `state` against stored cookie (CSRF check)
2. Exchange `code` for app credentials via `POST https://api.github.com/app-manifests/{code}/conversions`
3. Encrypt sensitive fields (`pem`, `client_secret`, `webhook_secret`)
4. Upsert into `github_app_config` table
5. Write `kern-github-setup-step=created` to the response page's inline script (sets localStorage)
6. Render a simple page: "App created! You can close this tab." with auto-close attempt (`window.close()`)

### `GET /api/github-app/install-url`

Query params: `target`, `org` (optional).

Returns the installation URL:
- User: `https://github.com/apps/{slug}/installations/new`
- Org: `https://github.com/organizations/{org}/settings/installations`

Response: `{ "url": "https://..." }`

### `GET /api/github-app/installation/callback`

Query params: `installation_id`.

1. Save `installation_id` to the `github_app_config` row
2. Fetch installation details to determine `installed_on`
3. Write `kern-github-setup-step=done` via inline script (sets localStorage)
4. Render a simple page: "Installation complete! You can close this tab." with auto-close attempt

---

## UI: IntegrationsSection

Lives in `src/components/profile-dialog.tsx`, admin-only.

### State A — Not Configured

Card shows:
- Red dot + "Not configured"
- Description text
- "Setup GitHub App" button → opens setup modal

### State B — Configured

Card shows:
- Green dot + "Connected"
- App name, App ID, installed account
- "Reconfigure" button → opens modal from step 1 (new app, overwrites old)
- "Reinstall" button → opens modal at step 2 (same app, new installation)

---

## UI: Setup Modal (3 Steps)

Stepper header: ① Create → ② Install → ③ Done

### Step 1: Create GitHub App

- Text input for app name (default: "Kern CMS")
- Radio: "My Account" vs "Organisation" (with org name input)
- Permission summary (read-only list): Contents R/W, Metadata R, Pull Requests R/W
- "Create on GitHub →" button
- On click: opens `/api/github-app/setup?name=...&target=...&org=...` in new tab
- Modal shows waiting state: spinner + "Waiting for you to confirm on GitHub" + "Open GitHub again" link
- When callback redirects back with `?github_setup=created`, modal auto-advances to step 2

### Step 2: Install GitHub App

- Success banner: "App created successfully!"
- "Install on GitHub →" button
- On click: opens install URL in new tab (from `/api/github-app/install-url`)
- Modal shows waiting state similar to step 1
- When installation callback redirects back with `?github_setup=done`, modal auto-advances to step 3

### Step 3: Done

- Checkmark list: App created, Installed on account, Credentials saved
- Summary card with app name, ID, installed account
- "Done" button closes modal and refreshes status

---

## Detection of GitHub Redirect

The modal needs to detect when GitHub redirects back (the callback routes redirect to `/settings?github_setup=created|done`). Since the profile dialog reads from search params or a shared state:

- Callback routes redirect to the settings page with a query parameter
- The `IntegrationsSection` component watches for `github_setup` in the URL search params (or via a polling approach on `/api/github-app/status`)
- When detected, advance the modal step and clear the query param

Alternative: Use `BroadcastChannel` or `localStorage` event to signal the modal from the callback page without needing to be on the settings page. This is more robust since the user might have the modal open on any page.

**Chosen approach:** The callback routes write a flag to `localStorage` (`kern-github-setup-step`). The modal polls `localStorage` every 2 seconds while in waiting state. When the flag changes, the modal advances. This works regardless of which page the callback lands on.

---

## Error Handling

| Error | Behavior |
|-------|----------|
| GitHub unreachable | Error message in modal: "Could not connect to GitHub. Check your connection." |
| Code expired | "Setup expired. Please start over." + "Start Over" button |
| App name taken | "App name already taken. Please choose a different name." → back to step 1 |
| State mismatch (CSRF) | "Invalid request. Please start over." → close modal |
| `NEXT_PUBLIC_APP_URL` not set | Setup button disabled with tooltip: "Set NEXT_PUBLIC_APP_URL to enable GitHub App setup" |
| `CRYPTO_KEY` not set | Encrypt will throw at save time → show "Encryption key not configured" error |

---

## Migration Path

Existing deployments using env vars (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`) continue to work via the fallback in `getGitHubAppConfig()`. No action required. Once they use the UI setup flow, credentials move to DB and env vars become unnecessary (but still respected as fallback).

---

## Files to Create/Modify

### New Files
- `src/db/schema.ts` — add `githubAppConfig` table
- `src/lib/github-app-config.ts` — config resolution (DB → env fallback)
- `src/app/api/github-app/status/route.ts`
- `src/app/api/github-app/setup/route.ts`
- `src/app/api/github-app/callback/route.ts`
- `src/app/api/github-app/install-url/route.ts`
- `src/app/api/github-app/installation/callback/route.ts`

### Modified Files
- `src/components/profile-dialog.tsx` — replace `IntegrationsSection` stub with real implementation + setup modal
- `src/lib/github.ts` — `getOctokit()` uses `getGitHubAppConfig()` instead of `process.env`
- DB migration (if using Drizzle migrations) or push schema

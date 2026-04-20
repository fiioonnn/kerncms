# Multi-Bucket Media Storage

## Overview

Add support for multiple media storage backends per project: GitHub (default), AWS S3, and Cloudflare R2. Users can configure buckets in project settings and switch between them in the media UI.

## Architecture

### Bucket Adapter Pattern

A unified `MediaAdapter` interface with three implementations:

```
MediaAdapter
├── GitHubAdapter   — local filesystem + background sync (existing behavior)
├── S3Adapter       — direct AWS S3 operations via @aws-sdk/client-s3
└── R2Adapter       — Cloudflare R2 via S3-compatible API (same SDK, different endpoint)
```

Each adapter implements:
- `list(folder: string)` — list files/folders
- `upload(folder: string, files: { name: string, content: Buffer }[])` — upload files
- `delete(paths: string[])` — delete files/folders
- `rename(item: string, newName: string)` — rename file/folder
- `move(items: string[], destination: string)` — move files
- `mkdir(folder: string, name: string)` — create folder
- `getFileUrl(path: string)` — get public URL for a file
- `serve(path: string)` — serve file content (for GitHub adapter only, S3/R2 use public URLs)

### Data Flow

- **GitHub bucket**: Unchanged — local filesystem operations + background sync to repo. URLs are relative: `/kern/media/{path}`
- **S3 bucket**: Direct SDK calls to AWS. URLs are public: `https://{bucket}.s3.{region}.amazonaws.com/{key}`
- **R2 bucket**: Direct SDK calls via S3-compatible endpoint. URLs use the configured public URL domain
- When a user selects an image from a cloud bucket in the content editor, the **full public URL** is stored in the JSON, not a relative path

### Database

New `media_buckets` table:

| Column | Type | Description |
|--------|------|-------------|
| id | text (UUID) | Primary key |
| projectId | text (FK) | References projects.id, cascade delete |
| name | text | Display name (e.g. "Production Assets") |
| provider | text enum | "github" / "aws" / "cloudflare" |
| config | text (JSON) | Provider-specific config (see below) |
| isDefault | boolean | Whether this is the default bucket for the project |
| createdAt | timestamp | Creation time |

Unique constraint: one default per project.

**Config JSON by provider:**

GitHub:
```json
{}
```
No extra config needed — uses project's repo/branch/publicDir.

AWS S3:
```json
{
  "region": "eu-central-1",
  "bucket": "my-media-bucket",
  "accessKeyId": "AKIA...",
  "secretAccessKey": "...",
  "prefix": "media/"
}
```

Cloudflare R2:
```json
{
  "accountId": "abc123",
  "bucket": "my-media",
  "accessKeyId": "...",
  "secretAccessKey": "...",
  "publicUrl": "https://media.example.com",
  "prefix": "media/"
}
```

### API Routes

**Bucket CRUD** — `src/app/api/projects/[id]/buckets/`:

- `GET /api/projects/[id]/buckets` — list buckets for project
- `POST /api/projects/[id]/buckets` — create bucket
- `PATCH /api/projects/[id]/buckets/[bucketId]` — update bucket
- `DELETE /api/projects/[id]/buckets/[bucketId]` — delete bucket (cannot delete default GitHub bucket)
- `POST /api/projects/[id]/buckets/[bucketId]/test` — test connection

**Media routes** — existing `/api/media` routes gain a `bucketId` parameter:

- GET: `?bucketId=xxx&folder=...`
- POST: FormData includes `bucketId`
- PATCH: body includes `bucketId`
- DELETE: body includes `bucketId`
- POST /folder: body includes `bucketId`

When `bucketId` is omitted or points to the GitHub bucket, existing local+sync behavior is used. When it points to an S3/R2 bucket, the adapter handles it directly.

### Adapter Implementation

**File: `src/lib/media-adapters.ts`**

```typescript
interface MediaAdapter {
  list(folder: string): Promise<MediaFile[]>
  upload(folder: string, files: { name: string; content: Buffer }[]): Promise<void>
  delete(paths: string[]): Promise<void>
  rename(item: string, newName: string): Promise<void>
  move(items: string[], destination: string): Promise<void>
  mkdir(folder: string, name: string): Promise<void>
  getFileUrl(path: string): string
}
```

**GitHubAdapter**: Wraps existing local filesystem code from `media/route.ts`. No changes to sync logic.

**S3Adapter / R2Adapter**: Both use `@aws-sdk/client-s3` with different endpoints:
- S3: `https://s3.{region}.amazonaws.com`
- R2: `https://{accountId}.r2.cloudflarestorage.com`

Folder simulation via prefix (S3/R2 don't have real folders). `mkdir` creates a `{prefix}/.gitkeep` object. `list` uses `ListObjectsV2Command` with delimiter `/`.

### Auto-Created GitHub Bucket

When a project completes onboarding, a GitHub bucket is automatically created with `isDefault: true`. This ensures backwards compatibility — existing projects work without any migration.

### UI Changes

**Media page header** (`src/app/(dashboard)/media/page.tsx`):
- Add a bucket selector dropdown to the left side of the header (next to the title/breadcrumbs)
- Shows provider icon (GitHub/AWS/Cloudflare octicons) + bucket name
- Switching buckets reloads the file list from the selected adapter
- Default bucket is pre-selected

**Media picker dialog** (`src/components/media-picker-dialog.tsx`):
- Same bucket selector dropdown in the dialog header
- Selected bucket determines where uploads go and what files are listed

**Settings page** (`src/app/(dashboard)/settings/page.tsx`):
- Connect existing `AddBucketDialog` and `BucketDetailDialog` to the new API routes
- Replace in-memory state with fetch calls

### What Does NOT Change

- Local GitHub sync logic (pull/sync endpoints)
- Content editor ImageField component
- Media preview dialog / crop / compress / effects
- Drag & drop within a bucket
- Context menu entries

## Dependencies

- `@aws-sdk/client-s3` — for S3 and R2 operations

## File Changes Summary

| File | Action |
|------|--------|
| `src/db/schema.ts` | Add `mediaBuckets` table |
| `src/lib/media-adapters.ts` | New: adapter interface + S3/R2/GitHub implementations |
| `src/app/api/projects/[id]/buckets/route.ts` | New: bucket CRUD (GET, POST) |
| `src/app/api/projects/[id]/buckets/[bucketId]/route.ts` | New: bucket update/delete (PATCH, DELETE) |
| `src/app/api/projects/[id]/buckets/[bucketId]/test/route.ts` | New: test connection |
| `src/app/api/media/route.ts` | Modify: route to adapter based on bucketId |
| `src/app/api/media/folder/route.ts` | Modify: route to adapter |
| `src/app/api/media/file/route.ts` | Modify: route to adapter (GitHub only, S3/R2 use public URLs) |
| `src/app/(dashboard)/media/page.tsx` | Modify: add bucket selector |
| `src/components/media-picker-dialog.tsx` | Modify: add bucket selector |
| `src/app/(dashboard)/settings/page.tsx` | Modify: connect to bucket API |
| `src/components/onboarding-wizard.tsx` | Modify: create default GitHub bucket on project setup |

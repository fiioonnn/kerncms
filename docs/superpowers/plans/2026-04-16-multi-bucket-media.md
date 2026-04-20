# Multi-Bucket Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AWS S3 and Cloudflare R2 bucket support alongside existing GitHub media storage, with per-project bucket configuration and a bucket selector in the media UI.

**Architecture:** A `MediaAdapter` interface with three implementations (GitHub, S3, R2). Media API routes resolve the adapter from a `bucketId` parameter. Bucket configs stored in a new `media_buckets` DB table. S3 and R2 both use `@aws-sdk/client-s3` (R2 is S3-compatible). GitHub adapter wraps existing local+sync logic.

**Tech Stack:** `@aws-sdk/client-s3`, Drizzle ORM (SQLite), Next.js Route Handlers, React

**Spec:** `docs/superpowers/specs/2026-04-16-multi-bucket-media-design.md`

---

### Task 1: Install AWS SDK dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @aws-sdk/client-s3**

```bash
npm install @aws-sdk/client-s3
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('@aws-sdk/client-s3'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @aws-sdk/client-s3 dependency"
```

---

### Task 2: Add `mediaBuckets` table to DB schema

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add the `mediaBuckets` table definition**

Add after the `mediaSyncQueue` table:

```typescript
export const mediaBuckets = sqliteTable("media_buckets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  provider: text("provider", { enum: ["github", "aws", "cloudflare"] }).notNull(),
  config: text("config").notNull().default("{}"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

- [ ] **Step 2: Push schema**

```bash
npx drizzle-kit push
```

Expected: `Changes applied`

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add mediaBuckets table"
```

---

### Task 3: Create media adapter interface and implementations

**Files:**
- Create: `src/lib/media-adapters.ts`

- [ ] **Step 1: Create the adapter file with interface and all three implementations**

```typescript
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";
import { MEDIA_ROOT, queueSync } from "@/lib/media-local";

export type MediaFile = {
  id: string;
  name: string;
  type: string;
  size: string;
  dimensions: string;
  url: string;
  uploadedAt: string;
  alt: string;
  isFolder: boolean;
};

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".bmp": "image/bmp", ".pdf": "application/pdf",
};

function formatSize(bytes: number) {
  return bytes > 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;
}

function mimeFromName(name: string) {
  return MIME_MAP[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}

// ── Interface ──────────────────────────────────────────────

export interface MediaAdapter {
  list(folder: string): Promise<{ files: MediaFile[]; rootExists: boolean }>;
  upload(folder: string, files: { name: string; content: Buffer }[]): Promise<void>;
  delete(paths: string[]): Promise<void>;
  rename(item: string, newName: string): Promise<void>;
  move(items: string[], destination: string): Promise<void>;
  mkdir(folder: string, name: string): Promise<void>;
  getFileUrl(filePath: string): string;
  serveFile?(filePath: string): Promise<{ buffer: Buffer; contentType: string } | null>;
}

// ── GitHub Adapter (local filesystem + sync) ───────────────

export class GitHubAdapter implements MediaAdapter {
  constructor(private projectId: string) {}

  async list(folder: string) {
    if (!fs.existsSync(MEDIA_ROOT)) {
      return { files: [], rootExists: false };
    }
    const targetDir = path.join(MEDIA_ROOT, folder);
    if (!targetDir.startsWith(MEDIA_ROOT) || !fs.existsSync(targetDir)) {
      return { files: [], rootExists: fs.existsSync(MEDIA_ROOT) };
    }
    const entries = fs.readdirSync(targetDir);
    const files: MediaFile[] = entries
      .filter((e) => !e.startsWith("."))
      .map((e) => {
        const full = path.join(targetDir, e);
        const stat = fs.statSync(full);
        const rel = path.relative(MEDIA_ROOT, full);
        const name = path.basename(full);
        if (stat.isDirectory()) {
          const children = fs.readdirSync(full).filter((c) => !c.startsWith("."));
          return { id: rel, name, type: "folder", size: `${children.length} item${children.length === 1 ? "" : "s"}`, dimensions: "", url: "", uploadedAt: stat.mtime.toISOString().slice(0, 10), alt: name, isFolder: true };
        }
        return { id: rel, name, type: mimeFromName(name), size: formatSize(stat.size), dimensions: "", url: `/kern/media/${rel}`, uploadedAt: stat.mtime.toISOString().slice(0, 10), alt: name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "), isFolder: false };
      })
      .sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      });
    return { files, rootExists: true };
  }

  async upload(folder: string, files: { name: string; content: Buffer }[]) {
    const targetDir = path.join(MEDIA_ROOT, folder);
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of files) {
      fs.writeFileSync(path.join(targetDir, file.name), file.content);
      const rel = folder ? `${folder}/${file.name}` : file.name;
      queueSync(this.projectId, "upload", rel);
    }
  }

  async delete(paths: string[]) {
    for (const p of paths) {
      const full = path.join(MEDIA_ROOT, p);
      if (!full.startsWith(MEDIA_ROOT) || !fs.existsSync(full)) continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
      else fs.unlinkSync(full);
      queueSync(this.projectId, "delete", p);
    }
  }

  async rename(item: string, newName: string) {
    const src = path.join(MEDIA_ROOT, item);
    if (!src.startsWith(MEDIA_ROOT) || !fs.existsSync(src)) return;
    const dest = path.join(path.dirname(src), newName);
    if (src !== dest) fs.renameSync(src, dest);
    queueSync(this.projectId, "rename", item, { newName });
  }

  async move(items: string[], destination: string) {
    const destDir = path.join(MEDIA_ROOT, destination);
    for (const item of items) {
      const src = path.join(MEDIA_ROOT, item);
      if (!src.startsWith(MEDIA_ROOT) || !fs.existsSync(src)) continue;
      const dest = path.join(destDir, path.basename(item));
      if (src !== dest) fs.renameSync(src, dest);
      queueSync(this.projectId, "move", item, { destination });
    }
  }

  async mkdir(folder: string, name: string) {
    const dir = path.join(MEDIA_ROOT, folder, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".gitkeep"), "");
    const rel = folder ? `${folder}/${name}` : name;
    queueSync(this.projectId, "mkdir", rel);
  }

  getFileUrl(filePath: string) {
    return `/kern/media/${filePath}`;
  }

  async serveFile(filePath: string) {
    const full = path.join(MEDIA_ROOT, filePath);
    if (!full.startsWith(MEDIA_ROOT) || !fs.existsSync(full)) return null;
    return { buffer: fs.readFileSync(full), contentType: mimeFromName(filePath) };
  }
}

// ── S3 Adapter (AWS S3 + Cloudflare R2) ────────────────────

type S3Config = {
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  publicUrl?: string;
  prefix?: string;
};

export class S3Adapter implements MediaAdapter {
  private client: S3Client;
  private bucket: string;
  private prefix: string;
  private publicBase: string;

  constructor(private config: S3Config) {
    this.client = new S3Client({
      region: config.region ?? "auto",
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
    });
    this.bucket = config.bucket;
    this.prefix = config.prefix ? config.prefix.replace(/\/$/, "") + "/" : "";
    // Public URL base
    if (config.publicUrl) {
      this.publicBase = config.publicUrl.replace(/\/$/, "");
    } else if (config.endpoint) {
      this.publicBase = `${config.endpoint}/${config.bucket}`;
    } else {
      this.publicBase = `https://${config.bucket}.s3.${config.region ?? "us-east-1"}.amazonaws.com`;
    }
  }

  private key(rel: string) {
    return `${this.prefix}${rel}`;
  }

  async list(folder: string) {
    const prefix = folder ? `${this.prefix}${folder}/` : this.prefix;
    try {
      const res = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        Delimiter: "/",
      }));

      const files: MediaFile[] = [];

      // Folders (common prefixes)
      for (const cp of res.CommonPrefixes ?? []) {
        if (!cp.Prefix) continue;
        const name = cp.Prefix.slice(prefix.length).replace(/\/$/, "");
        if (!name || name.startsWith(".")) continue;
        const rel = folder ? `${folder}/${name}` : name;
        files.push({ id: rel, name, type: "folder", size: "", dimensions: "", url: "", uploadedAt: "", alt: name, isFolder: true });
      }

      // Files
      for (const obj of res.Contents ?? []) {
        if (!obj.Key) continue;
        const name = obj.Key.slice(prefix.length);
        if (!name || name.includes("/") || name.startsWith(".")) continue;
        const rel = folder ? `${folder}/${name}` : name;
        files.push({ id: rel, name, type: mimeFromName(name), size: formatSize(obj.Size ?? 0), dimensions: "", url: `${this.publicBase}/${obj.Key}`, uploadedAt: obj.LastModified?.toISOString().slice(0, 10) ?? "", alt: name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "), isFolder: false });
      }

      files.sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      });

      return { files, rootExists: true };
    } catch {
      return { files: [], rootExists: false };
    }
  }

  async upload(folder: string, files: { name: string; content: Buffer }[]) {
    for (const file of files) {
      const key = folder ? this.key(`${folder}/${file.name}`) : this.key(file.name);
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.content,
        ContentType: mimeFromName(file.name),
      }));
    }
  }

  async delete(paths: string[]) {
    for (const p of paths) {
      // Check if it's a "folder" by listing contents
      const prefix = this.key(p) + "/";
      const res = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }));
      if (res.Contents && res.Contents.length > 0) {
        for (const obj of res.Contents) {
          if (obj.Key) await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: obj.Key }));
        }
      }
      // Also try deleting as a single file
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(p) })).catch(() => {});
    }
  }

  async rename(item: string, newName: string) {
    const oldKey = this.key(item);
    const dir = item.substring(0, item.lastIndexOf("/") + 1);
    const newKey = this.key(`${dir}${newName}`);

    // Copy + delete (S3 has no rename)
    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${oldKey}`,
      Key: newKey,
    }));
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: oldKey }));
  }

  async move(items: string[], destination: string) {
    for (const item of items) {
      const oldKey = this.key(item);
      const fileName = item.split("/").pop()!;
      const newKey = destination ? this.key(`${destination}/${fileName}`) : this.key(fileName);

      await this.client.send(new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${oldKey}`,
        Key: newKey,
      }));
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: oldKey }));
    }
  }

  async mkdir(folder: string, name: string) {
    const key = folder ? this.key(`${folder}/${name}/.gitkeep`) : this.key(`${name}/.gitkeep`);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: "",
    }));
  }

  getFileUrl(filePath: string) {
    return `${this.publicBase}/${this.key(filePath)}`;
  }
}

// ── Factory ────────────────────────────────────────────────

export function createAdapter(provider: string, projectId: string, config: string): MediaAdapter {
  if (provider === "github") {
    return new GitHubAdapter(projectId);
  }
  const parsed = JSON.parse(config) as S3Config;
  return new S3Adapter(parsed);
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit 2>&1 | grep media-adapters
```

Expected: no output (clean)

- [ ] **Step 3: Commit**

```bash
git add src/lib/media-adapters.ts
git commit -m "feat: add media adapter interface with GitHub, S3, R2 implementations"
```

---

### Task 4: Create bucket CRUD API routes

**Files:**
- Create: `src/app/api/projects/[id]/buckets/route.ts`
- Create: `src/app/api/projects/[id]/buckets/[bucketId]/route.ts`
- Create: `src/app/api/projects/[id]/buckets/[bucketId]/test/route.ts`

- [ ] **Step 1: Create the list + create route**

Create `src/app/api/projects/[id]/buckets/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { mediaBuckets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin", "editor", "viewer"]);

  const buckets = db.select().from(mediaBuckets).where(eq(mediaBuckets.projectId, id)).all();
  return NextResponse.json(buckets);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const { name, provider, config } = await request.json();

  // If this is the first bucket or explicitly default, set as default
  const existing = db.select().from(mediaBuckets).where(eq(mediaBuckets.projectId, id)).all();
  const isDefault = existing.length === 0;

  const [bucket] = db.insert(mediaBuckets).values({
    projectId: id,
    name,
    provider,
    config: JSON.stringify(config ?? {}),
    isDefault,
  }).returning().all();

  return NextResponse.json(bucket);
}
```

- [ ] **Step 2: Create the update + delete route**

Create `src/app/api/projects/[id]/buckets/[bucketId]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { mediaBuckets } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; bucketId: string }> }) {
  const session = await requireSession();
  const { id, bucketId } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.config !== undefined) updates.config = JSON.stringify(body.config);

  if (body.isDefault) {
    // Unset other defaults first
    db.update(mediaBuckets).set({ isDefault: false }).where(eq(mediaBuckets.projectId, id)).run();
    updates.isDefault = true;
  }

  db.update(mediaBuckets).set(updates).where(and(eq(mediaBuckets.id, bucketId), eq(mediaBuckets.projectId, id))).run();

  return NextResponse.json({ success: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; bucketId: string }> }) {
  const session = await requireSession();
  const { id, bucketId } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  // Prevent deleting default github bucket
  const bucket = db.select().from(mediaBuckets).where(and(eq(mediaBuckets.id, bucketId), eq(mediaBuckets.projectId, id))).get();
  if (!bucket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (bucket.provider === "github" && bucket.isDefault) {
    return NextResponse.json({ error: "Cannot delete the default GitHub bucket" }, { status: 400 });
  }

  db.delete(mediaBuckets).where(eq(mediaBuckets.id, bucketId)).run();

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create the test connection route**

Create `src/app/api/projects/[id]/buckets/[bucketId]/test/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { db } from "@/db";
import { mediaBuckets } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

export async function POST(_: Request, { params }: { params: Promise<{ id: string; bucketId: string }> }) {
  const session = await requireSession();
  const { id, bucketId } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const bucket = db.select().from(mediaBuckets).where(and(eq(mediaBuckets.id, bucketId), eq(mediaBuckets.projectId, id))).get();
  if (!bucket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (bucket.provider === "github") {
    return NextResponse.json({ ok: true });
  }

  try {
    const config = JSON.parse(bucket.config);
    const client = new S3Client({
      region: config.region ?? "auto",
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
    });

    await client.send(new ListObjectsV2Command({ Bucket: config.bucket, MaxKeys: 1 }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Connection failed";
    return NextResponse.json({ ok: false, error: message });
  }
}
```

- [ ] **Step 4: Create directories and verify**

```bash
mkdir -p src/app/api/projects/\[id\]/buckets/\[bucketId\]/test
npx tsc --noEmit 2>&1 | grep buckets
```

Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src/app/api/projects/\[id\]/buckets/
git commit -m "feat: add bucket CRUD API routes"
```

---

### Task 5: Rewrite media API routes to use adapters

**Files:**
- Modify: `src/app/api/media/route.ts`
- Modify: `src/app/api/media/file/route.ts`
- Modify: `src/app/api/media/folder/route.ts`

- [ ] **Step 1: Add a shared helper to resolve adapter from bucketId**

Create `src/lib/resolve-adapter.ts`:

```typescript
import { db } from "@/db";
import { mediaBuckets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createAdapter, type MediaAdapter } from "@/lib/media-adapters";

export function resolveAdapter(bucketId: string | null, projectId: string): MediaAdapter | null {
  if (!bucketId) {
    // Find default bucket for project
    const defaultBucket = db.select().from(mediaBuckets)
      .where(eq(mediaBuckets.projectId, projectId))
      .all()
      .find((b) => b.isDefault);
    if (!defaultBucket) return createAdapter("github", projectId, "{}");
    return createAdapter(defaultBucket.provider, projectId, defaultBucket.config);
  }

  const bucket = db.select().from(mediaBuckets).where(eq(mediaBuckets.id, bucketId)).get();
  if (!bucket) return null;
  return createAdapter(bucket.provider, bucket.projectId, bucket.config);
}
```

- [ ] **Step 2: Rewrite `src/app/api/media/route.ts`**

Replace the entire file:

```typescript
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { resolveAdapter } from "@/lib/resolve-adapter";

export async function GET(request: Request) {
  await requireSession();
  const { searchParams } = new URL(request.url);
  const folder = searchParams.get("folder") ?? "";
  const bucketId = searchParams.get("bucketId");
  const projectId = searchParams.get("projectId") ?? "";

  const adapter = resolveAdapter(bucketId, projectId);
  if (!adapter) return NextResponse.json({ files: [], folder, rootExists: false });

  const result = await adapter.list(folder);
  return NextResponse.json({ ...result, folder });
}

export async function POST(request: Request) {
  await requireSession();
  const formData = await request.formData();
  const projectId = formData.get("projectId") as string ?? "";
  const bucketId = formData.get("bucketId") as string | null;
  const folder = (formData.get("folder") as string) ?? "";
  const rawFiles = formData.getAll("files") as File[];

  if (rawFiles.length === 0) return NextResponse.json({ error: "No files" }, { status: 400 });

  const adapter = resolveAdapter(bucketId, projectId);
  if (!adapter) return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

  const files = await Promise.all(rawFiles.map(async (f) => ({
    name: f.name,
    content: Buffer.from(await f.arrayBuffer()),
  })));

  await adapter.upload(folder, files);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  await requireSession();
  const body = await request.json();
  const { projectId, bucketId } = body;

  const adapter = resolveAdapter(bucketId ?? null, projectId ?? "");
  if (!adapter) return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

  if (body.rename) {
    const sanitized = body.rename.newName.replace(/[/\\]/g, "").trim();
    if (!sanitized) return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    await adapter.rename(body.rename.item, sanitized);
    return NextResponse.json({ success: true });
  }

  if (body.items && body.destination !== undefined) {
    await adapter.move(body.items, body.destination ?? "");
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid operation" }, { status: 400 });
}

export async function DELETE(request: Request) {
  await requireSession();
  const { paths, projectId, bucketId } = await request.json();

  if (!Array.isArray(paths) || paths.length === 0) return NextResponse.json({ error: "No paths" }, { status: 400 });

  const adapter = resolveAdapter(bucketId ?? null, projectId ?? "");
  if (!adapter) return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

  await adapter.delete(paths);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Rewrite `src/app/api/media/folder/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { resolveAdapter } from "@/lib/resolve-adapter";

export async function POST(request: Request) {
  await requireSession();
  const { name, parent, projectId, bucketId } = await request.json();

  if (!name || typeof name !== "string") return NextResponse.json({ error: "Missing folder name" }, { status: 400 });
  const sanitized = name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  if (!sanitized) return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });

  const adapter = resolveAdapter(bucketId ?? null, projectId ?? "");
  if (!adapter) return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

  await adapter.mkdir(parent ?? "", sanitized);
  return NextResponse.json({ success: true, name: sanitized });
}
```

- [ ] **Step 4: Rewrite `src/app/api/media/file/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { resolveAdapter } from "@/lib/resolve-adapter";

export async function GET(request: Request) {
  await requireSession();
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get("path");
  const projectId = searchParams.get("projectId") ?? "";
  const bucketId = searchParams.get("bucketId");

  if (!filePath) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const adapter = resolveAdapter(bucketId ?? null, projectId);
  if (!adapter || !adapter.serveFile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await adapter.serveFile(filePath);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(result.buffer, {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 5: Verify all compiles**

```bash
npx tsc --noEmit 2>&1 | grep -E "media|adapter|resolve"
```

Expected: no output

- [ ] **Step 6: Commit**

```bash
git add src/lib/resolve-adapter.ts src/app/api/media/
git commit -m "feat: rewrite media routes to use adapter pattern"
```

---

### Task 6: Update frontend helpers to pass bucketId

**Files:**
- Modify: `src/app/(dashboard)/media/page.tsx`
- Modify: `src/components/media-picker-dialog.tsx`

- [ ] **Step 1: Update media page helper functions**

Change all helper function signatures to accept optional `bucketId`:

In `src/app/(dashboard)/media/page.tsx`, update the helper functions near the top of the file:

```typescript
async function fetchMedia(folder: string, projectId?: string, bucketId?: string): Promise<{ files: MediaFile[]; rootExists: boolean }> {
  const params = new URLSearchParams({ folder });
  if (projectId) params.set("projectId", projectId);
  if (bucketId) params.set("bucketId", bucketId);
  const res = await fetch(`/api/media?${params}`);
  const data = await res.json();
  return { files: data.files ?? [], rootExists: data.rootExists !== false };
}

async function uploadFiles(files: File[], folder: string, projectId: string, bucketId?: string): Promise<void> {
  const formData = new FormData();
  formData.set("folder", folder);
  formData.set("projectId", projectId);
  if (bucketId) formData.set("bucketId", bucketId);
  for (const f of files) formData.append("files", f);
  await fetch("/api/media", { method: "POST", body: formData });
}

async function deleteMedia(paths: string[], projectId: string, bucketId?: string): Promise<void> {
  await fetch("/api/media", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths, projectId, bucketId }),
  });
}

async function createFolder(name: string, parent: string, projectId: string, bucketId?: string): Promise<boolean> {
  const res = await fetch("/api/media/folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parent, projectId, bucketId }),
  });
  return res.ok;
}

async function moveMedia(items: string[], destination: string, projectId: string, bucketId?: string): Promise<boolean> {
  const res = await fetch("/api/media", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, destination, projectId, bucketId }),
  });
  return res.ok;
}

async function renameMedia(item: string, newName: string, projectId: string, bucketId?: string): Promise<boolean> {
  const res = await fetch("/api/media", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rename: { item, newName }, projectId, bucketId }),
  });
  return res.ok;
}
```

- [ ] **Step 2: Add bucket state and selector to the media page**

In the `MediaPage` component, add state for buckets and the active bucket. After the existing state declarations, add:

```typescript
const [buckets, setBuckets] = useState<{ id: string; name: string; provider: string; isDefault: boolean }[]>([]);
const [activeBucketId, setActiveBucketId] = useState<string | undefined>();

// Load buckets
useEffect(() => {
  if (!current) return;
  fetch(`/api/projects/${current.id}/buckets`)
    .then((r) => r.json())
    .then((data) => {
      setBuckets(data);
      const def = data.find((b: any) => b.isDefault);
      if (def) setActiveBucketId(def.id);
    });
}, [current]);
```

Update `loadFiles` to pass `activeBucketId`:

```typescript
const loadFiles = useCallback(async (folder: string) => {
  setLoading(true);
  setSelectedIds(new Set()); setSelectMode("none");
  try {
    const result = await fetchMedia(folder, current?.id, activeBucketId);
    setFiles(result.files);
    setMediaRootExists(result.rootExists);
  } finally { setLoading(false); }
}, [current, activeBucketId]);
```

Update all mutation calls (`handleUpload`, `handleDelete`, `handleCreateFolder`, `handleMove`, `handleRename`) to pass `activeBucketId` as the last argument.

- [ ] **Step 3: Add the bucket selector dropdown to the media page header**

In the header area (inside the `<div>` with the breadcrumbs), add a bucket selector before the breadcrumbs:

```tsx
{buckets.length > 1 && (
  <div className="relative mr-3">
    <select
      value={activeBucketId ?? ""}
      onChange={(e) => { setActiveBucketId(e.target.value); setCurrentFolder(""); }}
      className="h-8 rounded-md border border-border bg-transparent px-2 pr-7 text-sm text-foreground appearance-none cursor-pointer"
    >
      {buckets.map((b) => (
        <option key={b.id} value={b.id}>
          {b.provider === "github" ? "GitHub" : b.provider === "aws" ? "AWS" : "Cloudflare"} — {b.name}
        </option>
      ))}
    </select>
  </div>
)}
```

- [ ] **Step 4: Apply the same bucket selector to the media picker dialog**

In `src/components/media-picker-dialog.tsx`, add the same bucket loading + selector pattern inside the `MediaPickerDialog` component. Add bucket state, load buckets on open, and pass `bucketId` to all helper calls.

- [ ] **Step 5: Verify everything compiles**

```bash
npx tsc --noEmit 2>&1 | grep -v "kern/content" | grep -v "new-project"
```

Expected: no errors from media files

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/media/page.tsx src/components/media-picker-dialog.tsx
git commit -m "feat: add bucket selector to media page and picker"
```

---

### Task 7: Connect settings page to bucket API

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Update MediaSection to fetch/persist buckets via API**

Replace the in-memory `useState<Bucket[]>` with API-backed state. The `MediaSection` component needs access to `current` project from `useProjects()`.

Key changes:
- On mount: `GET /api/projects/{id}/buckets` → `setBuckets`
- `handleAdd`: `POST /api/projects/{id}/buckets` with `{ name, provider, config: { region, bucket, accessKeyId, secretAccessKey, endpoint, publicUrl } }`
- `onUpdate`: `PATCH /api/projects/{id}/buckets/{bucketId}`
- `onDelete`: `DELETE /api/projects/{id}/buckets/{bucketId}`
- `onSetDefault`: `PATCH /api/projects/{id}/buckets/{bucketId}` with `{ isDefault: true }`
- Test connection: `POST /api/projects/{id}/buckets/{bucketId}/test`

Update the `Bucket` type to include `provider: "github" | "aws" | "cloudflare"` and `config` field.

Update `AddBucketDialog` to also pass `accessKey` and `secretKey` through the `onAdd` callback (currently discarded).

Update `BucketDetailDialog` to call the real test endpoint instead of `setTimeout(Math.random)`.

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep settings
git add src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: connect bucket settings to API"
```

---

### Task 8: Auto-create GitHub bucket on project onboarding

**Files:**
- Modify: `src/components/onboarding-wizard.tsx` (or the install API)

- [ ] **Step 1: After kern install succeeds, create a default GitHub bucket**

In the `handleInstall` callback of the onboarding wizard, after the install API call succeeds, add:

```typescript
// Create default GitHub bucket
await fetch(`/api/projects/${current.id}/buckets`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "GitHub", provider: "github", config: {} }),
});
```

This ensures every project starts with a GitHub bucket as the default.

- [ ] **Step 2: Commit**

```bash
git add src/components/onboarding-wizard.tsx
git commit -m "feat: auto-create GitHub bucket on project setup"
```

---

### Task 9: Final integration verification

- [ ] **Step 1: Type check the full project**

```bash
npx tsc --noEmit
```

Fix any errors that appear.

- [ ] **Step 2: Manual test plan**

1. Create a new project → verify GitHub bucket auto-created
2. Open Media page → verify files load from GitHub bucket
3. Upload a file → verify it appears and syncs
4. Go to Settings → Add an AWS S3 bucket with real credentials
5. Go to Media → switch to S3 bucket in dropdown
6. Upload a file to S3 → verify it appears with public URL
7. Select an S3 image in the content editor → verify public URL is stored
8. Delete a file from S3 → verify it's removed

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: multi-bucket media storage with S3 and R2 support"
```

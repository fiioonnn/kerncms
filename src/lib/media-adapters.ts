import fs from "node:fs";
import path from "node:path";
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { queueSync } from "@/lib/media-local";

function dedupName(name: string, exists: (candidate: string) => boolean): string {
  if (!exists(name)) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (exists(`${base} (${i})${ext}`)) i++;
  return `${base} (${i})${ext}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MediaFile = {
  id: string;
  name: string;
  type: string;
  size: string;
  dimensions: string;
  url: string;
  contentUrl?: string;
  uploadedAt: string;
  alt: string;
  isFolder: boolean;
  previews?: string[];
};

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface MediaAdapter {
  list(folder: string): Promise<MediaFile[]>;
  upload(folder: string, files: File[]): Promise<MediaFile[]>;
  replace(existingPath: string, file: File): Promise<MediaFile>;
  delete(paths: string[]): Promise<void>;
  rename(item: string, newName: string): Promise<void>;
  move(items: string[], destination: string): Promise<void>;
  mkdir(folder: string, name: string): Promise<void>;
  getFileUrl(filePath: string): string;
  getContentUrl?(filePath: string): string;
  serveFile?(filePath: string): Promise<Response | null>;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
};

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"]);

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function mimeFromExt(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

function mimeFromMagicBytes(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  if (buf[0] === 0x42 && buf[1] === 0x4D) return "image/bmp";
  return null;
}

function altFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
}

// ---------------------------------------------------------------------------
// GitHubAdapter — local filesystem + sync queue
// ---------------------------------------------------------------------------

export interface GitHubAdapterConfig {
  mediaDir?: string;
}

export class GitHubAdapter implements MediaAdapter {
  private projectId: string;
  private bucketId: string | undefined;
  private root: string;
  private mediaDir: string;

  constructor(projectId: string, config?: GitHubAdapterConfig, bucketId?: string) {
    this.projectId = projectId;
    this.bucketId = bucketId;
    this.mediaDir = config?.mediaDir ?? "public/kern/media";
    this.root = path.join(process.cwd(), this.mediaDir, projectId);
  }

  private ensureRoot(): void {
    if (!fs.existsSync(this.root)) fs.mkdirSync(this.root, { recursive: true });
  }

  private folderPreviews(dir: string, max = 4): string[] {
    const urls: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (urls.length >= max) break;
        if (entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          urls.push(...this.folderPreviews(full, max - urls.length));
        } else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
          urls.push(this.getFileUrl(path.relative(this.root, full)));
        }
      }
    } catch { /* ignore */ }
    return urls;
  }

  private fileInfo(fullPath: string): MediaFile {
    const stat = fs.statSync(fullPath);
    const name = path.basename(fullPath);
    const rel = path.relative(this.root, fullPath);

    if (stat.isDirectory()) {
      const children = fs.readdirSync(fullPath).filter((e) => !e.startsWith("."));
      const previews = this.folderPreviews(fullPath);
      return {
        id: rel,
        name,
        type: "folder",
        size: `${children.length} item${children.length === 1 ? "" : "s"}`,
        dimensions: "",
        url: "",
        uploadedAt: stat.mtime.toISOString().slice(0, 10),
        alt: name,
        isFolder: true,
        ...(previews.length > 0 ? { previews } : {}),
      };
    }

    let type = mimeFromExt(name);
    if (type === "application/octet-stream") {
      try {
        const head = Buffer.alloc(12);
        const fd = fs.openSync(fullPath, "r");
        fs.readSync(fd, head, 0, 12, 0);
        fs.closeSync(fd);
        type = mimeFromMagicBytes(head) ?? type;
      } catch { /* ignore */ }
    }

    return {
      id: rel,
      name,
      type,
      size: formatBytes(stat.size),
      dimensions: "",
      url: `${this.getFileUrl(rel)}&v=${stat.mtimeMs | 0}`,
      contentUrl: this.getContentUrl(rel),
      uploadedAt: stat.mtime.toISOString().slice(0, 10),
      alt: altFromName(name),
      isFolder: false,
    };
  }

  getFileUrl(filePath: string): string {
    const base = `/api/media/file?path=${encodeURIComponent(filePath)}&projectId=${this.projectId}`;
    return this.bucketId ? `${base}&bucketId=${this.bucketId}` : base;
  }

  getContentUrl(filePath: string): string {
    const urlBase = this.mediaDir.startsWith("public/")
      ? this.mediaDir.slice("public".length)
      : `/${this.mediaDir}`;
    return `${urlBase}/${this.projectId}/${filePath}`;
  }

  async list(folder: string): Promise<MediaFile[]> {
    if (!fs.existsSync(this.root)) return [];

    const targetDir = path.join(this.root, folder);
    if (!targetDir.startsWith(this.root)) throw new Error("Invalid path");
    if (!fs.existsSync(targetDir)) return [];

    const entries = fs.readdirSync(targetDir);
    return entries
      .filter((e) => !e.startsWith("."))
      .map((e) => this.fileInfo(path.join(targetDir, e)))
      .sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  async upload(folder: string, files: File[]): Promise<MediaFile[]> {
    this.ensureRoot();
    const targetDir = path.join(this.root, folder);
    if (!targetDir.startsWith(this.root)) throw new Error("Invalid path");
    fs.mkdirSync(targetDir, { recursive: true });

    const uploaded: MediaFile[] = [];
    for (const file of files) {
      const finalName = dedupName(file.name, (n) => fs.existsSync(path.join(targetDir, n)));
      const bytes = await file.arrayBuffer();
      const filePath = path.join(targetDir, finalName);
      fs.writeFileSync(filePath, Buffer.from(bytes));
      uploaded.push(this.fileInfo(filePath));

      const rel = folder ? `${folder}/${finalName}` : finalName;
      queueSync(this.projectId, "upload", rel);
    }
    return uploaded;
  }

  async replace(existingPath: string, file: File): Promise<MediaFile> {
    const fullPath = path.join(this.root, existingPath);
    if (!fullPath.startsWith(this.root)) throw new Error("Invalid path");

    const bytes = await file.arrayBuffer();
    fs.writeFileSync(fullPath, Buffer.from(bytes));
    queueSync(this.projectId, "upload", existingPath);
    return this.fileInfo(fullPath);
  }

  async delete(paths: string[]): Promise<void> {
    for (const p of paths) {
      const fullPath = path.join(this.root, p);
      if (!fullPath.startsWith(this.root) || !fs.existsSync(fullPath)) continue;

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
      queueSync(this.projectId, "delete", p);
    }
  }

  async rename(item: string, newName: string): Promise<void> {
    const sanitized = newName.replace(/[/\\]/g, "").trim();
    if (!sanitized) throw new Error("Invalid name");

    const src = path.join(this.root, item);
    if (!src.startsWith(this.root) || !fs.existsSync(src)) throw new Error("Not found");

    const dest = path.join(path.dirname(src), sanitized);
    if (!dest.startsWith(this.root)) throw new Error("Invalid destination");

    if (src !== dest) fs.renameSync(src, dest);
    queueSync(this.projectId, "rename", item, { newName: sanitized });
  }

  async move(items: string[], destination: string): Promise<void> {
    const destDir = path.join(this.root, destination);
    if (!destDir.startsWith(this.root)) throw new Error("Invalid destination");

    for (const item of items) {
      const src = path.join(this.root, item);
      if (!src.startsWith(this.root) || !fs.existsSync(src)) continue;
      const dest = path.join(destDir, path.basename(item));
      if (src === dest) continue;
      fs.renameSync(src, dest);
      queueSync(this.projectId, "move", item, { destination });
    }
  }

  async mkdir(folder: string, name: string): Promise<void> {
    this.ensureRoot();
    const sanitized = name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
    if (!sanitized) throw new Error("Invalid folder name");

    const parentDir = path.join(this.root, folder);
    if (!parentDir.startsWith(this.root)) throw new Error("Invalid path");

    const folderPath = path.join(parentDir, sanitized);
    if (fs.existsSync(folderPath)) throw new Error("Folder already exists");

    fs.mkdirSync(folderPath, { recursive: true });
    fs.writeFileSync(path.join(folderPath, ".gitkeep"), "");

    const rel = folder ? `${folder}/${sanitized}` : sanitized;
    queueSync(this.projectId, "mkdir", rel);
  }

  async serveFile(filePath: string): Promise<Response | null> {
    const fullPath = path.join(this.root, filePath);
    if (!fullPath.startsWith(this.root) || !fs.existsSync(fullPath)) return null;

    const ext = path.extname(fullPath).toLowerCase();
    const buffer = fs.readFileSync(fullPath);
    const contentType = mimeFromMagicBytes(buffer) ?? MIME_MAP[ext] ?? "application/octet-stream";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  }
}

// ---------------------------------------------------------------------------
// S3Adapter — AWS S3 and Cloudflare R2 (S3-compatible)
// ---------------------------------------------------------------------------

export interface S3AdapterConfig {
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** R2 account endpoint, e.g. https://<accountid>.r2.cloudflarestorage.com */
  endpoint?: string;
  /** R2 public bucket URL, e.g. https://pub-xxx.r2.dev */
  publicUrl?: string;
  /** Optional key prefix applied to all objects */
  prefix?: string;
}

export class S3Adapter implements MediaAdapter {
  private client: S3Client;
  private bucket: string;
  private prefix: string;
  private region: string;
  private endpoint?: string;
  private publicUrl?: string;

  constructor(config: S3AdapterConfig) {
    this.bucket = config.bucket;
    this.prefix = config.prefix ?? "";
    this.region = config.region ?? "auto";
    this.publicUrl = config.publicUrl;

    // Strip bucket name from endpoint if accidentally included
    let endpoint = config.endpoint;
    if (endpoint && config.bucket) {
      endpoint = endpoint.replace(new RegExp(`/${config.bucket}/?$`), "");
    }
    this.endpoint = endpoint;

    this.client = new S3Client({
      region: config.region ?? "auto",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  }

  // Build the full S3 key for a logical relative path
  private toKey(filePath: string): string {
    return this.prefix ? `${this.prefix}/${filePath}` : filePath;
  }

  // Strip prefix from an S3 key to get the logical path
  private fromKey(key: string): string {
    if (this.prefix && key.startsWith(`${this.prefix}/`)) {
      return key.slice(this.prefix.length + 1);
    }
    return key;
  }

  getFileUrl(filePath: string): string {
    const key = this.toKey(filePath);
    if (this.publicUrl) {
      return `${this.publicUrl.replace(/\/$/, "")}/${key}`;
    }
    if (this.endpoint) {
      return `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async list(folder: string): Promise<MediaFile[]> {
    const folderKey = this.toKey(folder ? `${folder}/` : "");
    const listPrefix = folderKey;

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: listPrefix,
      Delimiter: "/",
    });

    const response = await this.client.send(command);

    const files: MediaFile[] = [];

    // CommonPrefixes are "folders"
    for (const cp of response.CommonPrefixes ?? []) {
      if (!cp.Prefix) continue;
      // Strip the trailing slash and get just the folder name segment
      const keyNoTrail = cp.Prefix.replace(/\/$/, "");
      const logicalPath = this.fromKey(keyNoTrail);
      const name = path.posix.basename(logicalPath);
      if (name.startsWith(".")) continue;

      // Fetch up to 4 image previews from the folder
      const previews: string[] = [];
      try {
        const previewRes = await this.client.send(new ListObjectsV2Command({
          Bucket: this.bucket, Prefix: cp.Prefix, MaxKeys: 20,
        }));
        for (const obj of previewRes.Contents ?? []) {
          if (previews.length >= 4) break;
          if (!obj.Key) continue;
          const fname = path.posix.basename(obj.Key);
          if (fname.startsWith(".")) continue;
          if (IMAGE_EXTS.has(path.extname(fname).toLowerCase())) {
            previews.push(this.getFileUrl(this.fromKey(obj.Key)));
          }
        }
      } catch { /* ignore */ }

      files.push({
        id: logicalPath,
        name,
        type: "folder",
        size: "",
        dimensions: "",
        url: "",
        uploadedAt: "",
        alt: name,
        isFolder: true,
        ...(previews.length > 0 ? { previews } : {}),
      });
    }

    // Contents are files
    for (const obj of response.Contents ?? []) {
      if (!obj.Key) continue;
      const logicalPath = this.fromKey(obj.Key);
      const name = path.posix.basename(logicalPath);
      if (!name || name.startsWith(".")) continue;
      // Skip the folder placeholder itself
      if (obj.Key === listPrefix) continue;

      files.push({
        id: logicalPath,
        name,
        type: mimeFromExt(name),
        size: formatBytes(obj.Size ?? 0),
        dimensions: "",
        url: obj.LastModified
          ? `${this.getFileUrl(logicalPath)}?v=${obj.LastModified.getTime()}`
          : this.getFileUrl(logicalPath),
        uploadedAt: obj.LastModified?.toISOString().slice(0, 10) ?? "",
        alt: altFromName(name),
        isFolder: false,
      });
    }

    return files.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async upload(folder: string, files: File[]): Promise<MediaFile[]> {
    const uploaded: MediaFile[] = [];

    const s3Exists = async (name: string): Promise<boolean> => {
      const lp = folder ? `${folder}/${name}` : name;
      try {
        await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.toKey(lp) }));
        return true;
      } catch { return false; }
    };

    for (const file of files) {
      const finalName = dedupName(file.name, () => false);
      // Check S3 asynchronously for actual dedup
      let resolvedName = finalName;
      if (await s3Exists(file.name)) {
        const dot = file.name.lastIndexOf(".");
        const base = dot > 0 ? file.name.slice(0, dot) : file.name;
        const ext = dot > 0 ? file.name.slice(dot) : "";
        let i = 2;
        while (await s3Exists(`${base} (${i})${ext}`)) i++;
        resolvedName = `${base} (${i})${ext}`;
      } else {
        resolvedName = file.name;
      }

      const logicalPath = folder ? `${folder}/${resolvedName}` : resolvedName;
      const key = this.toKey(logicalPath);
      const bytes = await file.arrayBuffer();

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: Buffer.from(bytes),
          ContentType: mimeFromExt(resolvedName),
        })
      );

      uploaded.push({
        id: logicalPath,
        name: resolvedName,
        type: mimeFromExt(resolvedName),
        size: formatBytes(file.size),
        dimensions: "",
        url: this.getFileUrl(logicalPath),
        uploadedAt: new Date().toISOString().slice(0, 10),
        alt: altFromName(resolvedName),
        isFolder: false,
      });
    }

    return uploaded;
  }

  async replace(existingPath: string, file: File): Promise<MediaFile> {
    const key = this.toKey(existingPath);
    const bytes = await file.arrayBuffer();
    const name = path.posix.basename(existingPath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: mimeFromExt(name),
      })
    );

    return {
      id: existingPath,
      name,
      type: mimeFromExt(name),
      size: formatBytes(file.size),
      dimensions: "",
      url: `${this.getFileUrl(existingPath)}?v=${Date.now()}`,
      uploadedAt: new Date().toISOString().slice(0, 10),
      alt: altFromName(name),
      isFolder: false,
    };
  }

  async delete(paths: string[]): Promise<void> {
    if (paths.length === 0) return;

    // For each path, gather all keys to delete (handles both files and "folders")
    const keysToDelete: string[] = [];

    for (const p of paths) {
      const key = this.toKey(p);

      // Try as a plain file first
      // Also list with the path as prefix to handle folders
      const listCmd = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: key,
      });
      const listResp = await this.client.send(listCmd);

      if (listResp.Contents && listResp.Contents.length > 0) {
        for (const obj of listResp.Contents) {
          if (obj.Key) keysToDelete.push(obj.Key);
        }
      } else {
        // Might be a single object that returned nothing via prefix; delete directly
        keysToDelete.push(key);
      }
    }

    if (keysToDelete.length === 0) return;

    // DeleteObjects accepts up to 1000 keys per call
    for (let i = 0; i < keysToDelete.length; i += 1000) {
      const batch = keysToDelete.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: true,
          },
        })
      );
    }
  }

  async rename(item: string, newName: string): Promise<void> {
    const sanitized = newName.replace(/[/\\]/g, "").trim();
    if (!sanitized) throw new Error("Invalid name");

    const dir = path.posix.dirname(item);
    const newLogicalPath = dir === "." ? sanitized : `${dir}/${sanitized}`;

    const srcKey = this.toKey(item);
    const destKey = this.toKey(newLogicalPath);

    if (srcKey === destKey) return;

    // List all keys under srcKey (handles folder rename)
    const listCmd = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: srcKey,
    });
    const listResp = await this.client.send(listCmd);
    const objects = listResp.Contents ?? [];

    if (objects.length === 0) {
      // Single object
      await this._copyAndDelete(srcKey, destKey);
      return;
    }

    for (const obj of objects) {
      if (!obj.Key) continue;
      const suffix = obj.Key.slice(srcKey.length);
      const newKey = `${destKey}${suffix}`;
      await this._copyAndDelete(obj.Key, newKey);
    }
  }

  async move(items: string[], destination: string): Promise<void> {
    for (const item of items) {
      const name = path.posix.basename(item);
      const newLogicalPath = destination ? `${destination}/${name}` : name;

      const srcKey = this.toKey(item);
      const destKey = this.toKey(newLogicalPath);

      if (srcKey === destKey) continue;

      // List all keys under srcKey (handles folder move)
      const listCmd = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: srcKey,
      });
      const listResp = await this.client.send(listCmd);
      const objects = listResp.Contents ?? [];

      if (objects.length === 0) {
        await this._copyAndDelete(srcKey, destKey);
        continue;
      }

      for (const obj of objects) {
        if (!obj.Key) continue;
        const suffix = obj.Key.slice(srcKey.length);
        const newKey = `${destKey}${suffix}`;
        await this._copyAndDelete(obj.Key, newKey);
      }
    }
  }

  async mkdir(folder: string, name: string): Promise<void> {
    const sanitized = name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
    if (!sanitized) throw new Error("Invalid folder name");

    const logicalPath = folder ? `${folder}/${sanitized}/.gitkeep` : `${sanitized}/.gitkeep`;
    const key = this.toKey(logicalPath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: "",
        ContentType: "application/octet-stream",
      })
    );
  }

  // S3 has no native rename — copy then delete
  private async _copyAndDelete(srcKey: string, destKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${srcKey}`,
        Key: destKey,
      })
    );
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: srcKey,
      })
    );
  }

  // No serveFile needed for S3 — files are served via public URLs
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAdapter(
  provider: string,
  projectId: string,
  configJson?: string,
  bucketId?: string,
): MediaAdapter {
  if (provider === "github") {
    const config = configJson ? JSON.parse(configJson) as GitHubAdapterConfig : undefined;
    return new GitHubAdapter(projectId, config, bucketId);
  }

  if (provider === "aws" || provider === "cloudflare") {
    const config = JSON.parse(configJson ?? "{}") as S3AdapterConfig;
    return new S3Adapter(config);
  }

  throw new Error(`Unknown provider: ${provider}`);
}

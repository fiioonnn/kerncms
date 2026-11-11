import "server-only";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { media, trash } from "@/db/schema";
import type { KernConfig, MediaItem } from "@/lib/kern-types";
import { S3_BUCKET, s3 } from "@/lib/s3";
import { type ChangeSet, safeJoin, slugify, statusOf } from "./content";

export const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};
const FILE_TYPES: Record<string, string> = { ...IMAGE_TYPES, ".pdf": "application/pdf", ".mp4": "video/mp4" };
export const MAX_UPLOAD = 20 * 1024 * 1024;

export function mimeOf(name: string) {
  return FILE_TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}

/** Value written into content for a media file, e.g. public/media/x.jpg → /media/x.jpg. */
export function mediaValue(config: KernConfig, name: string) {
  const dir = config.media.dir.replace(/^public\/?/, "").replace(/\/+$/, "");
  return `/${dir ? `${dir}/` : ""}${name}`;
}

/** Media file name from a stored value (/media/x.jpg → x.jpg), or null if it is not a media path. */
export function mediaNameFromValue(config: KernConfig, value: string) {
  const prefix = mediaValue(config, "");
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

const dimensionCache = new Map<string, { key: string; width: number | null; height: number | null }>();

async function dimensions(file: string, key: string) {
  const cached = dimensionCache.get(file);
  if (cached?.key === key) return cached;
  let width: number | null = null;
  let height: number | null = null;
  try {
    const meta = await sharp(file).metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
  } catch {
    // not an image sharp can read
  }
  const entry = { key, width, height };
  dimensionCache.set(file, entry);
  return entry;
}

async function contentCorpus(dir: string, config: KernConfig) {
  const roots = new Set([config.pages.path, ...config.collections.map((c) => c.path), ...config.globals.map((g) => path.posix.dirname(g.path))]);
  const files: { rel: string; text: string }[] = [];
  for (const root of roots) {
    const folder = safeJoin(dir, root);
    if (!existsSync(folder)) continue;
    for (const file of await readdir(folder)) {
      if (!/\.(json|md|mdx)$/.test(file)) continue;
      files.push({ rel: path.posix.join(root, file), text: await readFile(path.join(folder, file), "utf8") });
    }
  }
  return files;
}

export async function listMedia(siteId: string, dir: string, config: KernConfig, changes: ChangeSet): Promise<MediaItem[]> {
  const folder = safeJoin(dir, config.media.dir);
  if (!existsSync(folder)) return [];
  const [names, metaRows, corpus] = await Promise.all([
    readdir(folder),
    db.select().from(media).where(eq(media.siteId, siteId)),
    contentCorpus(dir, config),
  ]);
  const metaByName = new Map(metaRows.map((row) => [row.name, row]));
  const items = await Promise.all(
    names
      .filter((name) => !name.startsWith(".") && FILE_TYPES[path.extname(name).toLowerCase()])
      .map(async (name): Promise<MediaItem> => {
        const file = path.join(folder, name);
        const info = await stat(file);
        const dims = await dimensions(file, `${info.mtimeMs}-${info.size}`);
        const meta = metaByName.get(name);
        const value = mediaValue(config, name);
        const rel = path.posix.join(config.media.dir, name);
        return {
          name,
          src: `/api/media/${encodeURIComponent(name)}?v=${Math.round(info.mtimeMs)}`,
          value,
          size: info.size,
          width: dims.width,
          height: dims.height,
          type: mimeOf(name),
          alt: meta?.alt ?? "",
          caption: meta?.caption ?? "",
          focusX: meta?.focusX ?? 50,
          focusY: meta?.focusY ?? 50,
          tags: meta?.tags ?? [],
          usedIn: corpus.filter((c) => c.text.includes(value)).map((c) => c.rel),
          status: statusOf(changes, rel),
          updatedAt: info.mtime.toISOString(),
        };
      }),
  );
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function mediaPath(dir: string, config: KernConfig, name: string) {
  if (!name || name.includes("/") || name.includes("\\") || name.startsWith(".")) throw new Error("Ungültiger Dateiname.");
  return safeJoin(dir, path.posix.join(config.media.dir, name));
}

function cleanFileName(original: string) {
  const ext = path.extname(original).toLowerCase().replace(".jpeg", ".jpg");
  const base = slugify(path.basename(original, path.extname(original))) || "datei";
  return { base, ext };
}

export async function uniqueMediaName(dir: string, config: KernConfig, original: string) {
  const { base, ext } = cleanFileName(original);
  let name = base + ext;
  for (let i = 2; existsSync(mediaPath(dir, config, name)); i++) name = `${base}-${i}${ext}`;
  return name;
}

/** Keeps a copy of every uploaded original in S3. Failure is not fatal: git is the source of truth. */
async function backupToS3(siteId: string, name: string, body: Buffer) {
  try {
    await s3.send(
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: `sites/${siteId}/media/${Date.now()}-${name}`, Body: body, ContentType: mimeOf(name) }),
    );
    return true;
  } catch (error) {
    console.warn("[kern] S3-Sicherung fehlgeschlagen:", (error as Error).message);
    return false;
  }
}

export async function saveUpload(siteId: string, userId: string, dir: string, config: KernConfig, file: File) {
  if (file.size > MAX_UPLOAD) throw new Error(`„${file.name}“ ist größer als 20 MB.`);
  const ext = path.extname(file.name).toLowerCase();
  if (!FILE_TYPES[ext]) throw new Error(`Dateien vom Typ ${ext || "ohne Endung"} werden nicht unterstützt.`);
  const name = await uniqueMediaName(dir, config, file.name);
  let body: Buffer = Buffer.from(await file.arrayBuffer());
  // Rotate according to EXIF and drop metadata such as GPS position.
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) body = await sharp(body).rotate().toBuffer();
  const target = mediaPath(dir, config, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
  await db
    .insert(media)
    .values({ siteId, name, uploadedBy: userId, alt: "" })
    .onConflictDoNothing();
  void backupToS3(siteId, name, body);
  return name;
}

export type MediaMetaInput = { alt?: string; caption?: string; focusX?: number; focusY?: number; tags?: string[] };

export async function updateMediaMeta(siteId: string, name: string, input: MediaMetaInput) {
  const values = {
    ...(input.alt !== undefined && { alt: input.alt.trim() }),
    ...(input.caption !== undefined && { caption: input.caption.trim() }),
    ...(input.focusX !== undefined && { focusX: Math.round(Math.min(100, Math.max(0, input.focusX))) }),
    ...(input.focusY !== undefined && { focusY: Math.round(Math.min(100, Math.max(0, input.focusY))) }),
    ...(input.tags !== undefined && { tags: input.tags }),
    updatedAt: new Date(),
  };
  await db
    .insert(media)
    .values({ siteId, name, ...values })
    .onConflictDoUpdate({ target: [media.siteId, media.name], set: values });
}

export type ImageEdit = {
  /** Crop rectangle in percent of the (rotated) image. */
  crop?: { left: number; top: number; width: number; height: number };
  rotate?: number;
  flipH?: boolean;
  flipV?: boolean;
  /** -100..100 */
  brightness?: number;
  contrast?: number;
  saturation?: number;
  warmth?: number;
  filter?: "none" | "warm" | "cool" | "mono" | "vintage" | "vivid" | "fade";
  /** Max width in px. */
  width?: number;
  quality?: number;
  saveAs?: "replace" | "copy";
};

export async function editImage(siteId: string, userId: string, dir: string, config: KernConfig, name: string, edit: ImageEdit) {
  const source = mediaPath(dir, config, name);
  const ext = path.extname(name).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext)) throw new Error("Dieses Format kann nicht bearbeitet werden.");
  let image = sharp(await readFile(source)).rotate();
  if (edit.rotate) image = image.rotate(edit.rotate);
  if (edit.flipV) image = image.flip();
  if (edit.flipH) image = image.flop();
  // Materialize rotation so crop percentages refer to the visible image.
  let buffer = await image.toBuffer();
  const meta = await sharp(buffer).metadata();
  image = sharp(buffer);
  if (edit.crop && meta.width && meta.height) {
    const left = Math.round((edit.crop.left / 100) * meta.width);
    const top = Math.round((edit.crop.top / 100) * meta.height);
    const width = Math.max(1, Math.min(meta.width - left, Math.round((edit.crop.width / 100) * meta.width)));
    const height = Math.max(1, Math.min(meta.height - top, Math.round((edit.crop.height / 100) * meta.height)));
    image = image.extract({ left, top, width, height });
  }
  const brightness = 1 + (edit.brightness ?? 0) / 100;
  let saturation = 1 + (edit.saturation ?? 0) / 100;
  if (edit.filter === "vivid") saturation *= 1.35;
  if (edit.filter === "fade") saturation *= 0.75;
  if (edit.filter === "vintage") saturation *= 0.8;
  image = image.modulate({ brightness, saturation: Math.max(0, saturation) });
  const contrast = 1 + (edit.contrast ?? 0) / 100 + (edit.filter === "vivid" ? 0.1 : edit.filter === "fade" ? -0.15 : 0);
  if (contrast !== 1) image = image.linear(contrast, 128 * (1 - contrast));
  if (edit.filter === "mono") image = image.grayscale();
  const warmth = (edit.warmth ?? 0) / 100 + (edit.filter === "warm" || edit.filter === "vintage" ? 0.25 : edit.filter === "cool" ? -0.25 : 0);
  if (warmth) image = image.recomb([[1 + warmth * 0.15, 0, 0], [0, 1, 0], [0, 0, 1 - warmth * 0.15]]);
  if (edit.width) image = image.resize({ width: Math.round(edit.width), withoutEnlargement: true });
  const quality = edit.quality ?? 85;
  if (ext === ".png") image = image.png();
  else if (ext === ".webp") image = image.webp({ quality });
  else if (ext === ".avif") image = image.avif({ quality });
  else image = image.jpeg({ quality, mozjpeg: true });
  buffer = await image.toBuffer();

  const targetName = edit.saveAs === "copy" ? await uniqueMediaName(dir, config, name.replace(/(\.\w+)$/, "-bearbeitet$1")) : name;
  await writeFile(mediaPath(dir, config, targetName), buffer);
  if (targetName !== name) {
    const [original] = await db.select().from(media).where(and(eq(media.siteId, siteId), eq(media.name, name)));
    await db
      .insert(media)
      .values({ siteId, name: targetName, uploadedBy: userId, alt: original?.alt ?? "", caption: original?.caption ?? "", tags: original?.tags ?? [] })
      .onConflictDoNothing();
  }
  void backupToS3(siteId, targetName, buffer);
  return targetName;
}

export async function moveMediaToTrash(siteId: string, userId: string, dir: string, config: KernConfig, name: string) {
  const file = mediaPath(dir, config, name);
  const content = await readFile(file);
  const [meta] = await db.select().from(media).where(and(eq(media.siteId, siteId), eq(media.name, name)));
  await db.insert(trash).values({
    siteId,
    kind: "media",
    label: name,
    path: path.posix.join(config.media.dir, name),
    content: content.toString("base64"),
    binary: true,
    meta: { alt: meta?.alt ?? "", caption: meta?.caption ?? "" },
    deletedBy: userId,
  });
  await rm(file);
  await db.delete(media).where(and(eq(media.siteId, siteId), eq(media.name, name)));
}

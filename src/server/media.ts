import "server-only";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, inArray, like, ne, or } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { media, mediaFolders, type MediaLocation, trash } from "@/db/schema";
import type { KernConfig, MediaItem } from "@/lib/kern-types";
import { S3_BUCKET, s3 } from "@/lib/s3";
import { type ChangeSet, safeJoin, slugify, statusOf } from "./content";
import { cancelCleanup, scheduleCleanup, storeFor } from "./storage";

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

export async function contentCorpus(dir: string, config: KernConfig) {
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
  const [names, metaRows, corpus] = await Promise.all([
    existsSync(folder) ? readdir(folder) : Promise.resolve([] as string[]),
    db.select().from(media).where(eq(media.siteId, siteId)),
    contentCorpus(dir, config),
  ]);
  const metaByName = new Map(metaRows.map((row) => [row.name, row]));
  const usedIn = (value: string) => corpus.filter((c) => c.text.includes(value)).map((c) => c.rel);
  const repoItems = await Promise.all(
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
          location: "repo",
          size: info.size,
          width: dims.width,
          height: dims.height,
          type: mimeOf(name),
          alt: meta?.alt ?? "",
          caption: meta?.caption ?? "",
          focusX: meta?.focusX ?? 50,
          focusY: meta?.focusY ?? 50,
          tags: meta?.tags ?? [],
          folder: meta?.folder ?? "",
          usedIn: usedIn(value),
          status: statusOf(changes, rel),
          updatedAt: info.mtime.toISOString(),
        };
      }),
  );
  const remoteItems = metaRows
    .filter((row) => row.location !== "repo" && row.url)
    .map(
      (row): MediaItem => ({
        name: row.name,
        src: `${row.url}?v=${row.updatedAt.getTime()}`,
        value: row.url!,
        location: row.location,
        size: row.size ?? 0,
        width: row.width,
        height: row.height,
        type: mimeOf(row.name),
        alt: row.alt,
        caption: row.caption,
        focusX: row.focusX,
        focusY: row.focusY,
        tags: row.tags,
        folder: row.folder,
        usedIn: usedIn(row.url!),
        status: "live",
        updatedAt: row.updatedAt.toISOString(),
      }),
    );
  return [...repoItems, ...remoteItems].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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

export async function uniqueMediaName(siteId: string, dir: string, config: KernConfig, original: string) {
  const { base, ext } = cleanFileName(original);
  const remote = new Set(
    (await db.select({ name: media.name }).from(media).where(and(eq(media.siteId, siteId), ne(media.location, "repo")))).map((r) => r.name),
  );
  let name = base + ext;
  for (let i = 2; existsSync(mediaPath(dir, config, name)) || remote.has(name); i++) name = `${base}-${i}${ext}`;
  return name;
}

/** Where a file currently lives, or null if it does not exist. */
export async function locateMedia(siteId: string, dir: string, config: KernConfig, name: string) {
  const [row] = await db.select().from(media).where(and(eq(media.siteId, siteId), eq(media.name, name)));
  if (row && row.location !== "repo") return { location: row.location, row };
  if (existsSync(mediaPath(dir, config, name))) return { location: "repo" as const, row: row ?? null };
  return null;
}

export async function readMedia(siteId: string, dir: string, config: KernConfig, name: string) {
  const found = await locateMedia(siteId, dir, config, name);
  if (!found) throw new Error(`„${name}“ gibt es nicht mehr.`);
  if (found.location === "repo") return { location: found.location, body: await readFile(mediaPath(dir, config, name)), row: found.row };
  const store = (await storeFor(siteId, found.location))!;
  return { location: found.location, body: await store.get(name), row: found.row };
}

async function imageSize(body: Buffer) {
  try {
    const meta = await sharp(body).metadata();
    return { width: meta.width ?? null, height: meta.height ?? null };
  } catch {
    return { width: null, height: null };
  }
}

/**
 * Writes a file to a location and returns the value to store in content.
 * Repo files still need a commit; remote files are live immediately.
 */
export async function writeMedia(siteId: string, dir: string, config: KernConfig, location: MediaLocation, name: string, body: Buffer) {
  if (location === "repo") {
    const target = mediaPath(dir, config, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    await db
      .insert(media)
      .values({ siteId, name })
      .onConflictDoUpdate({ target: [media.siteId, media.name], set: { location: "repo", url: null, size: null, width: null, height: null, updatedAt: new Date() } });
    return mediaValue(config, name);
  }
  const store = (await storeFor(siteId, location))!;
  await store.put(name, body, mimeOf(name));
  await cancelCleanup(siteId, location, store.key(name));
  const url = store.url(name);
  const values = { location, url, size: body.length, ...(await imageSize(body)), updatedAt: new Date() };
  await db
    .insert(media)
    .values({ siteId, name, ...values })
    .onConflictDoUpdate({ target: [media.siteId, media.name], set: values });
  return url;
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

export async function saveUpload(
  site: { id: string; mediaStorage: MediaLocation },
  userId: string,
  dir: string,
  config: KernConfig,
  file: File,
) {
  if (file.size > MAX_UPLOAD) throw new Error(`„${file.name}“ ist größer als 20 MB.`);
  const ext = path.extname(file.name).toLowerCase();
  if (!FILE_TYPES[ext]) throw new Error(`Dateien vom Typ ${ext || "ohne Endung"} werden nicht unterstützt.`);
  const name = await uniqueMediaName(site.id, dir, config, file.name);
  let body: Buffer = Buffer.from(await file.arrayBuffer());
  // Rotate according to EXIF and drop metadata such as GPS position.
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) body = await sharp(body).rotate().toBuffer();
  const value = await writeMedia(site.id, dir, config, site.mediaStorage, name, body);
  await db.update(media).set({ uploadedBy: userId }).where(and(eq(media.siteId, site.id), eq(media.name, name)));
  if (site.mediaStorage === "repo") void backupToS3(site.id, name, body);
  return { name, value, location: site.mediaStorage };
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
  const ext = path.extname(name).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext)) throw new Error("Dieses Format kann nicht bearbeitet werden.");
  const source = await readMedia(siteId, dir, config, name);
  let image = sharp(source.body).rotate();
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

  const targetName = edit.saveAs === "copy" ? await uniqueMediaName(siteId, dir, config, name.replace(/(\.\w+)$/, "-bearbeitet$1")) : name;
  await writeMedia(siteId, dir, config, source.location, targetName, buffer);
  if (targetName !== name) {
    const original = source.row;
    await db
      .update(media)
      .set({ uploadedBy: userId, alt: original?.alt ?? "", caption: original?.caption ?? "", tags: original?.tags ?? [] })
      .where(and(eq(media.siteId, siteId), eq(media.name, targetName)));
  }
  if (source.location === "repo") void backupToS3(siteId, targetName, buffer);
  return { name: targetName, location: source.location };
}

/** Copies a file next to the original ("bild-kopie.jpg"), with its alt text, caption, focus point and tags. */
export async function duplicateMedia(siteId: string, userId: string, dir: string, config: KernConfig, name: string) {
  const source = await readMedia(siteId, dir, config, name);
  const targetName = await uniqueMediaName(siteId, dir, config, name.replace(/(\.\w+)$/, "-kopie$1"));
  await writeMedia(siteId, dir, config, source.location, targetName, source.body);
  const original = source.row;
  await db
    .update(media)
    .set({
      uploadedBy: userId,
      alt: original?.alt ?? "",
      caption: original?.caption ?? "",
      tags: original?.tags ?? [],
      ...(original ? { focusX: original.focusX, focusY: original.focusY, folder: original.folder } : {}),
    })
    .where(and(eq(media.siteId, siteId), eq(media.name, targetName)));
  if (source.location === "repo") void backupToS3(siteId, targetName, source.body);
  return { name: targetName, location: source.location };
}

/** Moves a file to the trash. Returns its location (repo files still need a commit). */
export async function moveMediaToTrash(siteId: string, userId: string, dir: string, config: KernConfig, name: string) {
  const { location, body, row } = await readMedia(siteId, dir, config, name);
  await db.insert(trash).values({
    siteId,
    kind: "media",
    label: name,
    path: path.posix.join(config.media.dir, name),
    content: body.toString("base64"),
    binary: true,
    meta: { alt: row?.alt ?? "", caption: row?.caption ?? "", location },
    deletedBy: userId,
  });
  if (location === "repo") await rm(mediaPath(dir, config, name));
  else {
    // The live site may still show it until the next publish.
    const store = (await storeFor(siteId, location))!;
    await scheduleCleanup(siteId, location, store.key(name));
  }
  await db.delete(media).where(and(eq(media.siteId, siteId), eq(media.name, name)));
  return location;
}

/* ---------- Folders (CMS only: files keep their name and address) ---------- */

/** "  Team / Portraits/ " → "Team/Portraits". Throws for names that cannot be a folder. */
export function cleanFolder(input: string) {
  const parts = input
    .split("/")
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  if (parts.some((p) => p === "." || p === ".." || p.length > 60)) throw new Error("Ungültiger Ordnername.");
  if (parts.length > 6) throw new Error("Höchstens 6 Ebenen.");
  return parts.join("/");
}

const parentsOf = (folder: string) => folder.split("/").map((_, i, all) => all.slice(0, i + 1).join("/"));

/** Every folder of a site: created ones plus those that hold files, with their parents. */
export async function listFolders(siteId: string) {
  const [created, used] = await Promise.all([
    db.select({ path: mediaFolders.path }).from(mediaFolders).where(eq(mediaFolders.siteId, siteId)),
    db.selectDistinct({ path: media.folder }).from(media).where(and(eq(media.siteId, siteId), ne(media.folder, ""))),
  ]);
  const all = new Set<string>();
  for (const { path: p } of [...created, ...used]) for (const parent of parentsOf(p)) all.add(parent);
  return [...all].sort((a, b) => a.localeCompare(b, "de"));
}

export async function createFolder(siteId: string, folder: string) {
  const clean = cleanFolder(folder);
  if (!clean) throw new Error("Bitte gib einen Namen ein.");
  await db.insert(mediaFolders).values({ siteId, path: clean }).onConflictDoNothing();
  return clean;
}

/** Puts files into a folder ("" = top level). Files without a row yet get one. */
export async function moveToFolder(siteId: string, names: string[], folder: string) {
  const clean = cleanFolder(folder);
  for (const name of names) {
    await db
      .insert(media)
      .values({ siteId, name, folder: clean })
      .onConflictDoUpdate({ target: [media.siteId, media.name], set: { folder: clean } });
  }
  if (clean) await db.insert(mediaFolders).values({ siteId, path: clean }).onConflictDoNothing();
  return clean;
}

const inside = (column: typeof media.folder | typeof mediaFolders.path, folder: string) =>
  or(eq(column, folder), like(column, `${folder.replace(/[\\%_]/g, "\\$&")}/%`));

/** Renames or moves a folder with everything in it ("Team" → "Über uns/Team"). */
export async function renameFolder(siteId: string, from: string, to: string) {
  const source = cleanFolder(from);
  const target = cleanFolder(to);
  if (!source || !target) throw new Error("Bitte gib einen Namen ein.");
  if (target === source) return target;
  if (target.startsWith(`${source}/`)) throw new Error("Ein Ordner kann nicht in sich selbst liegen.");
  const swap = (p: string) => target + p.slice(source.length);
  await db.transaction(async (tx) => {
    const files = await tx.select({ name: media.name, folder: media.folder }).from(media).where(and(eq(media.siteId, siteId), inside(media.folder, source)));
    for (const f of files) await tx.update(media).set({ folder: swap(f.folder) }).where(and(eq(media.siteId, siteId), eq(media.name, f.name)));
    const folders = await tx.select({ path: mediaFolders.path }).from(mediaFolders).where(and(eq(mediaFolders.siteId, siteId), inside(mediaFolders.path, source)));
    if (folders.length) {
      await tx.delete(mediaFolders).where(and(eq(mediaFolders.siteId, siteId), inArray(mediaFolders.path, folders.map((f) => f.path))));
    }
    const paths = new Set([target, ...folders.map((f) => swap(f.path))]);
    await tx.insert(mediaFolders).values([...paths].map((p) => ({ siteId, path: p }))).onConflictDoNothing();
  });
  return target;
}

/** Removes a folder; its files and subfolders move up one level. */
export async function deleteFolder(siteId: string, folder: string) {
  const source = cleanFolder(folder);
  if (!source) return;
  const parent = source.split("/").slice(0, -1).join("/");
  const lift = (p: string) => [parent, p.slice(source.length + 1)].filter(Boolean).join("/");
  await db.transaction(async (tx) => {
    const files = await tx.select({ name: media.name, folder: media.folder }).from(media).where(and(eq(media.siteId, siteId), inside(media.folder, source)));
    for (const f of files) {
      const next = f.folder === source ? parent : lift(f.folder);
      await tx.update(media).set({ folder: next }).where(and(eq(media.siteId, siteId), eq(media.name, f.name)));
    }
    const folders = await tx.select({ path: mediaFolders.path }).from(mediaFolders).where(and(eq(mediaFolders.siteId, siteId), inside(mediaFolders.path, source)));
    if (folders.length) {
      await tx.delete(mediaFolders).where(and(eq(mediaFolders.siteId, siteId), inArray(mediaFolders.path, folders.map((f) => f.path))));
    }
    const kept = folders.map((f) => f.path).filter((p) => p !== source).map(lift).filter(Boolean);
    if (kept.length) await tx.insert(mediaFolders).values(kept.map((p) => ({ siteId, path: p }))).onConflictDoNothing();
  });
}

import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { mediaCleanup, type MediaLocation, siteStorage } from "@/db/schema";
import { S3_BUCKET, s3 } from "@/lib/s3";
import { decrypt } from "./crypto";

/*
 * Object storage for media that does not live in the repository:
 * - "cms": kerncms' own bucket (S3_* env), served publicly via /files/<site>/<name>
 * - "s3":  the site's own S3-compatible bucket, served from its public URL
 */

export type RemoteStore = {
  location: Exclude<MediaLocation, "repo">;
  key(name: string): string;
  url(name: string): string;
  put(name: string, body: Buffer, contentType: string): Promise<void>;
  get(name: string): Promise<Buffer>;
  /** Deletes by object key (as stored in media_cleanup). */
  deleteKey(key: string): Promise<void>;
};

/** Used in commit messages: "16 Mediendateien in den kerncms-Speicher verschoben". */
export const LOCATION_INTO: Record<MediaLocation, string> = {
  repo: "ins Repository",
  cms: "in den kerncms-Speicher",
  s3: "in den eigenen S3-Speicher",
};

/** Public base URL of this kerncms instance; files in the CMS storage are served from here. */
export function publicCmsUrl() {
  return (process.env.KERN_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/+$/, "");
}

async function bodyToBuffer(body: unknown) {
  if (!body) throw new Error("Datei ist leer.");
  const bytes = await (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
  return Buffer.from(bytes);
}

function bucketStore(location: RemoteStore["location"], client: S3Client, bucket: string, keyOf: (name: string) => string, urlOf: (name: string) => string): RemoteStore {
  return {
    location,
    key: keyOf,
    url: urlOf,
    async put(name, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: keyOf(name), Body: body, ContentType: contentType }));
    },
    async get(name) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: keyOf(name) }));
      return bodyToBuffer(out.Body);
    },
    async deleteKey(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

export function cmsStore(siteId: string): RemoteStore {
  return bucketStore(
    "cms",
    s3,
    S3_BUCKET,
    (name) => `sites/${siteId}/files/${name}`,
    (name) => `${publicCmsUrl()}/files/${siteId}/${encodeURIComponent(name)}`,
  );
}

export type SiteStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
  prefix: string;
  forcePathStyle: boolean;
};

export function normalizePrefix(prefix: string) {
  const clean = prefix.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return clean ? `${clean}/` : "";
}

export function customStore(config: SiteStorageConfig): RemoteStore {
  const client = new S3Client({
    endpoint: config.endpoint || undefined,
    region: config.region || "auto",
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const prefix = normalizePrefix(config.prefix);
  const base = config.publicUrl.replace(/\/+$/, "");
  return bucketStore(
    "s3",
    client,
    config.bucket,
    (name) => `${prefix}${name}`,
    (name) => `${base}/${prefix}${encodeURIComponent(name)}`,
  );
}

export async function siteStorageConfig(siteId: string): Promise<SiteStorageConfig | null> {
  const [row] = await db.select().from(siteStorage).where(eq(siteStorage.siteId, siteId));
  if (!row) return null;
  return { ...row, secretAccessKey: decrypt(row.secretAccessKey) };
}

/** Store for a location, or null for "repo". Throws if the site has no own S3 configured. */
export async function storeFor(siteId: string, location: MediaLocation): Promise<RemoteStore | null> {
  if (location === "repo") return null;
  if (location === "cms") return cmsStore(siteId);
  const config = await siteStorageConfig(siteId);
  if (!config) throw new Error("Für diese Website ist kein eigener S3-Speicher eingerichtet.");
  return customStore(config);
}

/** Remembers an object to delete after the next successful publish. */
export async function scheduleCleanup(siteId: string, location: Exclude<MediaLocation, "repo">, key: string) {
  await db.insert(mediaCleanup).values({ siteId, location, key });
}

export async function cancelCleanup(siteId: string, location: Exclude<MediaLocation, "repo">, key: string) {
  await db.delete(mediaCleanup).where(and(eq(mediaCleanup.siteId, siteId), eq(mediaCleanup.location, location), eq(mediaCleanup.key, key)));
}

/** Called when a publish succeeded: queued objects are no longer referenced by the live branch. */
export async function releaseCleanup(siteId: string) {
  await db.update(mediaCleanup).set({ releasedAt: new Date() }).where(and(eq(mediaCleanup.siteId, siteId), isNull(mediaCleanup.releasedAt)));
}

/** Grace period so hosting has rebuilt the site before old files disappear. */
const CLEANUP_DELAY = 60 * 60 * 1000;

/** Deletes released objects after the grace period. Never throws. */
export async function runCleanup(siteId: string) {
  const rows = await db
    .select()
    .from(mediaCleanup)
    .where(and(eq(mediaCleanup.siteId, siteId), isNotNull(mediaCleanup.releasedAt), lt(mediaCleanup.releasedAt, new Date(Date.now() - CLEANUP_DELAY))));
  for (const row of rows) {
    try {
      const store = await storeFor(siteId, row.location).catch(() => null);
      // Storage removed in the meantime: nothing left to delete there.
      await store?.deleteKey(row.key);
      await db.delete(mediaCleanup).where(eq(mediaCleanup.id, row.id));
    } catch (error) {
      console.warn("[kern] Alte Mediendatei konnte nicht gelöscht werden:", row.key, (error as Error).message);
    }
  }
}

const lastCleanup = new Map<string, number>();

/** Runs the cleanup at most every 10 minutes per site, in the background. */
export function cleanupSoon(siteId: string) {
  const last = lastCleanup.get(siteId) ?? 0;
  if (Date.now() - last < 10 * 60 * 1000) return;
  lastCleanup.set(siteId, Date.now());
  void runCleanup(siteId);
}

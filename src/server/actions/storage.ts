"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { media, type MediaLocation, siteStorage, sites } from "@/db/schema";
import { run } from "../action";
import { encrypt } from "../crypto";
import { withSiteLock } from "../git";
import { migrateMedia } from "../media-migrate";
import { customStore, normalizePrefix, siteStorageConfig, type SiteStorageConfig } from "../storage";
import { getWorkspace } from "../sites";

const LOCATIONS: MediaLocation[] = ["repo", "cms", "s3"];

function refresh() {
  revalidatePath("/", "layout");
}

/** Where new uploads go. */
export async function saveMediaStorage(location: MediaLocation) {
  return run(async () => {
    const ws = await getWorkspace("admin");
    if (!LOCATIONS.includes(location)) throw new Error("Unbekannter Speicherort.");
    if (location === "s3" && !(await siteStorageConfig(ws.site.id))) throw new Error("Richte zuerst den eigenen S3-Speicher ein.");
    if (location === "cms" && !process.env.S3_BUCKET) throw new Error("Der kerncms-Speicher ist auf diesem Server nicht eingerichtet (S3_BUCKET).");
    await db.update(sites).set({ mediaStorage: location }).where(eq(sites.id, ws.site.id));
    refresh();
    return null;
  });
}

export type StorageInput = Omit<SiteStorageConfig, "secretAccessKey"> & { secretAccessKey: string };

async function resolveInput(siteId: string, input: StorageInput): Promise<SiteStorageConfig> {
  const existing = await siteStorageConfig(siteId);
  const config: SiteStorageConfig = {
    endpoint: input.endpoint.trim().replace(/\/+$/, ""),
    region: input.region.trim() || "auto",
    bucket: input.bucket.trim(),
    accessKeyId: input.accessKeyId.trim(),
    // Empty secret keeps the saved one.
    secretAccessKey: input.secretAccessKey.trim() || existing?.secretAccessKey || "",
    publicUrl: input.publicUrl.trim().replace(/\/+$/, ""),
    prefix: normalizePrefix(input.prefix),
    forcePathStyle: input.forcePathStyle,
  };
  if (config.endpoint && !/^https?:\/\//.test(config.endpoint)) throw new Error("Der Endpunkt muss mit https:// beginnen.");
  if (!config.bucket) throw new Error("Bitte gib den Bucket an.");
  if (!config.accessKeyId || !config.secretAccessKey) throw new Error("Bitte gib Access Key und Secret Key an.");
  if (!/^https?:\/\//.test(config.publicUrl)) throw new Error("Die öffentliche Adresse muss mit https:// beginnen.");
  return config;
}

export type StorageTestResult = { write: boolean; publicRead: boolean; message: string };

/** Writes, reads publicly and deletes a small test file. */
async function testConfig(config: SiteStorageConfig): Promise<StorageTestResult> {
  const store = customStore(config);
  const name = `.kerncms-test-${Date.now()}.txt`;
  try {
    await store.put(name, Buffer.from("kerncms"), "text/plain");
  } catch (error) {
    return { write: false, publicRead: false, message: `Schreiben fehlgeschlagen: ${(error as Error).message}` };
  }
  let publicRead = false;
  try {
    const res = await fetch(store.url(name), { cache: "no-store", signal: AbortSignal.timeout(8000) });
    publicRead = res.ok && (await res.text()) === "kerncms";
  } catch {
    publicRead = false;
  }
  await store.deleteKey(store.key(name)).catch(() => {});
  return {
    write: true,
    publicRead,
    message: publicRead
      ? "Verbindung klappt: Dateien lassen sich speichern und sind öffentlich erreichbar."
      : `Speichern klappt, aber ${store.url(name)} ist nicht öffentlich abrufbar. Prüfe die öffentliche Adresse und ob der Bucket öffentlich lesbar ist.`,
  };
}

export async function testSiteStorage(input: StorageInput) {
  return run(async () => {
    const ws = await getWorkspace("admin");
    return testConfig(await resolveInput(ws.site.id, input));
  });
}

export async function saveSiteStorage(input: StorageInput) {
  return run(async () => {
    const ws = await getWorkspace("admin");
    const config = await resolveInput(ws.site.id, input);
    const test = await testConfig(config);
    if (!test.write) throw new Error(test.message);
    const values = { ...config, secretAccessKey: encrypt(config.secretAccessKey), updatedAt: new Date() };
    await db.insert(siteStorage).values({ siteId: ws.site.id, ...values }).onConflictDoUpdate({ target: siteStorage.siteId, set: values });
    refresh();
    return test;
  });
}

export async function removeSiteStorage() {
  return run(async () => {
    const ws = await getWorkspace("admin");
    if (ws.site.mediaStorage === "s3") throw new Error("Neue Uploads gehen noch in diesen Speicher. Wähle zuerst einen anderen Speicherort.");
    const [inUse] = await db
      .select({ name: media.name })
      .from(media)
      .where(and(eq(media.siteId, ws.site.id), eq(media.location, "s3")))
      .limit(1);
    if (inUse) throw new Error("Im S3-Speicher liegen noch Dateien. Verschiebe sie zuerst an einen anderen Ort.");
    await db.delete(siteStorage).where(eq(siteStorage.siteId, ws.site.id));
    refresh();
    return null;
  });
}

/** Moves all (or the given) media files to `target` and rewrites links in content. */
export async function moveMedia(target: MediaLocation, names?: string[]) {
  return run(async () => {
    const ws = await getWorkspace("admin");
    if (!LOCATIONS.includes(target)) throw new Error("Unbekannter Speicherort.");
    const result = await withSiteLock(ws.site.id, () =>
      migrateMedia(ws.site, ws.dir, ws.config, target, { name: ws.user.name, email: ws.user.email }, names),
    );
    refresh();
    return result;
  });
}

import "server-only";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { media, type MediaLocation } from "@/db/schema";
import type { KernConfig } from "@/lib/kern-types";
import { type ChangeSet, safeJoin } from "./content";
import { commit, git, type Author } from "./git";
import { contentCorpus, listMedia, mediaPath, readMedia, writeMedia } from "./media";
import { LOCATION_INTO, scheduleCleanup, storeFor } from "./storage";

const NO_CHANGES: ChangeSet = { unsaved: new Set(), unpublished: new Map(), lastChange: new Map() };

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches a stored media value as a whole: "/media/a.jpg" must not match inside
 * "https://example.com/media/a.jpg" or "/media/a.jpg-alt".
 */
function valuePattern(value: string) {
  return new RegExp(`(?<![\\w.\\-/:%])${escapeRegex(value)}(?![\\w\\-/%])`, "g");
}

export type MigrationResult = { moved: number; files: number; skipped: string[] };

/**
 * Moves media files to another location and rewrites every reference in pages,
 * entries and globals. Everything lands in one commit on the draft; the live site keeps
 * the old files until that is published (old objects are deleted after the next publish).
 * Must run inside the site lock.
 */
export async function migrateMedia(
  site: { id: string; branch: string },
  dir: string,
  config: KernConfig,
  target: MediaLocation,
  author: Author,
  names?: string[],
): Promise<MigrationResult> {
  // Make sure the target works before touching anything.
  await storeFor(site.id, target);

  const all = await listMedia(site.id, dir, config, NO_CHANGES);
  const items = all.filter((item) => item.location !== target && (!names || names.includes(item.name)));
  if (items.length === 0) return { moved: 0, files: 0, skipped: [] };

  // Snapshot of the database rows, to undo a failed move.
  const before = await db.select().from(media).where(eq(media.siteId, site.id));

  // 1. Copy every file to the target. Nothing is removed yet, so a failure leaves the site intact.
  const moves: { name: string; from: MediaLocation; oldValue: string; newValue: string; body: Buffer }[] = [];
  const skipped: string[] = [];
  for (const item of items) {
    try {
      const { body } = await readMedia(site.id, dir, config, item.name);
      const newValue = await writeMedia(site.id, dir, config, target, item.name, body);
      moves.push({ name: item.name, from: item.location, oldValue: item.value, newValue, body });
    } catch (error) {
      console.warn("[kern] Datei nicht verschoben:", item.name, (error as Error).message);
      skipped.push(item.name);
    }
  }
  if (moves.length === 0) throw new Error(`Keine Datei ließ sich verschieben (${skipped.join(", ")}).`);

  const corpus = await contentCorpus(dir, config);
  const changedFiles: string[] = [];
  const repoPaths: string[] = [];
  try {
    // 2. Rewrite references in content files.
    for (const file of corpus) {
      let text = file.text;
      for (const move of moves) text = text.replace(valuePattern(move.oldValue), move.newValue);
      if (text !== file.text) {
        await writeFile(safeJoin(dir, file.rel), text);
        changedFiles.push(file.rel);
      }
    }

    // 3. Repository files leave with the same commit.
    for (const move of moves) {
      if (move.from === "repo") await rm(mediaPath(dir, config, move.name), { force: true });
      if (move.from === "repo" || target === "repo") repoPaths.push(path.posix.join(config.media.dir, move.name));
    }

    await commit(
      dir,
      `${moves.length === 1 ? `„${moves[0].name}“` : `${moves.length} Mediendateien`} ${LOCATION_INTO[target]} verschoben`,
      author,
      [...new Set([...changedFiles, ...repoPaths])],
    );
  } catch (error) {
    await rollback();
    throw error;
  }

  // 4. Old objects stay until the live site no longer uses them.
  for (const move of moves) {
    if (move.from === "repo") continue;
    const store = await storeFor(site.id, move.from).catch(() => null);
    if (store) await scheduleCleanup(site.id, move.from, store.key(move.name));
  }
  return { moved: moves.length, files: changedFiles.length, skipped };

  /** Puts content, files and rows back as they were. Best effort, never throws. */
  async function rollback() {
    const paths = [...new Set([...changedFiles, ...repoPaths])];
    if (paths.length > 0) await git(dir, ["reset", "-q", "--", ...paths]).catch(() => {});
    for (const file of corpus) {
      if (changedFiles.includes(file.rel)) await writeFile(safeJoin(dir, file.rel), file.text).catch(() => {});
    }
    const targetStore = await storeFor(site.id, target).catch(() => null);
    for (const move of moves) {
      try {
        if (move.from === "repo") await writeFile(mediaPath(dir, config, move.name), move.body);
        if (target === "repo") await rm(mediaPath(dir, config, move.name), { force: true });
        else await targetStore?.deleteKey(targetStore.key(move.name));
        const row = before.find((r) => r.name === move.name);
        if (row) await db.update(media).set(row).where(and(eq(media.siteId, site.id), eq(media.name, move.name)));
        else await db.delete(media).where(and(eq(media.siteId, site.id), eq(media.name, move.name)));
      } catch (error) {
        console.warn("[kern] Zurücksetzen unvollständig:", move.name, (error as Error).message);
      }
    }
  }
}

/** Counts per location, for the settings page. */
export async function mediaLocationCounts(siteId: string, dir: string, config: KernConfig) {
  const items = await listMedia(siteId, dir, config, NO_CHANGES);
  const counts: Record<MediaLocation, { files: number; bytes: number }> = {
    repo: { files: 0, bytes: 0 },
    cms: { files: 0, bytes: 0 },
    s3: { files: 0, bytes: 0 },
  };
  for (const item of items) {
    counts[item.location].files++;
    counts[item.location].bytes += item.size;
  }
  return counts;
}

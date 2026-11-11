"use server";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { trash } from "@/db/schema";
import type { BlockData, EntryValues, PageData, PageSeo, Redirect } from "@/lib/kern-types";
import { run } from "../action";
import { findCollection, findGlobal } from "../config";
import {
  entryFile,
  isValidName,
  normalizePath,
  pageFile,
  pageNameForPath,
  readEntry,
  readGlobal,
  readPage,
  removeFile,
  safeJoin,
  slugify,
  uniqueName,
  writeEntry,
  writeGlobal,
  writePage,
  writeRedirects,
} from "../content";
import { commit, discard, withSiteLock } from "../git";
import { getWorkspace, type Workspace } from "../sites";

function author(ws: Workspace) {
  return { name: ws.user.name, email: ws.user.email };
}

function refresh() {
  revalidatePath("/", "layout");
}

/* ---------- Pages ---------- */

export async function createPage(input: { title: string; path: string; copyFrom?: string }) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    const urlPath = normalizePath(input.path || slugify(input.title));
    return withSiteLock(ws.site.id, async () => {
      const name = await uniqueName(ws.dir, ws.config.pages.path, pageNameForPath(urlPath), ".json");
      let blocks: BlockData[] = [];
      if (input.copyFrom && isValidName(input.copyFrom)) {
        const source = await readPage(ws.dir, ws.config, input.copyFrom);
        blocks = source.blocks.map((b) => ({ ...b, id: newBlockId() }));
      }
      const page = await writePage(ws.dir, ws.config, name, { title: input.title, path: urlPath, seo: {}, blocks });
      await commit(ws.dir, `Seite „${page.title}“ angelegt`, author(ws), [pageFile(ws.config, name)]);
      refresh();
      return { name, path: page.path };
    });
  });
}

function newBlockId() {
  return "b-" + Math.random().toString(36).slice(2, 7);
}

/** Writes the page without committing, so the preview shows it. Used by the editor while typing. */
export async function writePageDraft(name: string, data: PageData) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    return withSiteLock(ws.site.id, async () => {
      await writePage(ws.dir, ws.config, name, data);
      return null;
    });
  });
}

/** Writes and commits the page ("Speichern"). */
export async function savePage(name: string, data: PageData, message?: string) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    return withSiteLock(ws.site.id, async () => {
      const page = await writePage(ws.dir, ws.config, name, data);
      const sha = await commit(ws.dir, message?.trim() || `Seite „${page.title}“ bearbeitet`, author(ws), [pageFile(ws.config, name)]);
      refresh();
      return { sha };
    });
  });
}

export async function updatePageSettings(name: string, input: { title: string; path: string; seo: PageSeo }) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    return withSiteLock(ws.site.id, async () => {
      const page = await readPage(ws.dir, ws.config, name);
      const next = await writePage(ws.dir, ws.config, name, { ...page, title: input.title, path: input.path, seo: input.seo });
      await commit(ws.dir, `Einstellungen von „${next.title}“ geändert`, author(ws), [pageFile(ws.config, name)]);
      refresh();
      return { path: next.path };
    });
  });
}

/** Throws away uncommitted edits of a page. */
export async function discardPage(name: string) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    if (!isValidName(name)) throw new Error("Ungültiger Seitenname.");
    return withSiteLock(ws.site.id, async () => {
      await discard(ws.dir, [pageFile(ws.config, name)]);
      refresh();
      return existsSync(safeJoin(ws.dir, pageFile(ws.config, name))) ? await readPage(ws.dir, ws.config, name) : null;
    });
  });
}

export async function duplicatePage(name: string) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    const page = await readPage(ws.dir, ws.config, name);
    return withSiteLock(ws.site.id, async () => {
      const copyPath = page.path === "/" ? "/startseite-kopie" : `${page.path}-kopie`;
      const newName = await uniqueName(ws.dir, ws.config.pages.path, pageNameForPath(copyPath), ".json");
      let urlPath = copyPath;
      for (let i = 2; ; i++) {
        try {
          await writePage(ws.dir, ws.config, newName, {
            ...page,
            title: `${page.title} (Kopie)`,
            path: urlPath,
            blocks: page.blocks.map((b) => ({ ...b, id: newBlockId() })),
          });
          break;
        } catch (error) {
          if (i > 20 || !(error as Error).message.includes("gehört schon")) throw error;
          urlPath = `${copyPath}-${i}`;
        }
      }
      await commit(ws.dir, `Seite „${page.title}“ dupliziert`, author(ws), [pageFile(ws.config, newName)]);
      refresh();
      return { name: newName };
    });
  });
}

export async function deletePage(name: string) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    const page = await readPage(ws.dir, ws.config, name);
    if (page.path === "/") throw new Error("Die Startseite kann nicht gelöscht werden.");
    const rel = pageFile(ws.config, name);
    return withSiteLock(ws.site.id, async () => {
      const content = await readFile(safeJoin(ws.dir, rel), "utf8");
      await db.insert(trash).values({ siteId: ws.site.id, kind: "page", label: page.title, path: rel, content, meta: { url: page.path }, deletedBy: ws.user.id });
      await removeFile(ws.dir, rel);
      await commit(ws.dir, `Seite „${page.title}“ gelöscht`, author(ws), [rel]);
      refresh();
      return null;
    });
  });
}

/* ---------- Collection entries ---------- */

export async function saveEntry(collectionKey: string, id: string | null, values: EntryValues) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    const collection = findCollection(ws.config, collectionKey);
    if (!collection) throw new Error("Unbekannte Sammlung.");
    return withSiteLock(ws.site.id, async () => {
      const title = String(values[collection.titleField] ?? "").replace(/<[^>]+>/g, "").trim();
      const entryId = id ?? (await uniqueName(ws.dir, collection.path, slugify(title) || collection.key, collection.format === "md" ? ".md" : ".json"));
      if (id && !existsSync(safeJoin(ws.dir, entryFile(collection, id)))) throw new Error("Diesen Eintrag gibt es nicht mehr.");
      await writeEntry(ws.dir, ws.config, collection, entryId, values);
      const verb = id ? "bearbeitet" : "angelegt";
      await commit(ws.dir, `${collection.singular} „${title || entryId}“ ${verb}`, author(ws), [entryFile(collection, entryId)]);
      refresh();
      return { id: entryId, values: await readEntry(ws.dir, collection, entryId) };
    });
  });
}

export async function duplicateEntry(collectionKey: string, id: string) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    const collection = findCollection(ws.config, collectionKey);
    if (!collection) throw new Error("Unbekannte Sammlung.");
    const values = await readEntry(ws.dir, collection, id);
    const title = `${String(values[collection.titleField] ?? id)} (Kopie)`;
    return withSiteLock(ws.site.id, async () => {
      const newId = await uniqueName(ws.dir, collection.path, `${id}-kopie`, collection.format === "md" ? ".md" : ".json");
      await writeEntry(ws.dir, ws.config, collection, newId, { ...values, [collection.titleField]: title });
      await commit(ws.dir, `${collection.singular} „${title}“ angelegt`, author(ws), [entryFile(collection, newId)]);
      refresh();
      return { id: newId };
    });
  });
}

export async function deleteEntry(collectionKey: string, id: string) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    const collection = findCollection(ws.config, collectionKey);
    if (!collection) throw new Error("Unbekannte Sammlung.");
    const rel = entryFile(collection, id);
    const values = await readEntry(ws.dir, collection, id);
    const title = String(values[collection.titleField] ?? id);
    return withSiteLock(ws.site.id, async () => {
      const content = await readFile(safeJoin(ws.dir, rel), "utf8");
      await db.insert(trash).values({
        siteId: ws.site.id,
        kind: "entry",
        label: title,
        path: rel,
        content,
        meta: { collection: collection.key, collectionLabel: collection.label },
        deletedBy: ws.user.id,
      });
      await removeFile(ws.dir, rel);
      await commit(ws.dir, `${collection.singular} „${title}“ gelöscht`, author(ws), [rel]);
      refresh();
      return null;
    });
  });
}

/* ---------- Globals and redirects ---------- */

/** Current values of a global, e.g. to edit it from the visual editor. */
export async function loadGlobal(key: string) {
  return run(async () => {
    const ws = await getWorkspace("viewer");
    const global = findGlobal(ws.config, key);
    if (!global) throw new Error("Unbekannter Bereich.");
    return { values: await readGlobal(ws.dir, global) };
  });
}

export async function saveGlobal(key: string, values: EntryValues) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    const global = findGlobal(ws.config, key);
    if (!global) throw new Error("Unbekannter Bereich.");
    return withSiteLock(ws.site.id, async () => {
      const saved = await writeGlobal(ws.dir, ws.config, global, values);
      await commit(ws.dir, `${global.label} geändert`, author(ws), [global.path]);
      refresh();
      return saved;
    });
  });
}

export async function saveRedirects(redirects: Redirect[]) {
  return run(async () => {
    const ws = await getWorkspace("admin");
    return withSiteLock(ws.site.id, async () => {
      const saved = await writeRedirects(ws.dir, ws.config, redirects);
      await commit(ws.dir, "Weiterleitungen geändert", author(ws), [ws.config.redirects!]);
      refresh();
      return saved;
    });
  });
}

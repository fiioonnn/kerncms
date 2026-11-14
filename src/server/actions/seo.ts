"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSettings, seoKeywords } from "@/db/schema";
import type { SeoFacts } from "@/lib/seo";
import { run } from "../action";
import { requireAdmin } from "../auth";
import { readPage } from "../content";
import { encrypt } from "../crypto";
import { analyzePreview } from "../seo/analyze";
import { clearSearchConsoleCache, listProperties, pagePerformance, parseServiceAccount, searchConsoleFor, type PagePerformance } from "../seo/search-console";
import { getWorkspace } from "../sites";

/** Reads the page as the preview renders it (the draft) and returns its SEO facts and focus keyword. */
export async function analyzeSeo(name: string) {
  return run(async (): Promise<{ facts: SeoFacts; keyword: string }> => {
    const ws = await getWorkspace("viewer");
    const page = await readPage(ws.dir, ws.config, name);
    const [facts, [row]] = await Promise.all([
      analyzePreview(ws.site.id, page.path),
      db
        .select({ keyword: seoKeywords.keyword })
        .from(seoKeywords)
        .where(and(eq(seoKeywords.siteId, ws.site.id), eq(seoKeywords.page, name)))
        .limit(1),
    ]);
    return { facts, keyword: row?.keyword ?? "" };
  });
}

export async function saveSeoKeyword(name: string, keyword: string) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    await readPage(ws.dir, ws.config, name);
    const value = keyword.replace(/\s+/g, " ").trim().slice(0, 100);
    if (!value) {
      await db.delete(seoKeywords).where(and(eq(seoKeywords.siteId, ws.site.id), eq(seoKeywords.page, name)));
      return null;
    }
    await db
      .insert(seoKeywords)
      .values({ siteId: ws.site.id, page: name, keyword: value })
      .onConflictDoUpdate({ target: [seoKeywords.siteId, seoKeywords.page], set: { keyword: value, updatedAt: new Date() } });
    return null;
  });
}

export type SearchResult =
  | { state: "off" }
  | { state: "no-url"; email: string }
  | { state: "no-property"; email: string }
  | { state: "ok"; data: PagePerformance; liveUrl: string };

/** Google Search Console figures of the live page, or why there are none. */
export async function searchPerformance(name: string) {
  return run(async (): Promise<SearchResult> => {
    const ws = await getWorkspace("viewer");
    const page = await readPage(ws.dir, ws.config, name);
    const sc = await searchConsoleFor(ws.site.liveUrl);
    if (sc.state !== "ok") return sc;
    return { state: "ok", data: await pagePerformance(sc.account, sc.property, sc.liveUrl, page.path), liveUrl: sc.liveUrl };
  });
}

/** Stores the service account key after checking that Google accepts it. Returns its properties. */
export async function saveGoogleServiceAccount(json: string) {
  return run(async () => {
    await requireAdmin();
    const account = parseServiceAccount(json.trim());
    clearSearchConsoleCache();
    const properties = await listProperties(account, true);
    const values = { serviceAccount: encrypt(JSON.stringify(account)), email: account.client_email, updatedAt: new Date() };
    await db.insert(googleSettings).values({ id: "default", ...values }).onConflictDoUpdate({ target: googleSettings.id, set: values });
    revalidatePath("/admin/seo");
    return properties;
  });
}

export async function removeGoogleServiceAccount() {
  return run(async () => {
    await requireAdmin();
    await db.delete(googleSettings).where(eq(googleSettings.id, "default"));
    clearSearchConsoleCache();
    revalidatePath("/admin/seo");
    return null;
  });
}

/** Reloads the property list (after adding the service account to a property in Search Console). */
export async function refreshSearchConsole() {
  return run(async () => {
    await requireAdmin();
    clearSearchConsoleCache();
    revalidatePath("/admin/seo");
    return null;
  });
}

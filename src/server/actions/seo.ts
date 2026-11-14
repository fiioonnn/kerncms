"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { seoKeywords } from "@/db/schema";
import type { SeoFacts } from "@/lib/seo";
import { run } from "../action";
import { readPage } from "../content";
import { analyzePreview } from "../seo/analyze";
import { liveUrlOf, mapsEnabled, mapsRank, pageSpeed, pageSpeedEnabled, searchRank, serperEnabled, type MapsRank, type PageSpeed, type SearchRank } from "../seo/google";
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

export type PageSpeedResult = { state: "off" } | { state: "no-url" } | { state: "ok"; data: PageSpeed };

/** PageSpeed of the live page (cached for a few hours; `fresh` runs it again). */
export async function pageSpeedOf(name: string, fresh = false) {
  return run(async (): Promise<PageSpeedResult> => {
    const ws = await getWorkspace("viewer");
    const page = await readPage(ws.dir, ws.config, name);
    if (!pageSpeedEnabled()) return { state: "off" };
    if (!ws.site.liveUrl) return { state: "no-url" };
    return { state: "ok", data: await pageSpeed(liveUrlOf(ws.site.liveUrl, page.path), fresh) };
  });
}

type Outcome<T> = { state: "off" } | { state: "ok"; data: T } | { state: "error"; error: string };
export type PositionsResult = { state: "no-url" } | { state: "ok"; search: Outcome<SearchRank>; maps: Outcome<MapsRank> };

async function outcome<T>(enabled: boolean, load: () => Promise<T>): Promise<Outcome<T>> {
  if (!enabled) return { state: "off" };
  try {
    return { state: "ok", data: await load() };
  } catch (error) {
    return { state: "error", error: (error as Error).message };
  }
}

/** Where the site shows up for a search phrase: normal Google results (Serper) and Google Maps. Cached for a day. */
export async function googlePositions(phrase: string) {
  return run(async (): Promise<PositionsResult> => {
    const ws = await getWorkspace("viewer");
    const liveUrl = ws.site.liveUrl;
    if (!liveUrl) return { state: "no-url" };
    const query = phrase.replace(/\s+/g, " ").trim().slice(0, 100);
    if (query.length < 2) throw new Error("Die Suchphrase ist zu kurz.");
    const [search, maps] = await Promise.all([
      outcome(serperEnabled(), () => searchRank(query, liveUrl)),
      outcome(mapsEnabled(), () => mapsRank(query, liveUrl)),
    ]);
    return { state: "ok", search, maps };
  });
}

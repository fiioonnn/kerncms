import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sites } from "@/db/schema";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

export async function siteByKey(key: string) {
  const [site] = await db.select().from(sites).where(eq(sites.key, key)).limit(1);
  return site ?? null;
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** Very small in-memory rate limit per key (e.g. ip + site). */
const hits = ((globalThis as { __kernRate?: Map<string, number[]> }).__kernRate ??= new Map());
export function rateLimited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t: number) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}

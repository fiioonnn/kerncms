import { createHash, randomBytes } from "node:crypto";
import { db } from "@/db";
import { projectAnalytics } from "@/db/schema";
import { eq } from "drizzle-orm";

const ROTATE_AFTER_MS = 24 * 60 * 60 * 1000;

export async function getRotatedSalt(projectId: string): Promise<string> {
  const row = db.select().from(projectAnalytics).where(eq(projectAnalytics.projectId, projectId)).get();
  if (!row) throw new Error(`No analytics row for project ${projectId}`);

  const age = Date.now() - row.saltRotatedAt.getTime();
  if (age < ROTATE_AFTER_MS) return row.dailySalt;

  const next = randomBytes(32).toString("hex");
  db.update(projectAnalytics)
    .set({ dailySalt: next, saltRotatedAt: new Date() })
    .where(eq(projectAnalytics.projectId, projectId))
    .run();
  return next;
}

export function computeVisitorHash(salt: string, domain: string, ip: string, ua: string): string {
  return createHash("sha256").update(`${salt}|${domain}|${ip}|${ua}`).digest("hex");
}

export function computeSessionHash(salt: string, domain: string, ip: string, ua: string, path: string): string {
  return createHash("sha256").update(`${salt}|${domain}|${ip}|${ua}|${path}`).digest("hex").slice(0, 32);
}

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "@/db";
import { projectScreenshots, projects } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || path.join(process.cwd(), "data", "screenshots");
const SCREENSHOT_URL = process.env.SCREENSHOT_URL || "http://screenshot:3000";

export function hashPath(p: string): string {
  return crypto.createHash("sha256").update(p).digest("hex").slice(0, 16);
}

export function fileFor(projectId: string, pathHash: string): string {
  return path.join(SCREENSHOT_DIR, projectId, `${pathHash}.png`);
}

export async function ensureProjectDir(projectId: string) {
  await fs.mkdir(path.join(SCREENSHOT_DIR, projectId), { recursive: true });
}

function joinUrl(baseUrl: string, urlPath: string): string {
  try {
    const u = new URL(urlPath, baseUrl);
    return u.toString();
  } catch {
    return baseUrl;
  }
}

const inflight = new Set<string>();

export async function captureForPath(projectId: string, urlPath: string): Promise<void> {
  const key = `${projectId}:${urlPath}`;
  if (inflight.has(key)) return;
  inflight.add(key);

  try {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project?.url) throw new Error("Project URL not configured");
    const target = joinUrl(project.url, urlPath || "/");

    const ph = hashPath(urlPath);
    db.insert(projectScreenshots)
      .values({ projectId, path: urlPath, pathHash: ph, status: "pending" })
      .onConflictDoUpdate({
        target: [projectScreenshots.projectId, projectScreenshots.pathHash],
        set: { status: "pending", updatedAt: new Date() },
      })
      .run();

    let res: Response;
    try {
      res = await fetch(`${SCREENSHOT_URL}/screenshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target, viewportWidth: 1920 }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      db.update(projectScreenshots)
        .set({ status: "failed", error: msg, updatedAt: new Date() })
        .where(and(eq(projectScreenshots.projectId, projectId), eq(projectScreenshots.pathHash, ph)))
        .run();
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      db.update(projectScreenshots)
        .set({ status: "failed", error: text.slice(0, 500) || `status ${res.status}`, updatedAt: new Date() })
        .where(and(eq(projectScreenshots.projectId, projectId), eq(projectScreenshots.pathHash, ph)))
        .run();
      return;
    }

    const width = Number(res.headers.get("X-Page-Width") ?? 1280);
    const height = Number(res.headers.get("X-Page-Height") ?? 0);
    const buf = Buffer.from(await res.arrayBuffer());

    await ensureProjectDir(projectId);
    await fs.writeFile(fileFor(projectId, ph), new Uint8Array(buf));

    db.update(projectScreenshots)
      .set({
        status: "ready",
        error: null,
        width,
        height,
        capturedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(projectScreenshots.projectId, projectId), eq(projectScreenshots.pathHash, ph)))
      .run();
  } finally {
    inflight.delete(key);
  }
}

export async function captureMany(projectId: string, paths: string[]): Promise<void> {
  for (const p of paths) {
    try {
      await captureForPath(projectId, p);
    } catch {
      /* already recorded as failed in DB */
    }
  }
}

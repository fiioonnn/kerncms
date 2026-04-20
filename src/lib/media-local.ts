import path from "node:path";
import { db } from "@/db";
import { mediaBuckets, mediaSyncQueue } from "@/db/schema";
import { eq } from "drizzle-orm";

export function mediaRoot(projectId: string): string {
  const dir = mediaDirForProject(projectId);
  return path.join(process.cwd(), dir, projectId);
}

export function mediaDirForProject(projectId: string): string {
  const ghBucket = db.select({ config: mediaBuckets.config }).from(mediaBuckets)
    .where(eq(mediaBuckets.projectId, projectId))
    .all()
    .find((b) => {
      try { const c = JSON.parse(b.config); return c.mediaDir !== undefined; } catch { return false; }
    });

  if (ghBucket) {
    try {
      const cfg = JSON.parse(ghBucket.config);
      if (cfg.mediaDir) return cfg.mediaDir;
    } catch { /* fall through */ }
  }

  return "public/kern/media";
}

export function queueSync(projectId: string, action: "upload" | "delete" | "rename" | "move" | "mkdir", filePath: string, extra?: Record<string, string>) {
  db.insert(mediaSyncQueue).values({
    projectId,
    action,
    path: filePath,
    extra: extra ? JSON.stringify(extra) : null,
  }).run();
}

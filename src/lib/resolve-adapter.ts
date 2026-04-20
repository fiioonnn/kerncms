import { db } from "@/db";
import { mediaBuckets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createAdapter, type MediaAdapter } from "@/lib/media-adapters";

export function resolveAdapter(bucketId: string | null, projectId: string): MediaAdapter | null {
  if (!bucketId) {
    const defaultBucket = db.select().from(mediaBuckets)
      .where(eq(mediaBuckets.projectId, projectId))
      .all()
      .find((b) => b.isDefault);
    if (!defaultBucket) {
      const ghBucket = db.select().from(mediaBuckets)
        .where(eq(mediaBuckets.projectId, projectId))
        .all()
        .find((b) => b.provider === "github");
      return createAdapter("github", projectId, ghBucket?.config, ghBucket?.id);
    }
    return createAdapter(defaultBucket.provider, projectId, defaultBucket.config, defaultBucket.id);
  }

  const bucket = db.select().from(mediaBuckets).where(eq(mediaBuckets.id, bucketId)).get();
  if (!bucket) return null;
  return createAdapter(bucket.provider, bucket.projectId, bucket.config, bucketId);
}

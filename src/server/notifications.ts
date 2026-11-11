import "server-only";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";

type Kind = (typeof notifications.$inferInsert)["kind"];

/** Adds a notification for one user, or for everyone on the site when userId is null. */
export async function notify(siteId: string, userId: string | null, kind: Kind, title: string, href?: string) {
  await db.insert(notifications).values({ siteId, userId, kind, title, href });
}

export async function listNotifications(siteId: string, userId: string, limit = 20) {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.siteId, siteId), or(isNull(notifications.userId), eq(notifications.userId, userId))))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    href: row.href,
    createdAt: row.createdAt.toISOString(),
    read: row.readBy.includes(userId),
  }));
}

export async function markAllRead(siteId: string, userId: string) {
  await db
    .update(notifications)
    .set({ readBy: sql`${notifications.readBy} || ${JSON.stringify([userId])}::jsonb` })
    .where(
      and(
        eq(notifications.siteId, siteId),
        or(isNull(notifications.userId), eq(notifications.userId, userId)),
        sql`not (${notifications.readBy} ? ${userId})`,
      ),
    );
}

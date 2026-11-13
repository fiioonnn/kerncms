import "server-only";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";

type Kind = (typeof notifications.$inferInsert)["kind"];

/** Adds a notification for one user, or for everyone on the site when userId is null. */
export async function notify(siteId: string, userId: string | null, kind: Kind, title: string, href?: string) {
  await db.insert(notifications).values({ siteId, userId, kind, title, href });
}

/** Notifications this user sees: their own and the shared ones, minus those they deleted. */
export const visibleTo = (siteId: string, userId: string) =>
  and(
    eq(notifications.siteId, siteId),
    or(isNull(notifications.userId), eq(notifications.userId, userId)),
    sql`not (${notifications.dismissedBy} ? ${userId})`,
  );

export async function listNotifications(siteId: string, userId: string, limit = 20) {
  const rows = await db
    .select()
    .from(notifications)
    .where(visibleTo(siteId, userId))
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

/** Marks one notification (or all when id is omitted) as read for this user. */
export async function markRead(siteId: string, userId: string, id?: string) {
  await db
    .update(notifications)
    .set({ readBy: sql`${notifications.readBy} || ${JSON.stringify([userId])}::jsonb` })
    .where(and(visibleTo(siteId, userId), sql`not (${notifications.readBy} ? ${userId})`, id ? eq(notifications.id, id) : undefined));
}

/**
 * Deletes one notification (or all when id is omitted) from this user's list. Personal ones are
 * removed; shared ones are only hidden for this user, the rest of the team still sees them.
 */
export async function dismiss(siteId: string, userId: string, id?: string) {
  const one = id ? eq(notifications.id, id) : undefined;
  await db.delete(notifications).where(and(visibleTo(siteId, userId), eq(notifications.userId, userId), one));
  await db
    .update(notifications)
    .set({ dismissedBy: sql`${notifications.dismissedBy} || ${JSON.stringify([userId])}::jsonb` })
    .where(and(visibleTo(siteId, userId), isNull(notifications.userId), one));
}

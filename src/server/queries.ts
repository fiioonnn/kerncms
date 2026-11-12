import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { approvals, deploys, formSettings, formSubmissions, invites, mediaCleanup, memberships, sessions, trash, users } from "@/db/schema";
import type { Role } from "@/db/schema";
import { analyticsSummary } from "./analytics";
import { hashToken } from "./auth";
import { CONFIG_FILE, findCollection } from "./config";
import { getChangeSet, listEntries, listPages, readEntry, readGlobal, readPage, readRedirects } from "./content";
import { git, log, showFile, uncommittedFiles, unpublishedFiles } from "./git";
import { listMedia, mediaValue } from "./media";
import { mediaLocationCounts } from "./media-migrate";
import { publicCmsUrl, siteStorageConfig } from "./storage";
import { listNotifications } from "./notifications";
import { notificationFrom } from "./site-mail";
import { getSiteContext, getWorkspace, type Workspace } from "./sites";
import { listGrants } from "./oauth";

/* All functions here are for Server Components. They check access themselves. */

async function workspaceWithChanges() {
  const ws = await getWorkspace();
  const changes = await getChangeSet(ws.dir, ws.site.branch);
  return { ws, changes };
}

/* ---------- Pages ---------- */

export async function getPages() {
  const { ws, changes } = await workspaceWithChanges();
  return listPages(ws.dir, ws.config, changes);
}

/** A page by file name or by URL path (`/ueber-uns`). Falls back to the start page. */
export async function getPageForEditor(nameOrPath?: string | null) {
  const { ws, changes } = await workspaceWithChanges();
  const pages = await listPages(ws.dir, ws.config, changes);
  const summary =
    pages.find((p) => p.name === nameOrPath) ?? pages.find((p) => p.path === nameOrPath) ?? pages.find((p) => p.path === "/") ?? pages[0];
  if (!summary) return { pages, page: null, name: null };
  return { pages, page: await readPage(ws.dir, ws.config, summary.name), name: summary.name };
}

export async function getPage(name: string) {
  const ws = await getWorkspace();
  try {
    return await readPage(ws.dir, ws.config, name);
  } catch {
    notFound();
  }
}

/* ---------- Collections ---------- */

export async function getCollectionsOverview() {
  const { ws, changes } = await workspaceWithChanges();
  return Promise.all(
    ws.config.collections.map(async (collection) => {
      const entries = await listEntries(ws.dir, collection, changes);
      return {
        collection,
        count: entries.length,
        drafts: entries.filter((e) => e.status !== "live").length,
        lastUpdated: entries.map((e) => e.updatedAt).filter(Boolean).sort().at(-1) ?? null,
      };
    }),
  );
}

export async function getCollection(key: string) {
  const { ws, changes } = await workspaceWithChanges();
  const collection = findCollection(ws.config, key);
  if (!collection) notFound();
  return { collection, entries: await listEntries(ws.dir, collection, changes) };
}

export async function getEntry(key: string, id: string) {
  const { ws, changes } = await workspaceWithChanges();
  const collection = findCollection(ws.config, key);
  if (!collection) notFound();
  try {
    const values = await readEntry(ws.dir, collection, id);
    const file = path.posix.join(collection.path, id + (collection.format === "md" ? ".md" : ".json"));
    const history = await log(ws.dir, { file, limit: 20 });
    return { collection, id, values, history, status: (await listEntries(ws.dir, collection, changes)).find((e) => e.id === id)?.status ?? "live" };
  } catch {
    notFound();
  }
}

/* ---------- Globals ---------- */

export async function getGlobals() {
  const { ws, changes } = await workspaceWithChanges();
  return Promise.all(
    ws.config.globals.map(async (global) => ({
      global,
      values: await readGlobal(ws.dir, global),
      updatedAt: changes.lastChange.get(global.path)?.date ?? null,
      updatedBy: changes.lastChange.get(global.path)?.author ?? null,
    })),
  );
}

/* ---------- Media ---------- */

export async function getMedia() {
  const { ws, changes } = await workspaceWithChanges();
  return listMedia(ws.site.id, ws.dir, ws.config, changes);
}

/* ---------- History ---------- */

export type HistoryEntry = {
  sha: string;
  author: string;
  date: string;
  message: string;
  files: string[];
  published: boolean;
};

export async function getHistory(opts: { limit?: number; skip?: number; file?: string } = {}) {
  const ws = await getWorkspace();
  const [entries, liveShas, deployRows] = await Promise.all([
    log(ws.dir, { ref: "kern/draft", limit: opts.limit ?? 60, skip: opts.skip, file: opts.file }),
    git(ws.dir, ["rev-list", "--max-count=2000", ws.site.branch]).then((out) => new Set(out.split("\n").filter(Boolean))),
    db.select().from(deploys).where(eq(deploys.siteId, ws.site.id)).orderBy(desc(deploys.createdAt)).limit(30),
  ]);
  const history: HistoryEntry[] = entries.map((e) => ({
    sha: e.sha,
    author: e.author,
    date: e.date,
    message: e.message,
    files: e.files,
    published: liveShas.has(e.sha),
  }));
  return {
    history,
    deploys: deployRows.map((d) => ({
      id: d.id,
      status: d.status,
      message: d.message,
      commit: d.commit,
      steps: d.steps,
      createdAt: d.createdAt.toISOString(),
      finishedAt: d.finishedAt?.toISOString() ?? null,
    })),
  };
}

/** Old and new text of a file in a commit, for the diff view. */
export async function getCommitDiff(sha: string, file: string) {
  const ws = await getWorkspace();
  if (!/^[0-9a-f]{7,40}$/.test(sha)) notFound();
  const [before, after] = await Promise.all([showFile(ws.dir, `${sha}^`, file), showFile(ws.dir, sha, file)]);
  return { before: before ?? "", after: after ?? "" };
}

/** What is waiting to go live: unsaved files and committed but unpublished files. */
export async function getPendingChanges() {
  const ws = await getWorkspace();
  const [unsaved, unpublished] = await Promise.all([uncommittedFiles(ws.dir), unpublishedFiles(ws.dir, ws.site.branch)]);
  return { unsaved, unpublished };
}

/* ---------- Trash ---------- */

export async function getTrash() {
  const ctx = await getSiteContext();
  // Items older than 30 days are removed for good.
  await db.delete(trash).where(and(eq(trash.siteId, ctx.site.id), lt(trash.deletedAt, new Date(Date.now() - 30 * 86_400_000))));
  const rows = await db
    .select({ item: trash, by: users.name })
    .from(trash)
    .leftJoin(users, eq(users.id, trash.deletedBy))
    .where(eq(trash.siteId, ctx.site.id))
    .orderBy(desc(trash.deletedAt));
  return rows.map(({ item, by }) => ({
    id: item.id,
    kind: item.kind,
    label: item.label,
    path: item.path,
    meta: item.meta,
    deletedBy: by,
    deletedAt: item.deletedAt.toISOString(),
    expiresAt: new Date(item.deletedAt.getTime() + 30 * 86_400_000).toISOString(),
  }));
}

/* ---------- Approvals ---------- */

export async function getApprovals() {
  const ctx = await getSiteContext();
  const rows = await db
    .select({ approval: approvals, requester: users.name })
    .from(approvals)
    .leftJoin(users, eq(users.id, approvals.requestedBy))
    .where(eq(approvals.siteId, ctx.site.id))
    .orderBy(desc(approvals.createdAt))
    .limit(100);
  const reviewerIds = rows.map((r) => r.approval.reviewedBy).filter((id): id is string => Boolean(id));
  const reviewers = reviewerIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, reviewerIds)) : [];
  return rows.map(({ approval, requester }) => ({
    id: approval.id,
    title: approval.title,
    note: approval.note,
    files: approval.files,
    commit: approval.commit,
    status: approval.status,
    comment: approval.comment,
    requestedBy: requester,
    reviewedBy: reviewers.find((r) => r.id === approval.reviewedBy)?.name ?? null,
    createdAt: approval.createdAt.toISOString(),
    reviewedAt: approval.reviewedAt?.toISOString() ?? null,
  }));
}

/* ---------- Forms ---------- */

/** Notification and reply settings per configured form, with defaults for forms never configured. */
async function formSettingsOf(ws: Workspace) {
  const rows = await db.select().from(formSettings).where(eq(formSettings.siteId, ws.site.id));
  return Object.fromEntries(
    ws.config.forms.map((f) => {
      const row = rows.find((r) => r.form === f.key);
      return [
        f.key,
        {
          notify: row?.notify ?? false,
          recipients: row?.recipients ?? [],
          subject: row?.subject ?? "",
          replySubject: row?.replySubject ?? "",
          replyBody: row?.replyBody ?? "",
        },
      ];
    }),
  );
}

export async function getForms() {
  const ws = await getWorkspace("editor");
  const rows = await db
    .select()
    .from(formSubmissions)
    .where(eq(formSubmissions.siteId, ws.site.id))
    .orderBy(desc(formSubmissions.createdAt))
    .limit(500);
  return {
    forms: ws.config.forms,
    canConfigure: ws.role === "admin" || ws.role === "owner",
    settings: await formSettingsOf(ws),
    submissions: rows.map((r) => ({
      id: r.id,
      form: r.form,
      data: r.data,
      page: r.page,
      read: r.read,
      archived: r.archived,
      spam: r.spam,
      spamReason: r.spamReason,
      mailStatus: r.mailStatus,
      mailError: r.mailError,
      mailedAt: r.mailedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/* ---------- Team ---------- */

export async function getTeam() {
  const ctx = await getSiteContext();
  const [members, pending] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, role: memberships.role, since: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.siteId, ctx.site.id)),
    db
      .select()
      .from(invites)
      .where(and(eq(invites.siteId, ctx.site.id), gt(invites.expiresAt, new Date())))
      .orderBy(desc(invites.createdAt)),
  ]);
  const rank: Record<Role, number> = { owner: 0, admin: 1, editor: 2, viewer: 3 };
  return {
    me: ctx.user.id,
    myRole: ctx.role,
    members: members
      .sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name, "de"))
      .map((m) => ({ ...m, since: m.since.toISOString() })),
    invites: pending.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() })),
  };
}

/* ---------- Analytics ---------- */

export async function getAnalytics(days = 30) {
  const ctx = await getSiteContext();
  return analyticsSummary(ctx.site.id, days);
}

/* ---------- Settings ---------- */

export async function getSettings() {
  const ws = await getWorkspace();
  const [configSource, redirects] = await Promise.all([readFile(path.join(ws.dir, CONFIG_FILE), "utf8"), readRedirects(ws.dir, ws.config)]);
  return {
    site: {
      name: ws.site.name,
      key: ws.site.key,
      repoPath: ws.site.repoPath,
      branch: ws.site.branch,
      liveUrl: ws.site.liveUrl,
      requireApproval: ws.site.requireApproval,
      analyticsEnabled: ws.site.analyticsEnabled,
      publicKey: ws.site.publicKey,
      allowedOrigins: ws.site.allowedOrigins,
    },
    role: ws.role,
    config: ws.config,
    configSource,
    configFile: CONFIG_FILE,
    redirects,
    formSettings: await formSettingsOf(ws),
    sender: notificationFrom(ws.site.name),
    media: await mediaStorageInfo(ws),
  };
}

async function mediaStorageInfo(ws: Workspace) {
  const [custom, counts, pending] = await Promise.all([
    siteStorageConfig(ws.site.id),
    mediaLocationCounts(ws.site.id, ws.dir, ws.config),
    db.select({ id: mediaCleanup.id }).from(mediaCleanup).where(eq(mediaCleanup.siteId, ws.site.id)),
  ]);
  return {
    storage: ws.site.mediaStorage,
    custom: custom ? { ...custom, secretAccessKey: "" } : null,
    counts,
    cmsAvailable: Boolean(process.env.S3_BUCKET),
    cmsBaseUrl: `${publicCmsUrl()}/files/${ws.site.id}/`,
    publicUrlConfigured: Boolean(process.env.KERN_PUBLIC_URL),
    repoPrefix: mediaValue(ws.config, ""),
    pendingCleanup: pending.length,
  };
}

export type MediaStorageInfo = Awaited<ReturnType<typeof mediaStorageInfo>>;

/* ---------- Profile ---------- */

export async function getProfile() {
  const ctx = await getSiteContext();
  const rows = await db
    .select({ id: sessions.id, userAgent: sessions.userAgent, createdAt: sessions.createdAt })
    .from(sessions)
    .where(and(eq(sessions.userId, ctx.user.id), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.createdAt));
  const { cookies } = await import("next/headers");
  const current = hashToken((await cookies()).get("kern_session")?.value ?? "");
  return {
    user: ctx.user,
    sites: ctx.sites,
    sessions: rows.map((s) => ({ id: s.id.slice(0, 8), userAgent: s.userAgent, createdAt: s.createdAt.toISOString(), current: s.id === current })),
    apps: (await listGrants(ctx.user.id)).map((g) => ({
      id: g.id,
      app: g.app,
      createdAt: g.createdAt.toISOString(),
      lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
    })),
  };
}

/* ---------- Notifications ---------- */

export async function getNotifications() {
  const ctx = await getSiteContext();
  return listNotifications(ctx.site.id, ctx.user.id);
}

/* ---------- Dashboard ---------- */

export async function getDashboard() {
  const { ws, changes } = await workspaceWithChanges();
  const [pages, analytics, recent, unread, openApprovals] = await Promise.all([
    listPages(ws.dir, ws.config, changes),
    analyticsSummary(ws.site.id, 7),
    log(ws.dir, { ref: "kern/draft", limit: 8 }),
    db
      .select({ id: formSubmissions.id })
      .from(formSubmissions)
      .where(and(eq(formSubmissions.siteId, ws.site.id), eq(formSubmissions.read, false), eq(formSubmissions.archived, false), eq(formSubmissions.spam, false))),
    db.select({ id: approvals.id }).from(approvals).where(and(eq(approvals.siteId, ws.site.id), eq(approvals.status, "open"))),
  ]);
  return {
    user: ws.user,
    site: { name: ws.site.name, liveUrl: ws.site.liveUrl },
    pages,
    pendingChanges: changes.unsaved.size + changes.unpublished.size,
    analytics,
    recent: recent.map((r) => ({ sha: r.sha, author: r.author, date: r.date, message: r.message })),
    unreadForms: unread.length,
    openApprovals: openApprovals.length,
    collections: ws.config.collections.map((c) => ({ key: c.key, label: c.label, singular: c.singular, icon: c.icon })),
  };
}

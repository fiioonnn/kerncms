import "server-only";
import { and, count, desc, eq, gt, inArray, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, deploys, formSubmissions, memberships, pageViews, sessions, sites, users } from "@/db/schema";
import { requireAdmin } from "./auth";
import { getGithubApp, listInstallations } from "./github";
import { getPreview } from "./preview";
import { localReposAllowed } from "./sites";

/* Read models for /admin. Every function checks for a platform admin itself. */

async function lastDeploys(siteIds: string[]) {
  if (siteIds.length === 0) return new Map<string, { status: string; createdAt: string; message: string }>();
  const rows = await db
    .select()
    .from(deploys)
    .where(inArray(deploys.siteId, siteIds))
    .orderBy(desc(deploys.createdAt))
    .limit(500);
  const map = new Map<string, { status: string; createdAt: string; message: string }>();
  for (const row of rows) if (!map.has(row.siteId)) map.set(row.siteId, { status: row.status, createdAt: row.createdAt.toISOString(), message: row.message });
  return map;
}

export async function adminOverview() {
  await requireAdmin();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [[customerCount], [siteCount], [userCount], [views], [forms], recentDeploys, app] = await Promise.all([
    db.select({ n: count() }).from(customers).where(eq(customers.status, "active")),
    db.select({ n: count() }).from(sites),
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(pageViews).where(gt(pageViews.createdAt, since)),
    db.select({ n: count() }).from(formSubmissions).where(and(gt(formSubmissions.createdAt, since), eq(formSubmissions.spam, false))),
    db
      .select({ deploy: deploys, site: sites.name, by: users.name })
      .from(deploys)
      .innerJoin(sites, eq(sites.id, deploys.siteId))
      .leftJoin(users, eq(users.id, deploys.userId))
      .orderBy(desc(deploys.createdAt))
      .limit(10),
    getGithubApp().catch(() => null),
  ]);
  return {
    customers: customerCount.n,
    sites: siteCount.n,
    users: userCount.n,
    views30d: views.n,
    forms30d: forms.n,
    githubConfigured: Boolean(app),
    failedDeploys: recentDeploys.filter((d) => d.deploy.status === "failed").length,
    recentDeploys: recentDeploys.map((d) => ({
      id: d.deploy.id,
      site: d.site,
      siteId: d.deploy.siteId,
      by: d.by,
      status: d.deploy.status,
      message: d.deploy.message,
      createdAt: d.deploy.createdAt.toISOString(),
    })),
  };
}

export async function adminCustomers() {
  await requireAdmin();
  const [rows, siteRows] = await Promise.all([
    db.select().from(customers).orderBy(customers.name),
    db.select({ id: sites.id, name: sites.name, customerId: sites.customerId, liveUrl: sites.liveUrl }).from(sites),
  ]);
  const members = await db
    .select({ siteId: memberships.siteId, userId: memberships.userId })
    .from(memberships);
  return rows.map((c) => {
    const own = siteRows.filter((s) => s.customerId === c.id);
    const people = new Set(members.filter((m) => own.some((s) => s.id === m.siteId)).map((m) => m.userId));
    return { ...c, createdAt: c.createdAt.toISOString(), sites: own, users: people.size };
  });
}

export async function adminCustomer(id: string) {
  await requireAdmin();
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) return null;
  const own = await db.select().from(sites).where(eq(sites.customerId, id)).orderBy(sites.name);
  const people = own.length
    ? await db
        .select({ id: users.id, name: users.name, email: users.email, role: memberships.role, siteId: memberships.siteId })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(inArray(memberships.siteId, own.map((s) => s.id)))
    : [];
  const deploysBySite = await lastDeploys(own.map((s) => s.id));
  return {
    customer: { ...customer, createdAt: customer.createdAt.toISOString() },
    sites: own.map((s) => ({
      id: s.id,
      name: s.name,
      source: s.source,
      githubRepo: s.githubRepo,
      repoPath: s.repoPath,
      liveUrl: s.liveUrl,
      lastDeploy: deploysBySite.get(s.id) ?? null,
    })),
    people: people.map((p) => ({ ...p, site: own.find((s) => s.id === p.siteId)?.name ?? "" })),
  };
}

export async function adminSites() {
  await requireAdmin();
  const rows = await db
    .select({ site: sites, customer: customers.name })
    .from(sites)
    .leftJoin(customers, eq(customers.id, sites.customerId))
    .orderBy(sites.name);
  const ids = rows.map((r) => r.site.id);
  const [deploysBySite, memberCounts, viewCounts] = await Promise.all([
    lastDeploys(ids),
    ids.length
      ? db.select({ siteId: memberships.siteId, n: count() }).from(memberships).where(inArray(memberships.siteId, ids)).groupBy(memberships.siteId)
      : Promise.resolve([]),
    ids.length
      ? db
          .select({ siteId: pageViews.siteId, n: count() })
          .from(pageViews)
          .where(and(inArray(pageViews.siteId, ids), gt(pageViews.createdAt, new Date(Date.now() - 30 * 86_400_000))))
          .groupBy(pageViews.siteId)
      : Promise.resolve([]),
  ]);
  return rows.map(({ site, customer }) => ({
    id: site.id,
    key: site.key,
    name: site.name,
    customerId: site.customerId,
    customer,
    source: site.source,
    githubRepo: site.githubRepo,
    repoPath: site.repoPath,
    branch: site.branch,
    liveUrl: site.liveUrl,
    requireApproval: site.requireApproval,
    lastSyncedAt: site.lastSyncedAt?.toISOString() ?? null,
    createdAt: site.createdAt.toISOString(),
    members: memberCounts.find((m) => m.siteId === site.id)?.n ?? 0,
    views30d: viewCounts.find((v) => v.siteId === site.id)?.n ?? 0,
    lastDeploy: deploysBySite.get(site.id) ?? null,
    preview: getPreview(site.id).status,
  }));
}

export async function adminUsers() {
  await requireAdmin();
  const [rows, roles, lastSeen] = await Promise.all([
    db.select().from(users).orderBy(users.name),
    db
      .select({ userId: memberships.userId, role: memberships.role, site: sites.name, siteId: sites.id })
      .from(memberships)
      .innerJoin(sites, eq(sites.id, memberships.siteId)),
    db.select({ userId: sessions.userId, last: max(sessions.createdAt) }).from(sessions).groupBy(sessions.userId),
  ]);
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isAdmin: u.isAdmin,
    disabled: u.disabled,
    createdAt: u.createdAt.toISOString(),
    lastLogin: lastSeen.find((l) => l.userId === u.id)?.last?.toISOString() ?? null,
    sites: roles.filter((r) => r.userId === u.id).map((r) => ({ id: r.siteId, name: r.site, role: r.role })),
  }));
}

export async function adminGithub() {
  await requireAdmin();
  const app = await getGithubApp().catch(() => null);
  let installations: Awaited<ReturnType<typeof listInstallations>> = [];
  let error: string | null = null;
  if (app) {
    try {
      installations = await listInstallations();
    } catch (e) {
      error = (e as Error).message;
    }
  }
  return {
    app: app && { appId: app.appId, slug: app.slug, name: app.name, owner: app.owner },
    installations,
    error,
    publicUrl: process.env.KERN_PUBLIC_URL ?? null,
    localAllowed: localReposAllowed(),
  };
}

/** Options for selects in admin forms. */
export async function adminCustomerOptions() {
  await requireAdmin();
  const rows = await db.select({ id: customers.id, name: customers.name }).from(customers).where(sql`${customers.status} <> 'archived'`).orderBy(customers.name);
  return rows.map((r) => ({ label: r.name, value: r.id }));
}

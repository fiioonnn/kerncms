import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { and, asc, eq, notInArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { memberships, sites, type Role, type Site } from "@/db/schema";
import type { KernConfig } from "@/lib/kern-types";
import { requireUser, type SessionUser } from "./auth";
import { hostCustomer } from "./custom-domains";
import { CONFIG_FILE, loadConfig, parseConfig } from "./config";
import { ensureWorktree, followLiveSoon, isGitRepo, showFile } from "./git";
import { cloneDir, readRemoteConfig, syncSoon } from "./github";
import { RESTART_FILES, restartPreviewFor } from "./preview";
import { cleanupSoon } from "./storage";

/** Local folders are a development convenience; in production every site comes from GitHub. */
export function localReposAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.KERN_ALLOW_LOCAL_REPOS === "1";
}

export const SITE_COOKIE = "kern_site";

const roleRank: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export class ForbiddenError extends Error {
  constructor(message = "Dafür fehlen dir die Rechte.") {
    super(message);
  }
}

export function hasRole(role: Role, min: Role) {
  return roleRank[role] >= roleRank[min];
}

export type SiteContext = {
  user: SessionUser;
  site: Site;
  role: Role;
  sites: { id: string; name: string; liveUrl: string | null; role: Role }[];
};

/** The signed-in user and the site they are working on. Redirects to login or onboarding when missing. */
export const getSiteContext = cache(async (): Promise<SiteContext> => {
  const user = await requireUser();
  let rows = await db
    .select({ site: sites, role: memberships.role })
    .from(memberships)
    .innerJoin(sites, eq(sites.id, memberships.siteId))
    .where(eq(memberships.userId, user.id))
    .orderBy(asc(sites.name));
  // Platform admins can open every site, as owner.
  if (user.isAdmin) {
    const others = await db
      .select({ site: sites })
      .from(sites)
      .where(rows.length ? notInArray(sites.id, rows.map((r) => r.site.id)) : undefined)
      .orderBy(asc(sites.name));
    rows.push(...others.map((o) => ({ site: o.site, role: "owner" as Role })));
    rows.sort((a, b) => a.site.name.localeCompare(b.site.name, "de"));
  }
  // On a customer's own domain (cms.kundendomain.de) only that customer's sites exist.
  const customer = await hostCustomer();
  if (customer) rows = rows.filter((row) => row.site.customerId === customer.id);
  if (rows.length === 0) redirect(customer ? "/onboarding" : user.isAdmin ? "/admin/sites/new" : "/onboarding");
  const wanted = (await cookies()).get(SITE_COOKIE)?.value;
  const current = rows.find((row) => row.site.id === wanted) ?? rows[0];
  return {
    user,
    site: current.site,
    role: current.role,
    sites: rows.map((row) => ({ id: row.site.id, name: row.site.name, liveUrl: row.site.liveUrl, role: row.role })),
  };
});

export async function requireRole(min: Role) {
  const ctx = await getSiteContext();
  if (!hasRole(ctx.role, min)) throw new ForbiddenError();
  return ctx;
}

export type Workspace = SiteContext & { dir: string; config: KernConfig };

/** Site context plus the draft checkout and its parsed config. */
export const getWorkspace = cache(async (min: Role = "viewer"): Promise<Workspace> => {
  const ctx = await requireRole(min);
  const dir = await ensureWorktree(ctx.site);
  syncSoon(ctx.site);
  followLiveSoon(ctx.site.id, dir, ctx.site.branch, (files) => {
    if (files.some((f) => RESTART_FILES.test(f))) void restartPreviewFor(ctx.site.id);
  });
  cleanupSoon(ctx.site.id);
  const config = await loadConfig(dir);
  return { ...ctx, dir, config };
});

export function expandHome(input: string) {
  const trimmed = input.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/")) return path.join(os.homedir(), trimmed.slice(2));
  return path.resolve(trimmed);
}

/** Checks a local repository and reads its kern.config.yaml from the live branch. */
export async function inspectRepo(input: string) {
  const repoPath = expandHome(input);
  if (!existsSync(repoPath)) throw new Error(`Den Ordner ${repoPath} gibt es nicht.`);
  if (!(await isGitRepo(repoPath))) throw new Error(`${repoPath} ist kein Git-Repository.`);
  let source: string | null = null;
  let branch = "main";
  for (const candidate of ["main", "master"]) {
    source = await showFile(repoPath, candidate, CONFIG_FILE);
    if (source !== null) {
      branch = candidate;
      break;
    }
  }
  if (source === null) throw new Error(`Im Repository fehlt ${CONFIG_FILE} auf dem Branch main.`);
  const config = parseConfig(source);
  return { repoPath, config, branch: config.branch || branch };
}

export async function connectSite(userId: string, input: string, customerId?: string | null) {
  if (!localReposAllowed()) throw new Error("Lokale Ordner sind nur im Entwicklungsmodus erlaubt.");
  const { repoPath, config, branch } = await inspectRepo(input);
  const [existing] = await db.select().from(sites).where(eq(sites.key, config.site.id)).limit(1);
  let site = existing;
  if (site) {
    const [member] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.siteId, site.id), eq(memberships.userId, userId)))
      .limit(1);
    if (!member) throw new Error(`Die Website „${site.name}“ ist schon verbunden. Bitte lass dich einladen.`);
    if (site.repoPath !== repoPath) {
      [site] = await db.update(sites).set({ repoPath, branch }).where(eq(sites.id, site.id)).returning();
    }
  } else {
    [site] = await db
      .insert(sites)
      .values({ key: config.site.id, name: config.site.name, repoPath, branch, liveUrl: config.site.url || null, source: "local", customerId: customerId || null })
      .returning();
    await db.insert(memberships).values({ siteId: site.id, userId, role: "owner" });
  }
  await ensureWorktree(site);
  (await cookies()).set(SITE_COOKIE, site.id, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  return site;
}

async function uniqueKey(key: string) {
  let candidate = key;
  for (let i = 2; ; i++) {
    const [taken] = await db.select({ id: sites.id }).from(sites).where(eq(sites.key, candidate)).limit(1);
    if (!taken) return candidate;
    candidate = `${key}-${i}`;
  }
}

/** Connects a GitHub repository: checks kern.config.yaml remotely, then clones it into the data folder. */
export async function connectGithubSite(input: { installationId: string; repo: string; branch: string; customerId?: string | null }) {
  const source = await readRemoteConfig(input.installationId, input.repo, input.branch);
  const config = parseConfig(source);
  const [existing] = await db.select().from(sites).where(and(eq(sites.githubRepo, input.repo), eq(sites.source, "github"))).limit(1);
  if (existing) throw new Error(`${input.repo} ist schon als „${existing.name}“ verbunden.`);
  const id = randomUUID();
  const [site] = await db
    .insert(sites)
    .values({
      id,
      key: await uniqueKey(config.site.id),
      name: config.site.name,
      source: "github",
      githubRepo: input.repo,
      githubInstallationId: input.installationId,
      repoPath: cloneDir(id),
      branch: input.branch,
      liveUrl: config.site.url || null,
      customerId: input.customerId || null,
    })
    .returning();
  try {
    await ensureWorktree(site);
  } catch (error) {
    await db.delete(sites).where(eq(sites.id, site.id));
    throw error;
  }
  (await cookies()).set(SITE_COOKIE, site.id, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  return site;
}

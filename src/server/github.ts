import "server-only";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { eq } from "drizzle-orm";
import { parse } from "yaml";
import { db } from "@/db";
import { githubApp, sites, type Site } from "@/db/schema";
import { decrypt } from "./crypto";
import { DATA_DIR, DRAFT_BRANCH, git } from "./git";

/* ---------- App credentials ---------- */

export type GithubAppConfig = { appId: string; slug: string; name: string; privateKey: string; clientId: string; owner: string | null };

export async function getGithubApp(): Promise<GithubAppConfig | null> {
  const [row] = await db.select().from(githubApp).where(eq(githubApp.id, "default")).limit(1);
  if (row) {
    return { appId: row.appId, slug: row.slug, name: row.name, privateKey: decrypt(row.privateKey), clientId: row.clientId, owner: row.owner };
  }
  if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY) {
    return {
      appId: process.env.GITHUB_APP_ID,
      slug: process.env.GITHUB_APP_SLUG ?? "",
      name: process.env.GITHUB_APP_SLUG ?? "GitHub App",
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
      clientId: process.env.GITHUB_APP_CLIENT_ID ?? "",
      owner: null,
    };
  }
  return null;
}

async function requireApp() {
  const app = await getGithubApp();
  if (!app) throw new Error("Die GitHub App ist noch nicht eingerichtet. Ein Admin kann sie unter Admin → GitHub anlegen.");
  return app;
}

export async function appOctokit() {
  const app = await requireApp();
  return new Octokit({ authStrategy: createAppAuth, auth: { appId: app.appId, privateKey: app.privateKey } });
}

const tokens = ((globalThis as { __kernGhTokens?: Map<string, { token: string; expires: number }> }).__kernGhTokens ??= new Map());

/** Short-lived installation token, cached until 5 minutes before it expires. */
export async function installationToken(installationId: string) {
  const cached = tokens.get(installationId);
  if (cached && cached.expires - Date.now() > 5 * 60_000) return cached.token;
  const app = await requireApp();
  const auth = createAppAuth({ appId: app.appId, privateKey: app.privateKey });
  const result = await auth({ type: "installation", installationId: Number(installationId) });
  tokens.set(installationId, { token: result.token, expires: new Date(result.expiresAt).getTime() });
  return result.token;
}

export async function installationOctokit(installationId: string) {
  return new Octokit({ auth: await installationToken(installationId) });
}

/* ---------- Browsing ---------- */

function accountName(account: unknown) {
  const a = account as { login?: string; slug?: string; name?: string } | null;
  return a?.login ?? a?.slug ?? a?.name ?? "unbekannt";
}

export async function listInstallations() {
  const octokit = await appOctokit();
  const { data } = await octokit.apps.listInstallations({ per_page: 100 });
  return data.map((i) => ({
    id: String(i.id),
    account: accountName(i.account),
    type: i.target_type,
    avatar: i.account && "avatar_url" in i.account ? i.account.avatar_url : null,
  }));
}

export type GithubRepo = { fullName: string; private: boolean; defaultBranch: string; updatedAt: string | null; description: string | null };

export async function listRepos(installationId: string): Promise<GithubRepo[]> {
  const octokit = await installationOctokit(installationId);
  const repos = await octokit.paginate(octokit.apps.listReposAccessibleToInstallation, { per_page: 100 });
  return repos
    .map((r) => ({ fullName: r.full_name, private: r.private, defaultBranch: r.default_branch, updatedAt: r.pushed_at ?? r.updated_at ?? null, description: r.description }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function listBranches(installationId: string, fullName: string) {
  const octokit = await installationOctokit(installationId);
  const [owner, repo] = fullName.split("/");
  const branches = await octokit.paginate(octokit.repos.listBranches, { owner, repo, per_page: 100 });
  return branches.map((b) => b.name).filter((name) => name !== DRAFT_BRANCH);
}

/** Reads kern.config.yaml straight from GitHub, before anything is cloned. */
export async function readRemoteConfig(installationId: string, fullName: string, branch: string) {
  const octokit = await installationOctokit(installationId);
  const [owner, repo] = fullName.split("/");
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: "kern.config.yaml", ref: branch });
    if (Array.isArray(data) || data.type !== "file") throw new Error();
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch {
    throw new Error(`In ${fullName} fehlt kern.config.yaml auf dem Branch ${branch}.`);
  }
}

/* ---------- Git over HTTPS with the installation token ---------- */

function authArgs(token: string) {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  // Header instead of a URL with credentials, so the token never lands in .git/config.
  return ["-c", "credential.helper=", "-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`];
}

export function cloneDir(siteId: string) {
  return path.join(DATA_DIR, "sites", siteId, "repo.git");
}

async function remoteGit(site: Pick<Site, "githubInstallationId" | "repoPath">, args: string[]) {
  if (!site.githubInstallationId) throw new Error("Diese Website ist mit keiner GitHub-Installation verknüpft.");
  const token = await installationToken(site.githubInstallationId);
  return git(site.repoPath, [...authArgs(token), ...args]);
}

/** Bare clone of the site's repository into the CMS data folder. */
export async function cloneRepo(site: Site) {
  if (!site.githubRepo || !site.githubInstallationId) throw new Error("GitHub-Repository fehlt.");
  const dir = site.repoPath;
  if (existsSync(path.join(dir, "HEAD"))) return;
  await rm(dir, { recursive: true, force: true });
  await mkdir(path.dirname(dir), { recursive: true });
  const token = await installationToken(site.githubInstallationId);
  await git(path.dirname(dir), [...authArgs(token), "clone", "--bare", "-q", `https://github.com/${site.githubRepo}.git`, dir]);
  await git(dir, ["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"]);
  await fetchRemote(site);
}

async function refExists(dir: string, ref: string) {
  try {
    await git(dir, ["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches from GitHub and moves the local live branch to GitHub's state.
 * The draft branch is never overwritten; publishing merges it.
 */
export async function fetchRemote(site: Site) {
  await remoteGit(site, ["fetch", "-q", "--prune", "origin"]);
  const remoteLive = `refs/remotes/origin/${site.branch}`;
  if (await refExists(site.repoPath, remoteLive)) {
    await git(site.repoPath, ["update-ref", `refs/heads/${site.branch}`, remoteLive]);
  }
  // A draft pushed earlier (e.g. from another CMS instance) is picked up if we have none.
  const remoteDraft = `refs/remotes/origin/${DRAFT_BRANCH}`;
  if (!(await refExists(site.repoPath, `refs/heads/${DRAFT_BRANCH}`)) && (await refExists(site.repoPath, remoteDraft))) {
    await git(site.repoPath, ["update-ref", `refs/heads/${DRAFT_BRANCH}`, remoteDraft]);
  }
  await db.update(sites).set({ lastSyncedAt: new Date() }).where(eq(sites.id, site.id));
}

export async function pushBranches(site: Site, branches: string[]) {
  const refspecs = branches.map((b) => `refs/heads/${b}:refs/heads/${b}`);
  await remoteGit(site, ["push", "-q", "origin", ...refspecs]);
}

/* ---------- Background sync ---------- */

const lastSync = ((globalThis as { __kernGhSync?: Map<string, number> }).__kernGhSync ??= new Map());
const pushTimers = ((globalThis as { __kernGhPush?: Map<string, NodeJS.Timeout> }).__kernGhPush ??= new Map());

/** Fetches at most once a minute per site, without blocking the request. */
export function syncSoon(site: Site) {
  if (site.source !== "github") return;
  const last = lastSync.get(site.id) ?? 0;
  if (Date.now() - last < 60_000) return;
  lastSync.set(site.id, Date.now());
  void fetchRemote(site).catch((error) => console.warn("[kern] GitHub-Abgleich fehlgeschlagen:", (error as Error).message));
}

/** Pushes kern/draft a few seconds after the last save, so GitHub has a backup of unpublished work. */
export function pushDraftSoon(siteId: string) {
  clearTimeout(pushTimers.get(siteId));
  pushTimers.set(
    siteId,
    setTimeout(async () => {
      pushTimers.delete(siteId);
      try {
        const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
        if (site?.source === "github") await pushBranches(site, [DRAFT_BRANCH]);
      } catch (error) {
        console.warn("[kern] Entwurf konnte nicht zu GitHub übertragen werden:", (error as Error).message);
      }
    }, 5000),
  );
}

export function parseRemoteConfigName(source: string) {
  const raw = parse(source) as { site?: { id?: string; name?: string } } | null;
  return { id: raw?.site?.id ?? "", name: raw?.site?.name ?? "" };
}

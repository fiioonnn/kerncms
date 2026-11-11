import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import type { Site } from "@/db/schema";

export const DRAFT_BRANCH = "kern/draft";
export const DATA_DIR = path.resolve(process.env.KERN_DATA_DIR ?? ".kern-data");

export class GitError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
  }
}

export function git(cwd: string, args: string[], opts: { input?: string; env?: Record<string, string> } = {}) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      "git",
      args,
      { cwd, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...opts.env } },
      (error, stdout, stderr) => {
        if (error) reject(new GitError(`git ${args[0]} fehlgeschlagen: ${stderr.trim() || error.message}`, stderr));
        else resolve(stdout);
      },
    );
    if (opts.input !== undefined) {
      child.stdin?.end(opts.input);
    }
  });
}

/** Binary-safe `git show`. */
export function gitShowBuffer(cwd: string, spec: string) {
  return new Promise<Buffer>((resolve, reject) => {
    execFile("git", ["show", spec], { cwd, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new GitError(`git show fehlgeschlagen: ${stderr.toString().trim()}`, stderr.toString()));
      else resolve(stdout);
    });
  });
}

/* ---------- Per-site lock: git operations on one site never overlap ---------- */

const locks = ((globalThis as { __kernLocks?: Map<string, Promise<unknown>> }).__kernLocks ??= new Map());

export function withSiteLock<T>(siteId: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(siteId) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(fn)
    .then((result: T) => {
      // GitHub sites: back up the draft branch shortly after every change.
      void import("./github").then((m) => m.pushDraftSoon(siteId));
      return result;
    });
  locks.set(
    siteId,
    next.catch(() => {}),
  );
  return next;
}

/* ---------- Draft worktree ---------- */

export function worktreeDir(site: Pick<Site, "id">) {
  return path.join(DATA_DIR, "sites", site.id, "draft");
}

export async function isGitRepo(dir: string) {
  try {
    const out = await git(dir, ["rev-parse", "--show-toplevel"]);
    return path.resolve(out.trim()) === path.resolve(dir);
  } catch {
    return false;
  }
}

export async function branchExists(repo: string, branch: string) {
  try {
    await git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

/** Makes sure the CMS has its own worktree on `kern/draft` and returns its path. */
export async function ensureWorktree(site: Site) {
  const dir = worktreeDir(site);
  if (existsSync(path.join(dir, ".git"))) return dir;
  if (site.source === "github") await (await import("./github")).cloneRepo(site);

  await mkdir(path.dirname(dir), { recursive: true });
  await git(site.repoPath, ["worktree", "prune"]);
  if (!(await branchExists(site.repoPath, DRAFT_BRANCH))) {
    await git(site.repoPath, ["branch", DRAFT_BRANCH, site.branch]);
  }
  await git(site.repoPath, ["worktree", "add", "-q", dir, DRAFT_BRANCH]);
  if (site.source !== "github") await linkNodeModules(site.repoPath, dir);
  return dir;
}

/** The preview server needs the site's dependencies; share them instead of installing twice. */
export async function linkNodeModules(repo: string, dir: string) {
  const source = path.join(repo, "node_modules");
  const target = path.join(dir, "node_modules");
  // Only link to a real folder; a symlink here could point back at itself.
  try {
    if (!(await lstat(source)).isDirectory()) return false;
  } catch {
    return false;
  }
  try {
    await lstat(target);
    return true;
  } catch {
    await symlink(source, target, "dir");
    return true;
  }
}

export type Author = { name: string; email: string };

function authorEnv(author: Author): Record<string, string> {
  return {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: "kerncms",
    GIT_COMMITTER_EMAIL: "cms@kerncms.local",
  };
}

/** Files changed in the worktree but not committed yet. */
export async function uncommittedFiles(dir: string) {
  const out = await git(dir, ["status", "--porcelain", "-uall"]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^"|"$/g, ""))
    .map((file) => (file.includes(" -> ") ? file.split(" -> ")[1] : file))
    .filter((file) => file !== "node_modules");
}

/** Commits the given files (or everything) on the draft branch. Returns the new commit or null if nothing changed. */
export async function commit(dir: string, message: string, author: Author, files?: string[]) {
  if (files && files.length === 0) return null;
  // node_modules is a symlink the CMS creates in the draft checkout; it must never be committed.
  // With explicit files the exclude pathspec is left out: combined with deleted files, git
  // then reports node_modules as "ignored" and fails although it staged everything.
  const paths = files ? files.filter((f) => f !== "node_modules" && !f.startsWith("node_modules/")) : null;
  if (paths && paths.length === 0) return null;
  // A path that is neither on disk nor in the index (deletion already staged) would make git add fail.
  const addable = paths
    ? await (async () => {
        const indexed = new Set((await git(dir, ["ls-files", "-z", "--", ...paths])).split("\0").filter(Boolean));
        return paths.filter((p) => indexed.has(p) || existsSync(path.join(dir, p)));
      })()
    : [".", ":(exclude)node_modules"];
  if (addable.length > 0) await git(dir, ["add", "-A", "--", ...addable]);
  await git(dir, ["reset", "-q", "--", "node_modules"]).catch(() => {});
  const staged = await git(dir, ["diff", "--cached", "--name-only"]);
  if (!staged.trim()) return null;
  await git(dir, ["commit", "-q", "-m", message], { env: authorEnv(author) });
  return (await git(dir, ["rev-parse", "HEAD"])).trim();
}

/** Throws away uncommitted changes to the given files. */
export async function discard(dir: string, files: string[]) {
  if (files.length === 0) return;
  for (const file of files) {
    const tracked = await git(dir, ["ls-files", "--", file]);
    if (tracked.trim()) await git(dir, ["checkout", "HEAD", "--", file]);
    else await git(dir, ["clean", "-fq", "--", file]);
  }
}

/** Files that differ between the live branch and the draft branch (committed). */
export async function unpublishedFiles(dir: string, liveBranch: string) {
  const out = await git(dir, ["diff", "--name-status", `${liveBranch}...${DRAFT_BRANCH}`]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split("\t");
      return { status: status[0] as "A" | "M" | "D" | "R", file: rest.at(-1)! };
    });
}

/** Brings changes developers pushed to the live branch into the draft. */
export async function syncDraftWithLive(dir: string, liveBranch: string, author: Author) {
  const behind = (await git(dir, ["rev-list", "--count", `${DRAFT_BRANCH}..${liveBranch}`])).trim();
  if (behind === "0") return false;
  try {
    await git(dir, ["merge", "--no-edit", "-q", liveBranch, "-m", `Live-Stand von ${liveBranch} übernommen`], {
      env: authorEnv(author),
    });
  } catch (error) {
    await git(dir, ["merge", "--abort"]).catch(() => {});
    throw error;
  }
  return true;
}

/**
 * Publishes the draft: merges kern/draft into the live branch.
 * Works whether or not the live branch is checked out in the developer's repo.
 */
export async function publishDraft(repo: string, liveBranch: string, message: string, author: Author) {
  const bare = (await git(repo, ["rev-parse", "--is-bare-repository"])).trim() === "true";
  const current = bare ? "" : (await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  if (current === liveBranch) {
    // The live branch is checked out: merge in place so the working tree stays in sync.
    await git(repo, ["merge", "--no-ff", "-q", DRAFT_BRANCH, "-m", message], { env: authorEnv(author) });
  } else {
    // Not checked out: build the merge commit without touching any working tree.
    const tree = (await git(repo, ["merge-tree", "--write-tree", liveBranch, DRAFT_BRANCH])).split("\n")[0].trim();
    const parents = ["-p", liveBranch, "-p", DRAFT_BRANCH];
    const sha = (await git(repo, ["commit-tree", tree, ...parents, "-m", message], { env: authorEnv(author) })).trim();
    await git(repo, ["update-ref", `refs/heads/${liveBranch}`, sha]);
  }
  return (await git(repo, ["rev-parse", liveBranch])).trim();
}

export type LogEntry = { sha: string; author: string; email: string; date: string; message: string; files: string[] };

export async function log(dir: string, opts: { ref?: string; file?: string; limit?: number; skip?: number } = {}) {
  const args = [
    "log",
    opts.ref ?? "HEAD",
    `--max-count=${opts.limit ?? 50}`,
    `--skip=${opts.skip ?? 0}`,
    "--name-only",
    "--format=%x1e%H%x1f%an%x1f%ae%x1f%aI%x1f%s",
  ];
  if (opts.file) args.push("--follow", "--", opts.file);
  const out = await git(dir, args);
  return out
    .split("\x1e")
    .filter((chunk) => chunk.trim())
    .map((chunk): LogEntry => {
      const [head, ...rest] = chunk.split("\n");
      const [sha, author, email, date, message] = head.split("\x1f");
      return { sha, author, email, date, message, files: rest.filter(Boolean) };
    });
}

export async function showFile(dir: string, ref: string, file: string) {
  try {
    return await git(dir, ["show", `${ref}:${file}`]);
  } catch {
    return null;
  }
}

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "@/db";
import { projects, mediaSyncQueue } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { getOctokit } from "@/lib/github";
import { parseRepoString } from "@/lib/github-content";
import { mediaRoot, mediaDirForProject } from "@/lib/media-local";

function gitBlobSha(content: Buffer): string {
  const header = `blob ${content.length}\0`;
  return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(header), content])).digest("hex");
}

/** Collect all non-hidden file paths relative to base */
function walkLocal(dir: string, base: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".gitkeep") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkLocal(full, base));
    else results.push(path.relative(base, full));
  }
  return results;
}

/** Remove empty directories recursively */
function pruneEmptyDirs(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(dir, entry.name));
  }
  const remaining = fs.readdirSync(dir);
  if (remaining.length === 0) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// POST — pull latest media from GitHub, make local match remote exactly
export async function POST(request: Request) {
  await requireSession();
  const { projectId } = await request.json();

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  // Don't pull if there are pending local changes that haven't been pushed yet
  const pendingSync = db.select({ id: mediaSyncQueue.id }).from(mediaSyncQueue)
    .where(eq(mediaSyncQueue.projectId, projectId)).all();
  if (pendingSync.length > 0) {
    return NextResponse.json({ skipped: true, reason: "pending sync", pending: pendingSync.length });
  }

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project?.repo || !project?.branch) {
    return NextResponse.json({ error: "Project not configured" }, { status: 400 });
  }

  const parsed = parseRepoString(project.repo);
  if (!parsed) return NextResponse.json({ error: "Invalid repo" }, { status: 400 });

  const octokit = await getOctokit();
  if (!octokit) return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });

  const { owner, repo } = parsed;
  const mediaDir = mediaDirForProject(projectId);
  const mediaBase = `${mediaDir}/${projectId}`;

  // Get full repo tree
  const { data: ref } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${project.branch}` });
  const { data: tree } = await octokit.rest.git.getTree({
    owner, repo, tree_sha: ref.object.sha, recursive: "1",
  });

  // Build map of remote media files: relativePath -> sha
  const remoteFiles = new Map<string, string>();
  for (const entry of tree.tree) {
    if (entry.type !== "blob" || !entry.path || !entry.sha) continue;
    if (!entry.path.startsWith(mediaBase + "/")) continue;
    const rel = entry.path.slice(mediaBase.length + 1);
    if (path.basename(rel).startsWith(".") && path.basename(rel) !== ".gitkeep") continue;
    remoteFiles.set(rel, entry.sha);
  }

  const projectRoot = mediaRoot(projectId);

  // Ensure local root exists
  fs.mkdirSync(projectRoot, { recursive: true });

  // Get all local files
  const localFiles = new Set(walkLocal(projectRoot, projectRoot));

  let pulled = 0;
  let deleted = 0;

  console.log(`[media-pull] mediaBase=${mediaBase}, remoteFiles=${remoteFiles.size}, localFiles=${localFiles.size}`);

  // Download files that are on GitHub but missing or different locally
  for (const [rel, remoteSha] of remoteFiles) {
    const localPath = path.join(projectRoot, rel);

    // Check if local file matches remote
    if (fs.existsSync(localPath)) {
      const localContent = fs.readFileSync(localPath);
      const localSha = gitBlobSha(localContent);
      if (localSha === remoteSha) {
        localFiles.delete(rel);
        continue;
      }
      console.log(`[media-pull] overwriting ${rel} local=${localSha.slice(0,7)} remote=${remoteSha.slice(0,7)}`);
    } else {
      console.log(`[media-pull] downloading new ${rel}`);
    }

    // Download from GitHub
    try {
      const { data } = await octokit.rest.git.getBlob({ owner, repo, file_sha: remoteSha });
      const buffer = Buffer.from(data.content, "base64");
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, buffer);
      pulled++;
    } catch {
      // skip failed downloads
    }

    localFiles.delete(rel);
  }

  // Delete local files that don't exist on GitHub
  for (const staleRel of localFiles) {
    console.log(`[media-pull] deleting stale ${staleRel}`);
    const fullPath = path.join(projectRoot, staleRel);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      deleted++;
    }
  }

  // Clean up empty directories
  pruneEmptyDirs(projectRoot);
  // Re-create root if it was pruned
  fs.mkdirSync(projectRoot, { recursive: true });

  return NextResponse.json({ pulled, deleted, remoteTotal: remoteFiles.size });
}

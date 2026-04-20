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

function walkDir(dir: string, base: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".gitkeep") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full, base));
    else results.push(path.relative(base, full));
  }
  return results;
}

// GET — return pending sync count
export async function GET(request: Request) {
  await requireSession();
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) return NextResponse.json({ pending: 0 });

  const count = db
    .select({ id: mediaSyncQueue.id })
    .from(mediaSyncQueue)
    .where(eq(mediaSyncQueue.projectId, projectId))
    .all().length;

  return NextResponse.json({ pending: count });
}

// POST — execute sync: diff local vs GitHub and push one commit
export async function POST(request: Request) {
  await requireSession();
  const { projectId } = await request.json();

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  // Check queue
  const queueEntries = db
    .select()
    .from(mediaSyncQueue)
    .where(eq(mediaSyncQueue.projectId, projectId))
    .all();

  if (queueEntries.length === 0) {
    return NextResponse.json({ pending: 0, synced: false });
  }

  // Get project
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project?.repo || !project?.branch) {
    return NextResponse.json({ error: "Project not configured" }, { status: 400 });
  }

  const parsed = parseRepoString(project.repo);
  if (!parsed) return NextResponse.json({ error: "Invalid repo" }, { status: 400 });

  const octokit = await getOctokit();
  if (!octokit) return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });

  const mediaDir = mediaDirForProject(projectId);
  const mediaBase = `${mediaDir}/${projectId}`;
  const { owner, repo } = parsed;

  try {
    // Get GitHub tree
    const { data: ref } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${project.branch}` });
    const latestSha = ref.object.sha;
    const { data: baseCommit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: latestSha });
    const { data: fullTree } = await octokit.rest.git.getTree({ owner, repo, tree_sha: latestSha, recursive: "1" });

    // Build remote file map: repoPath -> sha
    const remoteFiles = new Map<string, string>();
    for (const entry of fullTree.tree) {
      if (entry.type === "blob" && entry.path && entry.sha && entry.path.startsWith(mediaBase + "/")) {
        remoteFiles.set(entry.path, entry.sha);
      }
    }

    // Walk local files and diff
    const projectRoot = mediaRoot(projectId);
    const localFiles = walkDir(projectRoot, projectRoot);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const treeItems: any[] = [];
    const processedPaths = new Set<string>();

    console.log(`[media-sync] mediaBase=${mediaBase}, projectRoot=${projectRoot}, localFiles=${localFiles.length}, remoteFiles=${remoteFiles.size}`);

    // Upload new/modified files
    for (const localRel of localFiles) {
      const ghPath = `${mediaBase}/${localRel}`;
      processedPaths.add(ghPath);

      const localContent = fs.readFileSync(path.join(projectRoot, localRel));
      const localSha = gitBlobSha(localContent);
      const remoteSha = remoteFiles.get(ghPath);

      if (remoteSha === localSha) continue; // unchanged

      console.log(`[media-sync] changed: ${ghPath} local=${localSha.slice(0,7)} remote=${remoteSha?.slice(0,7) ?? "none"}`);

      const { data: blob } = await octokit.rest.git.createBlob({
        owner, repo, content: localContent.toString("base64"), encoding: "base64",
      });
      treeItems.push({ path: ghPath, mode: "100644", type: "blob", sha: blob.sha });
    }

    // Delete files that exist on GitHub but not locally
    for (const [ghPath] of remoteFiles) {
      if (!processedPaths.has(ghPath) && (path.basename(ghPath) === ".gitkeep" || !path.basename(ghPath).startsWith("."))) {
        console.log(`[media-sync] delete: ${ghPath}`);
        treeItems.push({ path: ghPath, mode: "100644", type: "blob", sha: null });
      }
    }

    console.log(`[media-sync] treeItems=${treeItems.length}`);

    if (treeItems.length === 0) {
      const entryIds = queueEntries.map((e) => e.id);
      for (const id of entryIds) {
        db.delete(mediaSyncQueue).where(eq(mediaSyncQueue.id, id)).run();
      }
      return NextResponse.json({ pending: 0, synced: true, noChanges: true });
    }

    // Create tree + commit
    const { data: newTree } = await octokit.rest.git.createTree({
      owner, repo, base_tree: baseCommit.tree.sha, tree: treeItems,
    });

    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner, repo,
      message: `kerncms: sync ${treeItems.length} media change${treeItems.length === 1 ? "" : "s"}`,
      tree: newTree.sha,
      parents: [latestSha],
    });

    await octokit.rest.git.updateRef({ owner, repo, ref: `heads/${project.branch}`, sha: newCommit.sha });

    // Clear queue only after successful push
    const entryIds = queueEntries.map((e) => e.id);
    for (const id of entryIds) {
      db.delete(mediaSyncQueue).where(eq(mediaSyncQueue.id, id)).run();
    }

    return NextResponse.json({ pending: 0, synced: true, commitSha: newCommit.sha });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    console.error("[media-sync] push error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

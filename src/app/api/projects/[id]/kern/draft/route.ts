import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, pendingChanges } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { parseRepoString, getFileContent } from "@/lib/github-content";
import { getOctokit } from "@/lib/github";
import { writeLocalFile, deleteLocalFile } from "@/lib/local-content";

function getProject(id: string) {
  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project?.repo || !project?.branch) return null;
  const parsed = parseRepoString(project.repo);
  if (!parsed) return null;
  return { ...parsed, branch: project.branch, srcDir: project.srcDir, id: project.id, localPath: project.localPath };
}

function getRawProject(id: string) {
  return db.select().from(projects).where(eq(projects.id, id)).get();
}

const DELETE_SENTINEL = "__KERN_DELETE__";

// GET — list pending changes for this project
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const changes = db
    .select({ filePath: pendingChanges.filePath, content: pendingChanges.content, updatedAt: pendingChanges.updatedAt })
    .from(pendingChanges)
    .where(eq(pendingChanges.projectId, id))
    .all();

  return NextResponse.json({
    changes: changes.map((c) => ({
      filename: c.filePath,
      status: c.content === DELETE_SENTINEL ? "deleted" : "modified",
      updatedAt: c.updatedAt,
    })),
    totalChanges: changes.length,
  });
}

// POST — save or remove a pending change
// If content matches original → remove the pending change
// If content differs → upsert pending change
// If action === "delete" → mark file for deletion
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const body = await request.json();
  const { path, action } = body;

  if (action === "delete") {
    db.insert(pendingChanges)
      .values({ projectId: id, filePath: path, content: DELETE_SENTINEL, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [pendingChanges.projectId, pendingChanges.filePath],
        set: { content: DELETE_SENTINEL, updatedAt: new Date() },
      })
      .run();
    return NextResponse.json({ action: "deleted" });
  }

  const { content, original } = body;
  const contentStr = JSON.stringify(content, null, 2);
  const originalStr = JSON.stringify(original, null, 2);

  if (contentStr === originalStr) {
    db.delete(pendingChanges)
      .where(and(eq(pendingChanges.projectId, id), eq(pendingChanges.filePath, path)))
      .run();
    return NextResponse.json({ action: "removed" });
  }

  db.insert(pendingChanges)
    .values({ projectId: id, filePath: path, content: contentStr, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [pendingChanges.projectId, pendingChanges.filePath],
      set: { content: contentStr, updatedAt: new Date() },
    })
    .run();

  return NextResponse.json({ action: "saved" });
}

// PUT — publish all pending changes (commit to GitHub, or write to local filesystem)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const project = getRawProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const changes = db
    .select()
    .from(pendingChanges)
    .where(eq(pendingChanges.projectId, id))
    .all();

  if (changes.length === 0) {
    return NextResponse.json({ error: "No changes to publish" }, { status: 400 });
  }

  if (project.localPath) {
    for (const change of changes) {
      if (change.content === DELETE_SENTINEL) {
        deleteLocalFile(project.localPath, change.filePath);
      } else {
        writeLocalFile(project.localPath, change.filePath, change.content + "\n");
      }
    }
    db.delete(pendingChanges).where(eq(pendingChanges.projectId, id)).run();
    return NextResponse.json({ success: true, local: true });
  }

  const p = getProject(id);
  if (!p) return NextResponse.json({ error: "No repo configured" }, { status: 400 });
  const branch = body?.targetBranch || p.branch;

  const octokit = await getOctokit();
  if (!octokit) return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });

  // Get the current commit SHA of the base branch
  const { data: ref } = await octokit.rest.git.getRef({
    owner: p.owner, repo: p.repo, ref: `heads/${branch}`,
  });
  const baseSha = ref.object.sha;

  // Get the base tree
  const { data: baseCommit } = await octokit.rest.git.getCommit({
    owner: p.owner, repo: p.repo, commit_sha: baseSha,
  });

  // Create blobs for modified files, null SHA for deletions
  const treeItems = await Promise.all(
    changes.map(async (change) => {
      if (change.content === DELETE_SENTINEL) {
        return {
          path: change.filePath,
          mode: "100644" as const,
          type: "blob" as const,
          sha: null as unknown as string,
        };
      }
      const { data: blob } = await octokit.rest.git.createBlob({
        owner: p.owner, repo: p.repo,
        content: change.content + "\n",
        encoding: "utf-8",
      });
      return {
        path: change.filePath,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      };
    })
  );

  // Create a new tree
  const { data: newTree } = await octokit.rest.git.createTree({
    owner: p.owner, repo: p.repo,
    base_tree: baseCommit.tree.sha,
    tree: treeItems,
  });

  // Create a commit
  const modified = changes.filter((c) => c.content !== DELETE_SENTINEL);
  const deleted = changes.filter((c) => c.content === DELETE_SENTINEL);
  const parts: string[] = [];
  if (modified.length > 0) parts.push(`update ${modified.map((c) => c.filePath.split("/").pop()).join(", ")}`);
  if (deleted.length > 0) parts.push(`delete ${deleted.map((c) => c.filePath.split("/").pop()).join(", ")}`);
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner: p.owner, repo: p.repo,
    message: `kerncms: ${parts.join(", ")}`,
    tree: newTree.sha,
    parents: [baseSha],
  });

  // Update the branch ref
  await octokit.rest.git.updateRef({
    owner: p.owner, repo: p.repo,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
  });

  // Clear pending changes
  db.delete(pendingChanges).where(eq(pendingChanges.projectId, id)).run();

  return NextResponse.json({ success: true, commitSha: newCommit.sha });
}

// DELETE — discard pending changes (all, or single file via ?path=...)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");

  if (path) {
    db.delete(pendingChanges).where(and(eq(pendingChanges.projectId, id), eq(pendingChanges.filePath, path))).run();
  } else {
    db.delete(pendingChanges).where(eq(pendingChanges.projectId, id)).run();
  }

  return NextResponse.json({ success: true });
}

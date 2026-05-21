import { NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin", "editor", "viewer"]);

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project || !project.repo || !project.branch) {
    return NextResponse.json({ error: "Project not configured" }, { status: 400 });
  }

  const octokit = await getOctokit();
  if (!octokit) {
    return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });
  }

  const [owner, repo] = project.repo.split("/");

  // Fetch the full directory tree in one call
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${project.branch}`,
  });

  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: refData.object.sha,
    recursive: "1",
  });

  const allDirs = new Set(
    tree.tree
      .filter((item) => item.type === "tree" && item.path)
      .map((item) => item.path!),
  );

  // If project has stored dirs, check those specific paths
  const srcDir = project.srcDir;
  const publicDir = project.publicDir;

  let contentPath: string | null = null;
  let globalsPath: string | null = null;
  let mediaPath: string | null = null;

  if (srcDir) {
    // Exact check for configured paths
    if (allDirs.has(`${srcDir}/kern/content`)) contentPath = `${srcDir}/kern/content`;
    if (allDirs.has(`${srcDir}/kern/globals`)) globalsPath = `${srcDir}/kern/globals`;
  } else {
    // Recursive search: find any */kern/content or kern/content
    for (const dir of allDirs) {
      if (!contentPath && (dir === "kern/content" || dir.endsWith("/kern/content"))) {
        contentPath = dir;
      }
      if (!globalsPath && (dir === "kern/globals" || dir.endsWith("/kern/globals"))) {
        globalsPath = dir;
      }
    }
  }

  if (publicDir) {
    if (allDirs.has(`${publicDir}/kern/media`)) mediaPath = `${publicDir}/kern/media`;
  } else {
    for (const dir of allDirs) {
      if (dir === "kern/media" || dir.endsWith("/kern/media")) {
        mediaPath = dir;
        break;
      }
    }
  }

  const hasContent = contentPath !== null;
  const hasGlobals = globalsPath !== null;
  const hasMedia = mediaPath !== null;
  const installed = hasContent && hasGlobals && hasMedia;

  if (installed !== project.kernInstalled) {
    db.update(projects)
      .set({ kernInstalled: installed })
      .where(eq(projects.id, id))
      .run();
  }

  return NextResponse.json({
    installed,
    hasContent,
    hasGlobals,
    hasMedia,
    contentPath,
    globalsPath,
    mediaPath,
  });
}

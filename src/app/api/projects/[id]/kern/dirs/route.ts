import { NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const { searchParams } = new URL(request.url);
  const recursive = searchParams.get("recursive") === "1";

  if (recursive) {
    // Full recursive tree for monorepos
    const { data: ref } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${project.branch}`,
    });

    const { data: tree } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: ref.object.sha,
      recursive: "1",
    });

    const dirs = tree.tree
      .filter((item) => item.type === "tree" && item.path)
      .map((item) => item.path!)
      .filter((p) => !p.startsWith(".") && !p.includes("node_modules") && !p.includes(".git"))
      .sort();

    return NextResponse.json(dirs);
  }

  // Top-level directories only
  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: "",
    ref: project.branch,
  });

  const dirs = (Array.isArray(data) ? data : [])
    .filter((item) => item.type === "dir")
    .map((item) => item.name)
    .sort();

  return NextResponse.json(dirs);
}

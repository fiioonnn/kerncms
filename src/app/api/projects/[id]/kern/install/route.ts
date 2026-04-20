import { NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { HELPERS_TS } from "@/lib/kern-helpers-template";

const EXAMPLE_CONTENT = JSON.stringify(
  {
    $schema: "kern",
    title: "Example Page",
    slug: "example",
    body: "Hello from kern.",
  },
  null,
  2,
);

const EXAMPLE_SEO = JSON.stringify(
  {
    $schema: "kern",
    siteName: "My Site",
    titleTemplate: "%s | My Site",
    defaultDescription: "A site powered by kern.",
  },
  null,
  2,
);

const EXAMPLE_TYPES = JSON.stringify(
  {
    content: {
      default: {
        example: {
          title: "text",
          slug: "text",
          body: "textarea",
        },
      },
    },
    globals: {
      "example-seo": {
        siteName: "text",
        titleTemplate: "text",
        defaultDescription: "textarea",
      },
    },
  },
  null,
  2,
);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project || !project.repo || !project.branch) {
    return NextResponse.json({ error: "Project not configured" }, { status: 400 });
  }

  const octokit = await getOctokit();
  if (!octokit) {
    return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });
  }

  const { srcDir, publicDir, branch: targetBranch } = await request.json();
  if (!srcDir || !publicDir) {
    return NextResponse.json({ error: "srcDir and publicDir are required" }, { status: 400 });
  }

  const installBranch = targetBranch || project.branch;
  const [owner, repo] = project.repo.split("/");

  const files = [
    { path: `${srcDir}/kern/content/default/example.json`, content: EXAMPLE_CONTENT },
    { path: `${srcDir}/kern/globals/example-seo.json`, content: EXAMPLE_SEO },
    { path: `${srcDir}/kern/types.json`, content: EXAMPLE_TYPES },
    { path: `${srcDir}/kern/helpers.ts`, content: HELPERS_TS },
    { path: `${publicDir}/kern/media/.gitkeep`, content: "" },
  ];

  // Get the latest commit SHA on the branch
  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${installBranch}`,
  });
  const latestCommitSha = ref.object.sha;

  // Get the tree of the latest commit
  const { data: latestCommit } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: latestCommitSha,
  });

  // Create blobs for each file
  const treeItems = await Promise.all(
    files.map(async (file) => {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: file.content,
        encoding: "utf-8",
      });
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      };
    }),
  );

  // Create a new tree with the files
  const { data: newTree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: latestCommit.tree.sha,
    tree: treeItems,
  });

  // Create a commit
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: "kerncms: install kern content structure",
    tree: newTree.sha,
    parents: [latestCommitSha],
  });

  // Update the branch reference
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${installBranch}`,
    sha: newCommit.sha,
  });

  // Store chosen dirs and mark as installed
  db.update(projects)
    .set({ srcDir, publicDir, kernInstalled: true })
    .where(eq(projects.id, id))
    .run();

  return NextResponse.json({ success: true, commitSha: newCommit.sha });
}

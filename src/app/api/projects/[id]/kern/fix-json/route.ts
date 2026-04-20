import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { getFileContent, parseRepoString } from "@/lib/github-content";
import { getOctokit } from "@/lib/github";
import { getAIResponse } from "@/lib/ai/provider";

function getKernBase(srcDir?: string | null) {
  return (srcDir ? `${srcDir}/kern` : "kern").replace(/^\//, "");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const { filePath, error } = await request.json();

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project?.repo || !project?.branch) {
    return NextResponse.json({ error: "No repo configured" }, { status: 400 });
  }

  const parsed = parseRepoString(project.repo);
  if (!parsed) return NextResponse.json({ error: "Invalid repo" }, { status: 400 });

  const rawContent = await getFileContent(parsed.owner, parsed.repo, project.branch, filePath);
  if (!rawContent) {
    return NextResponse.json({ error: "Could not read file from GitHub" }, { status: 404 });
  }

  const fixed = await getAIResponse(
    `Fix this JSON file. It has the following error:\n${error}\n\nHere is the broken JSON:\n\`\`\`json\n${rawContent}\n\`\`\`\n\nReturn ONLY the fixed, valid JSON. No explanation, no markdown fences, just the raw JSON.`,
    "You are a JSON repair tool. You fix syntax errors in JSON files while preserving all data. Return only valid JSON, nothing else.",
  );

  const trimmed = fixed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    JSON.parse(trimmed);
  } catch (e) {
    return NextResponse.json({ error: `AI returned invalid JSON: ${(e as Error).message}` }, { status: 422 });
  }

  const octokit = await getOctokit();
  if (!octokit) {
    return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });
  }

  const { data: ref } = await octokit.rest.git.getRef({
    owner: parsed.owner, repo: parsed.repo, ref: `heads/${project.branch}`,
  });
  const baseSha = ref.object.sha;
  const { data: baseCommit } = await octokit.rest.git.getCommit({
    owner: parsed.owner, repo: parsed.repo, commit_sha: baseSha,
  });

  const { data: blob } = await octokit.rest.git.createBlob({
    owner: parsed.owner, repo: parsed.repo,
    content: Buffer.from(trimmed + "\n", "utf8").toString("base64"),
    encoding: "base64",
  });

  const { data: tree } = await octokit.rest.git.createTree({
    owner: parsed.owner, repo: parsed.repo,
    base_tree: baseCommit.tree.sha,
    tree: [{ path: filePath, mode: "100644", type: "blob", sha: blob.sha }],
  });

  const { data: commit } = await octokit.rest.git.createCommit({
    owner: parsed.owner, repo: parsed.repo,
    message: `kerncms: repair JSON syntax in ${filePath.split("/").pop()}`,
    tree: tree.sha,
    parents: [baseSha],
  });

  await octokit.rest.git.updateRef({
    owner: parsed.owner, repo: parsed.repo,
    ref: `heads/${project.branch}`,
    sha: commit.sha,
  });

  return NextResponse.json({ success: true, commitSha: commit.sha });
}

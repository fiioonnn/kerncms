import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { getOctokit } from "@/lib/github";

export async function GET(request: Request, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  await requireSession();
  const { owner, repo } = await params;
  const branch = new URL(request.url).searchParams.get("branch") || "main";

  const octokit = await getOctokit();
  if (!octokit) return NextResponse.json([], { status: 503 });

  try {
    const { data: ref } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const { data: tree } = await octokit.rest.git.getTree({
      owner, repo, tree_sha: ref.object.sha, recursive: "1",
    });

    const files = tree.tree
      .filter((e) => e.type === "blob" && e.path)
      .map((e) => e.path!);

    return NextResponse.json(files);
  } catch {
    return NextResponse.json([]);
  }
}

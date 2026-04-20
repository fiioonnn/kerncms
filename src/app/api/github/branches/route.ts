import { NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";
import { requireSession } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  await requireSession();

  const octokit = await getOctokit();
  if (!octokit) return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });

  const { owner, repo, name, from } = await request.json();

  // Get SHA of source branch
  const { data: ref } = await octokit.rest.git.getRef({
    owner, repo, ref: `heads/${from}`,
  });

  // Create new branch
  await octokit.rest.git.createRef({
    owner, repo,
    ref: `refs/heads/${name}`,
    sha: ref.object.sha,
  });

  return NextResponse.json({ success: true });
}

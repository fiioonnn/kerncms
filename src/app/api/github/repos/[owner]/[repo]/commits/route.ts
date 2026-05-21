import { NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";
import { requireSession } from "@/lib/auth-helpers";

export async function GET(request: Request, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  await requireSession();

  const octokit = await getOctokit();
  if (!octokit) {
    return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });
  }

  const { owner, repo } = await params;
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get("branch") || "main";
  const path = searchParams.get("path") || undefined;

  const { data } = await octokit.rest.repos.listCommits({
    owner,
    repo,
    sha: branch,
    path,
    per_page: 30,
  });

  const result = data.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    date: c.commit.committer?.date ?? c.commit.author?.date ?? null,
    author: c.commit.author?.name ?? null,
  }));

  return NextResponse.json(result);
}

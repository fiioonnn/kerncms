import { NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";
import { requireSession } from "@/lib/auth-helpers";

export async function GET(_: Request, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  await requireSession();

  const octokit = await getOctokit();
  if (!octokit) {
    return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });
  }

  const { owner, repo } = await params;

  const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
    owner,
    repo,
    per_page: 100,
  });

  const result = branches.map((b) => b.name);

  return NextResponse.json(result);
}

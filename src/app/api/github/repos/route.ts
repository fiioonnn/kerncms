import { NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";
import { requireSession } from "@/lib/auth-helpers";

export async function GET() {
  await requireSession();

  const octokit = await getOctokit();
  if (!octokit) {
    return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });
  }

  const repos = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, {
    per_page: 100,
  });

  const result = repos.map((r) => ({
    id: String(r.id),
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
  }));

  return NextResponse.json(result);
}

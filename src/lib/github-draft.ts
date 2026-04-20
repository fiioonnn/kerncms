import { getOctokit } from "@/lib/github";

const DRAFT_BRANCH = "kern/draft";

export async function ensureDraftBranch(owner: string, repo: string, baseBranch: string) {
  const octokit = await getOctokit();
  if (!octokit) throw new Error("GitHub App not configured");

  // Check if draft branch exists
  try {
    await octokit.rest.git.getRef({ owner, repo, ref: `heads/${DRAFT_BRANCH}` });
    return DRAFT_BRANCH;
  } catch {
    // Doesn't exist — create from base branch
  }

  const { data: baseRef } = await octokit.rest.git.getRef({
    owner, repo, ref: `heads/${baseBranch}`,
  });

  await octokit.rest.git.createRef({
    owner, repo,
    ref: `refs/heads/${DRAFT_BRANCH}`,
    sha: baseRef.object.sha,
  });

  return DRAFT_BRANCH;
}

export async function saveFileToDraft(
  owner: string, repo: string, path: string, content: string, message: string,
) {
  const octokit = await getOctokit();
  if (!octokit) throw new Error("GitHub App not configured");

  // Get current file SHA if it exists on draft branch
  let sha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner, repo, path, ref: DRAFT_BRANCH,
    });
    if ("sha" in data) sha = data.sha;
  } catch {
    // File doesn't exist yet on draft
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo, path,
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch: DRAFT_BRANCH,
    ...(sha ? { sha } : {}),
  });
}

export async function getDraftChanges(owner: string, repo: string, baseBranch: string) {
  const octokit = await getOctokit();
  if (!octokit) throw new Error("GitHub App not configured");

  // Check if draft branch exists
  try {
    await octokit.rest.git.getRef({ owner, repo, ref: `heads/${DRAFT_BRANCH}` });
  } catch {
    return { exists: false, changes: [], totalChanges: 0 };
  }

  const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
    owner, repo,
    basehead: `${baseBranch}...${DRAFT_BRANCH}`,
  });

  const changes = (data.files ?? []).map((f) => ({
    filename: f.filename,
    status: f.status as string,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }));

  return {
    exists: true,
    changes,
    totalChanges: changes.length,
    ahead: data.ahead_by,
    behind: data.behind_by,
  };
}

export async function publishDraft(owner: string, repo: string, baseBranch: string) {
  const octokit = await getOctokit();
  if (!octokit) throw new Error("GitHub App not configured");

  // Merge draft into base
  await octokit.rest.repos.merge({
    owner, repo,
    base: baseBranch,
    head: DRAFT_BRANCH,
    commit_message: "kerncms: publish content changes",
  });

  // Delete draft branch
  await octokit.rest.git.deleteRef({
    owner, repo,
    ref: `heads/${DRAFT_BRANCH}`,
  });
}

export async function discardDraft(owner: string, repo: string) {
  const octokit = await getOctokit();
  if (!octokit) throw new Error("GitHub App not configured");

  try {
    await octokit.rest.git.deleteRef({
      owner, repo,
      ref: `heads/${DRAFT_BRANCH}`,
    });
  } catch {
    // Branch didn't exist
  }
}

export { DRAFT_BRANCH };

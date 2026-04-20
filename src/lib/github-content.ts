import { getOctokit } from "@/lib/github";

type TreeEntry = {
  path: string;
  type: "blob" | "tree";
  sha?: string;
  size?: number;
};

export async function getRepoTree(owner: string, repo: string, branch: string, commitSha?: string) {
  const octokit = await getOctokit();
  if (!octokit) return null;

  try {
    let treeSha: string;

    if (commitSha) {
      const { data: commit } = await octokit.rest.git.getCommit({
        owner, repo, commit_sha: commitSha,
      });
      treeSha = commit.tree.sha;
    } else {
      const { data: ref } = await octokit.rest.git.getRef({
        owner, repo, ref: `heads/${branch}`,
      });
      treeSha = ref.object.sha;
    }

    const { data } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: "true",
    });

    return data.tree as TreeEntry[];
  } catch {
    return null;
  }
}

export async function getFileContent(owner: string, repo: string, ref: string, path: string) {
  const octokit = await getOctokit();
  if (!octokit) return null;

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ("content" in data && data.encoding === "base64") {
      const decoded = Buffer.from(data.content, "base64").toString("utf-8");
      return decoded;
    }
  } catch (err) {
    console.error(`[getFileContent] Failed to fetch ${path} at ref ${ref}:`, err instanceof Error ? err.message : err);
    return null;
  }

  return null;
}

export function parseRepoString(repoStr: string) {
  const parts = repoStr.split("/");
  if (parts.length !== 2) return null;
  return { owner: parts[0], repo: parts[1] };
}

export function getKernContentBase(srcDir?: string | null) {
  const base = srcDir ? `${srcDir}/kern/content` : "kern/content";
  return base.replace(/^\//, "");
}

export function getKernTypesPath(srcDir?: string | null) {
  const base = srcDir ? `${srcDir}/kern/types.json` : "kern/types.json";
  return base.replace(/^\//, "");
}

export function getKernMediaBase(publicDir?: string | null) {
  const base = publicDir ? `${publicDir}/kern/media` : "kern/media";
  return base.replace(/^\//, "");
}

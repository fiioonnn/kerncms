import { NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { getAIResponse } from "@/lib/ai/provider";
import { UNINSTALL_SYSTEM_PROMPT } from "@/lib/ai/prompts";

const SOURCE_EXTS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "astro", "vue", "svelte"]);

function extOf(path: string) {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i + 1).toLowerCase();
}

function frameworkFor(path: string): "tsx" | "astro" | "vue" | "svelte" {
  const ext = extOf(path);
  if (ext === "astro") return "astro";
  if (ext === "vue") return "vue";
  if (ext === "svelte") return "svelte";
  return "tsx";
}

function referencesKern(content: string): boolean {
  return (
    /from\s+['"][^'"]*kern[^'"]*['"]/.test(content) ||
    /require\(['"][^'"]*kern[^'"]*['"]\)/.test(content) ||
    /\bgetSection\s*\(/.test(content) ||
    /\bgetGlobal\s*\(/.test(content)
  );
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const [owner, repo] = project.repo.split("/");
  const branch = project.branch;
  const srcDir = project.srcDir || "src";
  const publicDir = project.publicDir || "public";

  try {
    const { data: tree } = await octokit.rest.git.getTree({
      owner, repo, tree_sha: branch, recursive: "1",
    });

    const allPaths = (tree.tree ?? [])
      .filter((f) => f.path && f.type === "blob")
      .map((f) => f.path!);

    const kernPaths = allPaths.filter(
      (p) => p.startsWith(`${srcDir}/kern/`) || p.startsWith(`${publicDir}/kern/`),
    );

    if (kernPaths.length === 0) {
      db.update(projects)
        .set({ kernInstalled: false, onboardingComplete: false })
        .where(eq(projects.id, id))
        .run();
      return NextResponse.json({ success: true, removed: 0, filesModified: 0 });
    }

    // Build lookup from kern JSON files: page.section.key → text and global.key → text
    const lookup: Record<string, string> = {};
    const jsonPaths = kernPaths.filter((p) => p.endsWith(".json"));

    await Promise.all(
      jsonPaths.map(async (p) => {
        try {
          const { data } = await octokit.rest.repos.getContent({ owner, repo, path: p, ref: branch });
          if (!("content" in data) || !data.content) return;
          const text = Buffer.from(data.content, "base64").toString("utf-8");
          const obj = JSON.parse(text) as Record<string, unknown>;

          const rel = p.startsWith(`${srcDir}/kern/`) ? p.slice(`${srcDir}/kern/`.length) : p;

          let prefix: string | null = null;
          if (rel.startsWith("globals/")) {
            prefix = rel.slice("globals/".length).replace(/\.json$/, "");
          } else if (rel.startsWith("content/")) {
            const stripped = rel.slice("content/".length).replace(/\.json$/, "");
            const parts = stripped.split("/");
            if (parts.length >= 2) prefix = `${parts[0]}.${parts.slice(1).join(".")}`;
          }
          if (!prefix) return;

          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === "string") lookup[`${prefix}.${key}`] = value;
          }
        } catch { /* skip malformed */ }
      }),
    );

    // Find source files outside kern/ that reference kern
    const candidatePaths = allPaths.filter(
      (p) =>
        p.startsWith(`${srcDir}/`) &&
        !p.startsWith(`${srcDir}/kern/`) &&
        SOURCE_EXTS.has(extOf(p)),
    );

    const filesToInline: { path: string; content: string }[] = [];
    await Promise.all(
      candidatePaths.map(async (p) => {
        try {
          const { data } = await octokit.rest.repos.getContent({ owner, repo, path: p, ref: branch });
          if (!("content" in data) || !data.content) return;
          const content = Buffer.from(data.content, "base64").toString("utf-8");
          if (referencesKern(content)) filesToInline.push({ path: p, content });
        } catch { /* skip */ }
      }),
    );

    // AI pass per file
    const modifiedFiles: { path: string; content: string }[] = [];
    await Promise.all(
      filesToInline.map(async ({ path, content }) => {
        const prompt = JSON.stringify({
          framework: frameworkFor(path),
          file_content: content,
          lookup,
        });
        try {
          const modified = await getAIResponse(prompt, UNINSTALL_SYSTEM_PROMPT);
          if (modified && modified.trim() !== content.trim()) {
            modifiedFiles.push({ path, content: modified });
          }
        } catch {
          // leave file untouched on AI error
        }
      }),
    );

    // Build commit: modifications + kern deletions in one tree
    const { data: ref } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const latestSha = ref.object.sha;
    const { data: latestCommit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: latestSha });

    const modifiedBlobs = await Promise.all(
      modifiedFiles.map(async (f) => {
        const { data: blob } = await octokit.rest.git.createBlob({
          owner, repo, content: Buffer.from(f.content).toString("base64"), encoding: "base64",
        });
        return { path: f.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
      }),
    );

    const deletions = kernPaths.map((p) => ({
      path: p,
      mode: "100644" as const,
      type: "blob" as const,
      sha: null as unknown as string,
    }));

    const { data: newTree } = await octokit.rest.git.createTree({
      owner, repo, base_tree: latestCommit.tree.sha, tree: [...modifiedBlobs, ...deletions],
    });

    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner, repo,
      message: `kerncms: uninstall kern (inlined ${modifiedFiles.length} files, removed ${kernPaths.length})`,
      tree: newTree.sha,
      parents: [latestSha],
    });

    await octokit.rest.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: newCommit.sha });

    db.update(projects)
      .set({ kernInstalled: false, onboardingComplete: false })
      .where(eq(projects.id, id))
      .run();

    return NextResponse.json({
      success: true,
      removed: kernPaths.length,
      filesModified: modifiedFiles.length,
      commitSha: newCommit.sha,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Uninstall failed" }, { status: 500 });
  }
}

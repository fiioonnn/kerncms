import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { getRepoTree, getFileContent, parseRepoString, getKernTypesPath } from "@/lib/github-content";
import { getOctokit } from "@/lib/github";
import { parseTypesFile, inferSchema } from "@/lib/ai/types-merger";

function getKernBase(srcDir?: string | null) {
  return (srcDir ? `${srcDir}/kern` : "kern").replace(/^\//, "");
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project?.repo || !project?.branch) {
    return NextResponse.json({ errors: [] });
  }

  const parsed = parseRepoString(project.repo);
  if (!parsed) return NextResponse.json({ errors: [] });

  const [tree, typesRaw] = await Promise.all([
    getRepoTree(parsed.owner, parsed.repo, project.branch),
    getFileContent(parsed.owner, parsed.repo, project.branch, getKernTypesPath(project.srcDir)),
  ]);

  if (!tree) return NextResponse.json({ errors: [] });

  let types: Record<string, unknown> = {};
  if (typesRaw) {
    try { types = JSON.parse(typesRaw); } catch { /* */ }
  }

  const contentTypes = (types as Record<string, unknown>).content as Record<string, Record<string, unknown>> | undefined;
  const globalTypes = (types as Record<string, unknown>).globals as Record<string, unknown> | undefined;

  const base = getKernBase(project.srcDir);
  const contentBase = `${base}/content/`;
  const globalsBase = `${base}/globals/`;

  const errors: { key: string; message: string }[] = [];

  const jsonBlobs = tree.filter(
    (e) => e.type === "blob" && e.path.endsWith(".json") &&
      (e.path.startsWith(contentBase) || e.path.startsWith(globalsBase))
  );

  const contents = await Promise.all(
    jsonBlobs.map((b) =>
      getFileContent(parsed.owner, parsed.repo, project.branch!, b.path)
        .then((raw) => ({ path: b.path, raw }))
    )
  );

  for (const { path, raw } of contents) {
    if (!raw) continue;

    const isGlobal = path.startsWith(globalsBase);
    const relative = isGlobal
      ? path.slice(globalsBase.length)
      : path.slice(contentBase.length);

    if (isGlobal) {
      const name = relative.replace(/\.json$/, "");
      if (name.includes("/")) continue;

      try {
        JSON.parse(raw);
      } catch {
        errors.push({ key: `global:${name}`, message: "JSON syntax error" });
        continue;
      }

      const schema = globalTypes?.[name];
      if (!schema || typeof schema !== "object" || Object.keys(schema).length === 0) {
        errors.push({ key: `global:${name}`, message: "No type definition" });
      }
    } else {
      const parts = relative.split("/");
      if (parts.length !== 2) continue;
      const [page, file] = parts;
      const section = file.replace(/\.json$/, "");

      try {
        JSON.parse(raw);
      } catch {
        errors.push({ key: `section:${page}:${section}`, message: "JSON syntax error" });
        continue;
      }

      const schema = contentTypes?.[page]?.[section];
      if (!schema || typeof schema !== "object" || Object.keys(schema as Record<string, unknown>).length === 0) {
        errors.push({ key: `section:${page}:${section}`, message: "No type definition" });
      }
    }
  }

  return NextResponse.json({ errors });
}

// POST — auto-generate missing types and commit to repo
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project?.repo || !project?.branch) {
    return NextResponse.json({ error: "No repo configured" }, { status: 400 });
  }

  const parsed = parseRepoString(project.repo);
  if (!parsed) return NextResponse.json({ error: "Invalid repo" }, { status: 400 });

  const typesPath = getKernTypesPath(project.srcDir);

  const [tree, typesRaw] = await Promise.all([
    getRepoTree(parsed.owner, parsed.repo, project.branch),
    getFileContent(parsed.owner, parsed.repo, project.branch!, typesPath),
  ]);

  if (!tree) return NextResponse.json({ error: "Could not read repo" }, { status: 500 });

  const existing = parseTypesFile(typesRaw ?? null);
  const base = getKernBase(project.srcDir);
  const contentBase = `${base}/content/`;
  const globalsBase = `${base}/globals/`;

  const jsonBlobs = tree.filter(
    (e) => e.type === "blob" && e.path.endsWith(".json") &&
      (e.path.startsWith(contentBase) || e.path.startsWith(globalsBase))
  );

  const contents = await Promise.all(
    jsonBlobs.map((b) =>
      getFileContent(parsed.owner, parsed.repo, project.branch!, b.path)
        .then((raw) => ({ path: b.path, raw }))
    )
  );

  let added = 0;

  for (const { path, raw } of contents) {
    if (!raw) continue;

    const isGlobal = path.startsWith(globalsBase);
    const relative = isGlobal ? path.slice(globalsBase.length) : path.slice(contentBase.length);

    let data: Record<string, unknown>;
    try { data = JSON.parse(raw); } catch { continue; }

    if (isGlobal) {
      const name = relative.replace(/\.json$/, "");
      if (name.includes("/")) continue;
      const existingSchema = existing.globals[name];
      if (existingSchema && typeof existingSchema === "object" && Object.keys(existingSchema).length > 0) continue;
      existing.globals[name] = inferSchema(data) as Record<string, typeof existing.globals[string][string]>;
      added += Object.keys(data).length;
    } else {
      const parts = relative.split("/");
      if (parts.length !== 2) continue;
      const [page, file] = parts;
      const section = file.replace(/\.json$/, "");
      const pageTypes = (existing.content[page] ??= {});
      const existingSchema = pageTypes[section];
      if (existingSchema && typeof existingSchema === "object" && Object.keys(existingSchema).length > 0) continue;
      pageTypes[section] = inferSchema(data) as Record<string, typeof pageTypes[string][string]>;
      added += Object.keys(data).length;
    }
  }

  if (added === 0) {
    return NextResponse.json({ success: true, added: 0 });
  }

  const octokit = await getOctokit();
  if (!octokit) return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });

  const newContent = JSON.stringify(existing, null, 2) + "\n";

  const { data: ref } = await octokit.rest.git.getRef({
    owner: parsed.owner, repo: parsed.repo, ref: `heads/${project.branch}`,
  });
  const baseSha = ref.object.sha;
  const { data: baseCommit } = await octokit.rest.git.getCommit({
    owner: parsed.owner, repo: parsed.repo, commit_sha: baseSha,
  });

  const { data: blob } = await octokit.rest.git.createBlob({
    owner: parsed.owner, repo: parsed.repo,
    content: Buffer.from(newContent, "utf8").toString("base64"),
    encoding: "base64",
  });

  const { data: newTree } = await octokit.rest.git.createTree({
    owner: parsed.owner, repo: parsed.repo,
    base_tree: baseCommit.tree.sha,
    tree: [{ path: typesPath, mode: "100644", type: "blob", sha: blob.sha }],
  });

  const { data: commit } = await octokit.rest.git.createCommit({
    owner: parsed.owner, repo: parsed.repo,
    message: `kerncms: auto-generate missing type definitions`,
    tree: newTree.sha,
    parents: [baseSha],
  });

  await octokit.rest.git.updateRef({
    owner: parsed.owner, repo: parsed.repo,
    ref: `heads/${project.branch}`,
    sha: commit.sha,
  });

  return NextResponse.json({ success: true, added, commitSha: commit.sha });
}

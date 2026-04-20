import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { getRepoTree, getFileContent, parseRepoString, getKernTypesPath } from "@/lib/github-content";
import { getLocalTree, getLocalFileContent } from "@/lib/local-content";
import { pendingChanges } from "@/db/schema";
import { and } from "drizzle-orm";

function getKernGlobalsBase(srcDir?: string | null) {
  const base = srcDir ? `${srcDir}/kern/globals` : "kern/globals";
  return base.replace(/^\//, "");
}

// GET — list global files
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const commitRef = searchParams.get("ref") || undefined;

  const project = db.select().from(projects).where(eq(projects.id, id)).get();

  let tree: { path: string; type: string }[] | null;

  if (project?.localPath) {
    tree = getLocalTree(project.localPath, project.srcDir);
  } else {
    if (!project?.repo || !project?.branch) {
      return NextResponse.json({ error: "No repo configured" }, { status: 400 });
    }
    const parsed = parseRepoString(project.repo);
    if (!parsed) return NextResponse.json({ error: "Invalid repo" }, { status: 400 });
    tree = await getRepoTree(parsed.owner, parsed.repo, project.branch, commitRef);
    if (!tree) return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });
  }

  const base = getKernGlobalsBase(project?.srcDir);
  const globals: string[] = [];

  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    if (!entry.path.startsWith(base + "/")) continue;
    if (!entry.path.endsWith(".json")) continue;
    const relative = entry.path.slice(base.length + 1);
    if (!relative.includes("/")) {
      globals.push(relative.replace(/\.json$/, ""));
    }
  }

  return NextResponse.json({ globals: globals.sort() });
}

// POST — load a specific global file + schema from types.json
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const { name, ref: commitRef } = await request.json();

  const project = db.select().from(projects).where(eq(projects.id, id)).get();

  const base = getKernGlobalsBase(project?.srcDir);
  const filePath = `${base}/${name}.json`;
  const typesPath = getKernTypesPath(project?.srcDir);

  let dataRaw: string | null = null;
  let typesRaw: string | null = null;
  let currentBranchDataRaw: string | null = null;

  if (project?.localPath) {
    dataRaw = getLocalFileContent(project.localPath, filePath);
    typesRaw = getLocalFileContent(project.localPath, typesPath);
  } else {
    if (!project?.repo || !project?.branch) {
      return NextResponse.json({ error: "No repo configured" }, { status: 400 });
    }
    const parsed = parseRepoString(project.repo);
    if (!parsed) return NextResponse.json({ error: "Invalid repo" }, { status: 400 });
    const loadRef = commitRef || project.branch;
    const fetches: Promise<string | null>[] = [
      getFileContent(parsed.owner, parsed.repo, loadRef, filePath),
      getFileContent(parsed.owner, parsed.repo, loadRef, typesPath),
    ];
    if (commitRef) {
      fetches.push(getFileContent(parsed.owner, parsed.repo, project.branch, filePath));
    }
    const results = await Promise.all(fetches);
    dataRaw = results[0];
    typesRaw = results[1];
    currentBranchDataRaw = commitRef ? results[2] : null;
  }

  if (!dataRaw) return NextResponse.json({ file: null });

  let data: Record<string, unknown> = {};
  let originalData: Record<string, unknown> = {};
  try { data = JSON.parse(dataRaw); } catch (e) { return NextResponse.json({ file: null, error: `JSON syntax error in ${name}.json: ${(e as Error).message}` }); }

  if (commitRef && currentBranchDataRaw) {
    try { originalData = JSON.parse(currentBranchDataRaw); } catch { originalData = { ...data }; }
  } else {
    originalData = JSON.parse(dataRaw);
  }

  // Check for pending changes — only when viewing current branch
  if (!commitRef) {
    const pending = db
      .select({ content: pendingChanges.content })
      .from(pendingChanges)
      .where(and(eq(pendingChanges.projectId, id), eq(pendingChanges.filePath, filePath)))
      .get();
    if (pending) {
      try { data = JSON.parse(pending.content); } catch { /* use github data */ }
    }
  }

  let schema: Record<string, unknown> = Object.create(null);
  let typesJson: unknown = null;
  if (typesRaw) {
    try {
      const parsed2 = JSON.parse(typesRaw);
      typesJson = parsed2;
      const s = parsed2?.globals?.[name];
      if (s && typeof s === "object") schema = s;
    } catch { /* */ }
  }

  const warning = Object.keys(schema).length === 0
    ? `No type definition found for "${name}". Add a "globals.${name}" entry in types.json to define the fields.`
    : undefined;

  return NextResponse.json({
    file: { filename: name, data, schema, originalData },
    typesJson,
    warning,
  });
}

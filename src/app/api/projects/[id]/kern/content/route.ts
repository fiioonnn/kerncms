import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, pendingChanges } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { getRepoTree, getFileContent, parseRepoString, getKernContentBase, getKernTypesPath } from "@/lib/github-content";
import { getLocalTree, getLocalFileContent } from "@/lib/local-content";

type TreeEntry = { path: string; type: "blob" | "tree" };

function buildPageList(tree: TreeEntry[], base: string) {
  const pageMap = new Map<string, string[]>();
  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    if (!entry.path.startsWith(base + "/")) continue;
    if (!entry.path.endsWith(".json")) continue;
    const relative = entry.path.slice(base.length + 1);
    const parts = relative.split("/");
    if (parts.length === 2) {
      const page = parts[0];
      const section = parts[1].replace(/\.json$/, "");
      if (!pageMap.has(page)) pageMap.set(page, []);
      pageMap.get(page)!.push(section);
    }
  }
  return Array.from(pageMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, sections]) => ({
      name,
      sections: sections.sort().map((s) => ({ name: s })),
    }));
}

// GET — discover pages + sections from repo tree
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const commitRef = searchParams.get("ref") || undefined;

  const project = db.select().from(projects).where(eq(projects.id, id)).get();

  if (project?.localPath) {
    const tree = getLocalTree(project.localPath, project.srcDir);
    const base = getKernContentBase(project.srcDir);

    if (!project.srcDir) {
      const contentDir = tree.find((e) => e.type === "tree" && e.path && (e.path === "kern/content" || e.path.endsWith("/kern/content")));
      if (contentDir?.path) {
        const detectedSrc = contentDir.path.replace(/\/kern\/content$/, "") || "";
        if (detectedSrc) {
          db.update(projects).set({ srcDir: detectedSrc }).where(eq(projects.id, id)).run();
        }
      }
    }

    return NextResponse.json({ pages: buildPageList(tree, getKernContentBase(project.srcDir)) });
  }

  if (!project?.repo || !project?.branch) {
    return NextResponse.json({ error: "Project has no repo/branch configured" }, { status: 400 });
  }

  const parsed = parseRepoString(project.repo);
  if (!parsed) return NextResponse.json({ error: "Invalid repo format" }, { status: 400 });

  const tree = await getRepoTree(parsed.owner, parsed.repo, project.branch, commitRef);
  if (!tree) return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });

  let base = getKernContentBase(project.srcDir);

  if (!project.srcDir) {
    const contentDir = tree.find((e) => e.type === "tree" && e.path && (e.path === "kern/content" || e.path.endsWith("/kern/content")));
    if (contentDir?.path) {
      base = contentDir.path;
      const detectedSrc = contentDir.path.replace(/\/kern\/content$/, "") || "";
      if (detectedSrc) {
        db.update(projects).set({ srcDir: detectedSrc }).where(eq(projects.id, id)).run();
      }
    }
  }

  return NextResponse.json({ pages: buildPageList(tree as TreeEntry[], base) });
}

// POST — load a section's data + schema from types.json
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const { page, section, ref: commitRef } = await request.json();

  const project = db.select().from(projects).where(eq(projects.id, id)).get();

  const base = getKernContentBase(project?.srcDir);
  const filePath = `${base}/${page}/${section}.json`;
  const typesPath = getKernTypesPath(project?.srcDir);

  let dataRaw: string | null = null;
  let typesRaw: string | null = null;
  let currentBranchDataRaw: string | null = null;

  if (project?.localPath) {
    dataRaw = getLocalFileContent(project.localPath, filePath);
    typesRaw = getLocalFileContent(project.localPath, typesPath);
  } else {
    if (!project?.repo || !project?.branch) {
      return NextResponse.json({ error: "Project has no repo/branch configured" }, { status: 400 });
    }
    const parsed = parseRepoString(project.repo);
    if (!parsed) return NextResponse.json({ error: "Invalid repo format" }, { status: 400 });

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

  if (!dataRaw) {
    console.error(`[content POST] File not found: ${filePath} (srcDir=${project?.srcDir})`);
    return NextResponse.json({ files: [] });
  }

  let data: Record<string, unknown> = {};
  let originalData: Record<string, unknown> = {};
  try { data = JSON.parse(dataRaw); } catch (e) { return NextResponse.json({ files: [], error: `JSON syntax error in ${section}.json: ${(e as Error).message}` }); }

  if (commitRef && currentBranchDataRaw) {
    try { originalData = JSON.parse(currentBranchDataRaw); } catch { originalData = { ...data }; }
  } else {
    originalData = JSON.parse(dataRaw);
  }

  // Check for pending changes in DB — only when viewing current branch (not a specific commit)
  if (!commitRef) {
    const pending = db
      .select({ content: pendingChanges.content })
      .from(pendingChanges)
      .where(and(eq(pendingChanges.projectId, id), eq(pendingChanges.filePath, filePath)))
      .get();
    if (pending) {
      if (pending.content === "__KERN_DELETE__") {
        return NextResponse.json({ files: [], deleted: true });
      }
      try { data = JSON.parse(pending.content); } catch { /* use github data */ }
    }
  }

  // Extract schema for this section from types.json
  let schema: Record<string, unknown> = Object.create(null);
  let typesJson: unknown = null;
  if (typesRaw) {
    try {
      const parsed = JSON.parse(typesRaw);
      typesJson = parsed;
      const s = parsed?.content?.[page]?.[section];
      if (s && typeof s === "object") schema = s;
    } catch { /* invalid types.json */ }
  }

  const warning = Object.keys(schema).length === 0
    ? `No type definition found for "${section}". Add a "content.${page}.${section}" entry in types.json to define the fields.`
    : undefined;

  return NextResponse.json({
    files: [{ filename: section, data, schema, originalData }],
    typesJson,
    warning,
  });
}

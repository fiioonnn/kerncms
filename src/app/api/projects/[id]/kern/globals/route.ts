import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { getRepoTree, getFileContent, parseRepoString, getKernTypesPath } from "@/lib/github-content";
import { getLocalTree, getLocalFileContent } from "@/lib/local-content";
import { pendingChanges } from "@/db/schema";
import { and } from "drizzle-orm";

const DELETE_SENTINEL = "__KERN_DELETE__";

function pendingContent(projectId: string, filePath: string): string | null {
  const row = db
    .select({ content: pendingChanges.content })
    .from(pendingChanges)
    .where(and(eq(pendingChanges.projectId, projectId), eq(pendingChanges.filePath, filePath)))
    .get();
  return row && row.content !== DELETE_SENTINEL ? row.content : null;
}

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

  const base = getKernGlobalsBase(project?.localPath ? null : project?.srcDir);
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

  // Globals created in the CMS exist only as drafts until they're published.
  if (!commitRef) {
    const draftBase = getKernGlobalsBase(project?.srcDir);
    const drafts = db
      .select({ filePath: pendingChanges.filePath, content: pendingChanges.content })
      .from(pendingChanges)
      .where(eq(pendingChanges.projectId, id))
      .all();
    for (const d of drafts) {
      if (d.content === DELETE_SENTINEL || !d.filePath.startsWith(draftBase + "/") || !d.filePath.endsWith(".json")) continue;
      const name = d.filePath.slice(draftBase.length + 1).replace(/\.json$/, "");
      if (!name.includes("/") && !globals.includes(name)) globals.push(name);
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

  // The published types.json is the baseline for change tracking; a drafted one (new fields, new globals) is what to show.
  const typesOriginalRaw = typesRaw;
  if (!commitRef) typesRaw = pendingContent(id, typesPath) ?? typesRaw;

  // A global created in the CMS has no file yet — only a draft.
  const draftOnly = !dataRaw && !commitRef ? pendingContent(id, filePath) : null;
  if (!dataRaw && !draftOnly) return NextResponse.json({ file: null });

  let data: Record<string, unknown> = {};
  let originalData: Record<string, unknown> = {};
  try { data = JSON.parse((dataRaw ?? draftOnly)!); } catch (e) { return NextResponse.json({ file: null, error: `JSON syntax error in ${name}.json: ${(e as Error).message}` }); }

  if (draftOnly) {
    originalData = {};
  } else if (commitRef && currentBranchDataRaw) {
    try { originalData = JSON.parse(currentBranchDataRaw); } catch { originalData = { ...data }; }
  } else {
    originalData = JSON.parse(dataRaw!);
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

  let typesOriginal: unknown = null;
  try { typesOriginal = typesOriginalRaw ? JSON.parse(typesOriginalRaw) : null; } catch { /* */ }

  return NextResponse.json({
    file: { filename: name, data, schema, originalData },
    typesJson,
    typesOriginal,
    warning,
  });
}

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const FIELD_TYPES = new Set(["text", "textarea", "richtext", "number", "boolean", "image", "date", "select", "list"]);

function schemaFor(type: string): unknown {
  if (type === "select") return { type: "select", options: [] };
  if (type === "date") return { type: "date", format: "YYYY-MM-DD" };
  if (type === "list") return ["text"];
  return type;
}

/**
 * PUT — create a new global as a draft: its JSON file plus its entry in types.json.
 * body: { name, kind: "list" | "fields", listKey?, fields: [{ key, type }] }
 *   kind "list"   → { [listKey]: [] } with each item having `fields` (a collection, e.g. projects)
 *   kind "fields" → one object with `fields` (e.g. contact details)
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin", "editor"]);

  const body = await request.json().catch(() => null) as { name?: string; kind?: string; listKey?: string; fields?: { key: string; type: string }[] } | null;
  const name = body?.name?.trim() ?? "";
  const listKey = body?.listKey?.trim() || "items";
  const fields = (body?.fields ?? []).filter((f) => NAME_RE.test(f.key) && FIELD_TYPES.has(f.type));
  if (!NAME_RE.test(name)) return NextResponse.json({ error: "Use lowercase letters, numbers, - and _ for the name." }, { status: 400 });
  if (body?.kind === "list" && !NAME_RE.test(listKey)) return NextResponse.json({ error: "Invalid list key." }, { status: 400 });
  if (fields.length === 0) return NextResponse.json({ error: "Add at least one field." }, { status: 400 });
  if (new Set(fields.map((f) => f.key)).size !== fields.length) return NextResponse.json({ error: "Field names must be unique." }, { status: 400 });

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const filePath = `${getKernGlobalsBase(project.srcDir)}/${name}.json`;
  const typesPath = getKernTypesPath(project.srcDir);

  // Current types.json: drafted version if any, else the published one.
  let typesRaw = pendingContent(id, typesPath);
  let fileExists = !!pendingContent(id, filePath);
  if (project.localPath) {
    typesRaw ??= getLocalFileContent(project.localPath, typesPath);
    fileExists ||= !!getLocalFileContent(project.localPath, filePath);
  } else {
    const parsed = project.repo ? parseRepoString(project.repo) : null;
    if (!parsed || !project.branch) return NextResponse.json({ error: "No repo configured" }, { status: 400 });
    const [published, existing] = await Promise.all([
      typesRaw ? Promise.resolve(null) : getFileContent(parsed.owner, parsed.repo, project.branch, typesPath),
      fileExists ? Promise.resolve(null) : getFileContent(parsed.owner, parsed.repo, project.branch, filePath),
    ]);
    typesRaw ??= published;
    fileExists ||= !!existing;
  }
  if (fileExists) return NextResponse.json({ error: `A global named "${name}" already exists.` }, { status: 409 });

  let types: { content?: unknown; globals?: Record<string, unknown> } = {};
  try { types = typesRaw ? JSON.parse(typesRaw) : {}; } catch { return NextResponse.json({ error: "types.json is not valid JSON." }, { status: 400 }); }
  if (types.globals && name in types.globals) return NextResponse.json({ error: `"${name}" is already defined in types.json.` }, { status: 409 });

  const itemSchema = Object.fromEntries(fields.map((f) => [f.key, schemaFor(f.type)]));
  const isList = body?.kind === "list";
  const schema = isList ? { [listKey]: [itemSchema] } : itemSchema;
  const empty = (t: string) => (t === "number" ? 0 : t === "boolean" ? false : t === "list" ? [] : "");
  const data = isList
    ? { $schema: "kern", [listKey]: [] }
    : { $schema: "kern", ...Object.fromEntries(fields.map((f) => [f.key, empty(f.type)])) };

  const nextTypes = { ...types, globals: { ...(types.globals ?? {}), [name]: schema } };
  const now = new Date();
  for (const [path, content] of [[filePath, data], [typesPath, nextTypes]] as const) {
    const str = JSON.stringify(content, null, 2);
    db.insert(pendingChanges)
      .values({ projectId: id, filePath: path, content: str, updatedAt: now })
      .onConflictDoUpdate({ target: [pendingChanges.projectId, pendingChanges.filePath], set: { content: str, updatedAt: now } })
      .run();
  }

  return NextResponse.json({ name, filePath });
}

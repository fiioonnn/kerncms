import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, pendingChanges } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { getRepoTree, getFileContent, parseRepoString, getKernContentBase } from "@/lib/github-content";

type Usage = { url: string; file: string; field: string };

function findUrlsInValue(obj: unknown, urls: string[], path = ""): Usage[] {
  const results: Usage[] = [];
  if (typeof obj === "string") {
    for (const url of urls) {
      if (obj === url) {
        results.push({ url, field: path, file: "" });
      }
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      results.push(...findUrlsInValue(obj[i], urls, `${path}[${i}]`));
    }
  } else if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      results.push(...findUrlsInValue(value, urls, path ? `${path}.${key}` : key));
    }
  }
  return results;
}

function nullifyUrls(obj: unknown, urls: Set<string>): unknown {
  if (typeof obj === "string") {
    return urls.has(obj) ? null : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => nullifyUrls(item, urls));
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = nullifyUrls(value, urls);
    }
    return result;
  }
  return obj;
}

function getGlobalsBase(srcDir?: string | null) {
  const base = srcDir ? `${srcDir}/kern/globals` : "kern/globals";
  return base.replace(/^\//, "");
}

// POST — check which content files reference given media URLs
// body: { urls: string[] }
// response: { usages: Usage[] }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const { urls, cleanup } = await request.json();

  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ usages: [] });
  }

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project?.repo || !project?.branch) {
    return NextResponse.json({ usages: [] });
  }

  const parsed = parseRepoString(project.repo);
  if (!parsed) return NextResponse.json({ usages: [] });

  const tree = await getRepoTree(parsed.owner, parsed.repo, project.branch);
  if (!tree) return NextResponse.json({ usages: [] });

  const contentBase = getKernContentBase(project.srcDir);
  const globalsBase = getGlobalsBase(project.srcDir);

  const jsonFiles: string[] = [];
  for (const entry of tree) {
    if (entry.type !== "blob" || !entry.path.endsWith(".json")) continue;
    if (entry.path.startsWith(contentBase + "/") || entry.path.startsWith(globalsBase + "/")) {
      jsonFiles.push(entry.path);
    }
  }

  const allPending = db
    .select({ filePath: pendingChanges.filePath, content: pendingChanges.content })
    .from(pendingChanges)
    .where(eq(pendingChanges.projectId, id))
    .all();
  const pendingMap = new Map(allPending.map((p) => [p.filePath, p.content]));

  const usages: Usage[] = [];
  const affectedFiles = new Map<string, { current: Record<string, unknown>; original: Record<string, unknown> }>();

  for (const [filePath, content] of pendingMap) {
    if (!jsonFiles.includes(filePath) && !filePath.startsWith(contentBase) && !filePath.startsWith(globalsBase)) continue;
    try {
      const data = JSON.parse(content);
      const matches = findUrlsInValue(data, urls);
      if (matches.length > 0) {
        for (const m of matches) usages.push({ ...m, file: filePath });
        if (cleanup) affectedFiles.set(filePath, { current: data, original: data });
      }
    } catch { /* invalid JSON */ }
  }

  const filesToCheck = jsonFiles.filter((f) => !pendingMap.has(f));

  for (let i = 0; i < filesToCheck.length; i += 5) {
    const batch = filesToCheck.slice(i, i + 5);
    const contents = await Promise.all(
      batch.map((f) => getFileContent(parsed.owner, parsed.repo, project.branch!, f)),
    );
    for (let j = 0; j < batch.length; j++) {
      if (!contents[j]) continue;
      try {
        const data = JSON.parse(contents[j]!);
        const matches = findUrlsInValue(data, urls);
        if (matches.length > 0) {
          for (const m of matches) usages.push({ ...m, file: batch[j] });
          if (cleanup) affectedFiles.set(batch[j], { current: data, original: data });
        }
      } catch { /* invalid JSON */ }
    }
  }

  if (cleanup && affectedFiles.size > 0) {
    const urlSet = new Set(urls as string[]);
    for (const [filePath, { original }] of affectedFiles) {
      const cleaned = nullifyUrls(original, urlSet) as Record<string, unknown>;
      const contentStr = JSON.stringify(cleaned, null, 2);
      db.insert(pendingChanges)
        .values({ projectId: id, filePath, content: contentStr, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [pendingChanges.projectId, pendingChanges.filePath],
          set: { content: contentStr, updatedAt: new Date() },
        })
        .run();
    }
  }

  return NextResponse.json({ usages, cleaned: cleanup ? affectedFiles.size : 0 });
}

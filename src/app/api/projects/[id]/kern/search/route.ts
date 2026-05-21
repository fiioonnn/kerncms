import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { getRepoTree, getFileContent, parseRepoString, getKernContentBase, getKernTypesPath } from "@/lib/github-content";

function getKernGlobalsBase(srcDir?: string | null) {
  const base = srcDir ? `${srcDir}/kern/globals` : "kern/globals";
  return base.replace(/^\//, "");
}

type IndexItem = {
  type: "page" | "section" | "global" | "field";
  label: string;
  description: string;
  page?: string;
  section?: string;
  global?: string;
  field?: string;
};

const indexCache = new Map<string, { items: IndexItem[]; ts: number }>();
const CACHE_TTL = 60_000;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project?.repo || !project?.branch) {
    return NextResponse.json({ items: [] });
  }

  const cacheKey = `${id}:${project.branch}`;
  const cached = indexCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ items: cached.items });
  }

  const parsed = parseRepoString(project.repo);
  if (!parsed) return NextResponse.json({ items: [] });

  const tree = await getRepoTree(parsed.owner, parsed.repo, project.branch);
  if (!tree) return NextResponse.json({ items: [] });

  const contentBase = getKernContentBase(project.srcDir);
  const globalsBase = getKernGlobalsBase(project.srcDir);
  const typesPath = getKernTypesPath(project.srcDir);

  const items: IndexItem[] = [];
  const pageSet = new Set<string>();

  for (const entry of tree) {
    if (entry.type !== "blob" || !entry.path.endsWith(".json")) continue;

    if (entry.path.startsWith(contentBase + "/")) {
      const relative = entry.path.slice(contentBase.length + 1);
      const parts = relative.split("/");
      if (parts.length === 2) {
        const page = parts[0];
        const section = parts[1].replace(/\.json$/, "");
        pageSet.add(page);
        items.push({ type: "section", label: section, description: page, page, section });
      }
    }

    if (entry.path.startsWith(globalsBase + "/")) {
      const relative = entry.path.slice(globalsBase.length + 1);
      if (!relative.includes("/")) {
        const name = relative.replace(/\.json$/, "");
        items.push({ type: "global", label: name, description: "Global" });
      }
    }
  }

  for (const page of pageSet) {
    items.push({ type: "page", label: page, description: "Page" });
  }

  let typesRaw: string | null = null;
  try {
    typesRaw = await getFileContent(parsed.owner, parsed.repo, project.branch, typesPath);
  } catch { /* */ }

  if (typesRaw) {
    try {
      const types = JSON.parse(typesRaw);

      if (types?.content) {
        for (const [page, pageSections] of Object.entries(types.content)) {
          if (!pageSections || typeof pageSections !== "object") continue;
          for (const [section, fields] of Object.entries(pageSections as Record<string, unknown>)) {
            if (!fields || typeof fields !== "object") continue;
            for (const fieldKey of Object.keys(fields as Record<string, unknown>)) {
              items.push({
                type: "field",
                label: fieldKey,
                description: `${page} / ${section}`,
                page,
                section,
                field: fieldKey,
              });
            }
          }
        }
      }

      if (types?.globals) {
        for (const [globalName, fields] of Object.entries(types.globals)) {
          if (!fields || typeof fields !== "object") continue;
          for (const fieldKey of Object.keys(fields as Record<string, unknown>)) {
            items.push({
              type: "field",
              label: fieldKey,
              description: globalName,
              global: globalName,
              field: fieldKey,
            });
          }
        }
      }
    } catch { /* invalid types.json */ }
  }

  indexCache.set(cacheKey, { items, ts: Date.now() });

  return NextResponse.json({ items });
}

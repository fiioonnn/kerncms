import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectAnalytics, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { getOctokit } from "@/lib/github";

type DetectResult = { detected: boolean; files: string[] };

const cache = new Map<string, { ts: number; result: DetectResult }>();
const CACHE_TTL = 5 * 60 * 1000;

export function clearDetectCache(projectId: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${projectId}:`)) cache.delete(key);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin", "editor", "viewer"]);

  const settings = db
    .select()
    .from(projectAnalytics)
    .where(eq(projectAnalytics.projectId, id))
    .get();
  if (!settings) {
    return NextResponse.json({ detected: false, files: [], reason: "no-settings" });
  }

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project?.repo) {
    return NextResponse.json({ detected: false, files: [], reason: "no-repo" });
  }

  const url = new URL(req.url);
  const fresh = url.searchParams.get("fresh") === "1";

  const cacheKey = `${id}:${settings.siteId}`;
  if (!fresh) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ ...cached.result, cached: true });
    }
  }

  const octokit = await getOctokit();
  if (!octokit) {
    return NextResponse.json({ detected: false, files: [], reason: "no-github" });
  }

  const [owner, repo] = project.repo.split("/");

  try {
    const { data } = await octokit.rest.search.code({
      q: `"${settings.siteId}" repo:${owner}/${repo}`,
      per_page: 5,
    });
    const files = (data.items ?? []).map((i) => i.path).filter(Boolean);
    const result: DetectResult = { detected: files.length > 0, files };
    cache.set(cacheKey, { ts: Date.now(), result });

    const wasConfigured = settings.updatedAt.getTime() - settings.createdAt.getTime() > 5000;
    if (result.detected && !settings.enabled && !wasConfigured) {
      db.update(projectAnalytics)
        .set({
          enabled: true,
          layoutFile: settings.layoutFile ?? files[0] ?? null,
          updatedAt: new Date(),
        })
        .where(eq(projectAnalytics.projectId, id))
        .run();
    }

    return NextResponse.json({ ...result, cached: false });
  } catch {
    return NextResponse.json({ detected: false, files: [], reason: "search-failed" });
  }
}

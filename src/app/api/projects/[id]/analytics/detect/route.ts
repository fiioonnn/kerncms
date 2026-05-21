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
    // If we know the layout file, check it directly for data-kerncms or legacy siteId
    if (settings.layoutFile) {
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: settings.layoutFile,
          ref: project.branch ?? undefined,
        });
        if (!Array.isArray(data) && data.type === "file") {
          const content = Buffer.from(data.content, "base64").toString("utf-8");
          const hasKerncms = /data-kerncms/.test(content);
          const hasLegacy = content.includes(`/api/script/${settings.siteId}`);
          if (hasKerncms || hasLegacy) {
            const result: DetectResult = { detected: true, files: [settings.layoutFile] };
            cache.set(cacheKey, { ts: Date.now(), result });
            autoEnable(settings, id, result);
            return NextResponse.json({ ...result, cached: false });
          }
        }
      } catch {
        // layout file not found, fall through to search
      }
    }

    // Fallback: search repo for siteId or data-kerncms
    const { data } = await octokit.rest.search.code({
      q: `"data-kerncms" repo:${owner}/${repo}`,
      per_page: 5,
    });
    let files = (data.items ?? []).map((i) => i.path).filter(Boolean);

    if (files.length === 0) {
      const { data: legacy } = await octokit.rest.search.code({
        q: `"${settings.siteId}" repo:${owner}/${repo}`,
        per_page: 5,
      });
      files = (legacy.items ?? []).map((i) => i.path).filter(Boolean);
    }

    const result: DetectResult = { detected: files.length > 0, files };
    cache.set(cacheKey, { ts: Date.now(), result });
    autoEnable(settings, id, result);

    return NextResponse.json({ ...result, cached: false });
  } catch {
    return NextResponse.json({ detected: false, files: [], reason: "search-failed" });
  }
}

function autoEnable(
  settings: typeof projectAnalytics.$inferSelect,
  projectId: string,
  result: DetectResult,
) {
  const wasConfigured = settings.updatedAt.getTime() - settings.createdAt.getTime() > 5000;
  if (result.detected && !settings.enabled && !wasConfigured) {
    db.update(projectAnalytics)
      .set({
        enabled: true,
        layoutFile: settings.layoutFile ?? result.files[0] ?? null,
        updatedAt: new Date(),
      })
      .where(eq(projectAnalytics.projectId, projectId))
      .run();
  }
}

import { db } from "@/db";
import { projectAnalytics, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getOctokit } from "@/lib/github";

type RemoveResult =
  | { ok: true; removed: boolean }
  | { ok: false; error: string };

const KERNCMS_TAG_RE = /\s*<script[^>]+data-kerncms[^>]*>[^<]*<\/script>\s*/g;

const LEGACY_SCRIPT_TAG_RE = (siteId: string) =>
  new RegExp(
    `\\s*<script\\b[^>]*src=["'][^"']*\\/api\\/script\\/${siteId.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}["'][^>]*>\\s*<\\/script>\\s*`,
    "g",
  );

export async function removeTrackerScript(projectId: string): Promise<RemoveResult> {
  const settings = db
    .select()
    .from(projectAnalytics)
    .where(eq(projectAnalytics.projectId, projectId))
    .get();
  if (!settings) return { ok: true, removed: false };

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project?.repo || !project?.branch) return { ok: true, removed: false };

  const layoutFile = settings.layoutFile;
  if (!layoutFile) {
    db.update(projectAnalytics)
      .set({ enabled: false, layoutFile: null, updatedAt: new Date() })
      .where(eq(projectAnalytics.projectId, projectId))
      .run();
    return { ok: true, removed: false };
  }

  const octokit = await getOctokit();
  if (!octokit) return { ok: false, error: "GitHub App not configured" };
  const [owner, repo] = project.repo.split("/");

  let existing;
  try {
    existing = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: layoutFile,
      ref: project.branch,
    });
  } catch {
    db.update(projectAnalytics)
      .set({ enabled: false, layoutFile: null, updatedAt: new Date() })
      .where(eq(projectAnalytics.projectId, projectId))
      .run();
    return { ok: true, removed: false };
  }

  if (Array.isArray(existing.data) || existing.data.type !== "file") {
    return { ok: false, error: "Target path is not a file" };
  }

  const content = Buffer.from(existing.data.content, "base64").toString("utf-8");
  KERNCMS_TAG_RE.lastIndex = 0;
  let stripped = content.replace(KERNCMS_TAG_RE, "\n  ");
  stripped = stripped.replace(LEGACY_SCRIPT_TAG_RE(settings.siteId), "\n  ");
  const changed = stripped !== content;

  if (changed) {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: layoutFile,
      message: `kern: uninstall analytics tracker from ${layoutFile}`,
      content: Buffer.from(stripped, "utf-8").toString("base64"),
      sha: existing.data.sha,
      branch: project.branch,
    });
  }

  db.update(projectAnalytics)
    .set({ enabled: false, layoutFile: null, verifiedAt: null, updatedAt: new Date() })
    .where(eq(projectAnalytics.projectId, projectId))
    .run();

  return { ok: true, removed: changed };
}

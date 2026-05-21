import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectAnalytics, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { getOctokit } from "@/lib/github";
import { clearDetectCache } from "../detect/route";
import { KERNCMS_SCRIPT_RE } from "../install/route";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const settings = db.select().from(projectAnalytics).where(eq(projectAnalytics.projectId, id)).get();
  if (!settings) return NextResponse.json({ correct: true, fixed: false });

  const appUrl = settings.appUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "";
  if (!appUrl) return NextResponse.json({ correct: true, fixed: false });

  if (!settings.layoutFile) return NextResponse.json({ correct: true, fixed: false });

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project?.repo || !project?.branch) {
    return NextResponse.json({ correct: true, fixed: false });
  }

  const octokit = await getOctokit();
  if (!octokit) return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });

  const [owner, repo] = project.repo.split("/");

  let existing;
  try {
    existing = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: settings.layoutFile,
      ref: project.branch,
    });
  } catch {
    return NextResponse.json({ correct: true, fixed: false, reason: "file-not-found" });
  }

  if (Array.isArray(existing.data) || existing.data.type !== "file") {
    return NextResponse.json({ correct: true, fixed: false });
  }

  const content = Buffer.from(existing.data.content, "base64").toString("utf-8");

  const expectedSnippet = `<script defer data-kerncms src="${appUrl}/api/script/${settings.siteId}"></script>`;

  KERNCMS_SCRIPT_RE.lastIndex = 0;
  const match = content.match(KERNCMS_SCRIPT_RE);

  if (!match) {
    const legacyPattern = new RegExp(`<script[^>]+src="[^"]*\\/api\\/script\\/${settings.siteId.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}"[^>]*>[^<]*</script>`);
    const legacyMatch = content.match(legacyPattern);
    if (!legacyMatch) {
      return NextResponse.json({ correct: true, fixed: false, reason: "no-script-tag" });
    }

    const newContent = content.replace(legacyMatch[0], expectedSnippet);
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: settings.layoutFile,
      message: `kern: add identifier to analytics script in ${settings.layoutFile}`,
      content: Buffer.from(newContent, "utf-8").toString("base64"),
      sha: existing.data.sha,
      branch: project.branch,
    });

    clearDetectCache(id);
    return NextResponse.json({ correct: false, fixed: true, migration: "added-identifier" });
  }

  if (match[0].trim() === expectedSnippet) {
    return NextResponse.json({ correct: true, fixed: false });
  }

  KERNCMS_SCRIPT_RE.lastIndex = 0;
  const newContent = content.replace(KERNCMS_SCRIPT_RE, expectedSnippet);

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: settings.layoutFile,
    message: `kern: fix analytics script URL in ${settings.layoutFile}`,
    content: Buffer.from(newContent, "utf-8").toString("base64"),
    sha: existing.data.sha,
    branch: project.branch,
  });

  clearDetectCache(id);

  return NextResponse.json({
    correct: false,
    fixed: true,
    previousSnippet: match[0].trim(),
    newSnippet: expectedSnippet,
  });
}

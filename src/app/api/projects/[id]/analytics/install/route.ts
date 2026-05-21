import { NextResponse } from "next/server";
import { db } from "@/db";
import { projectAnalytics, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { getOctokit } from "@/lib/github";

function ensureRow(projectId: string) {
  let row = db.select().from(projectAnalytics).where(eq(projectAnalytics.projectId, projectId)).get();
  if (!row) {
    db.insert(projectAnalytics).values({ projectId }).run();
    row = db.select().from(projectAnalytics).where(eq(projectAnalytics.projectId, projectId)).get();
  }
  return row!;
}

export const KERNCMS_SCRIPT_RE = /<script[^>]+data-kerncms[^>]*>[^<]*<\/script>/g;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const body = (await req.json().catch(() => ({}))) as { file?: string };
  const file = body.file?.trim();
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const settings = ensureRow(id);

  const appUrl = settings.appUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "";
  if (!appUrl) return NextResponse.json({ error: "App URL not configured" }, { status: 400 });

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project?.repo || !project?.branch) {
    return NextResponse.json({ error: "Project repository not configured" }, { status: 400 });
  }

  const octokit = await getOctokit();
  if (!octokit) return NextResponse.json({ error: "GitHub App not configured" }, { status: 503 });

  const [owner, repo] = project.repo.split("/");

  let existing;
  try {
    existing = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: file,
      ref: project.branch,
    });
  } catch {
    return NextResponse.json({ error: "Could not read target file from GitHub" }, { status: 404 });
  }

  if (Array.isArray(existing.data) || existing.data.type !== "file") {
    return NextResponse.json({ error: "Target path is not a file" }, { status: 400 });
  }

  const content = Buffer.from(existing.data.content, "base64").toString("utf-8");

  if (!content.includes("</head>")) {
    return NextResponse.json(
      { error: "No </head> tag found in this file. Pick a file that contains a closing </head> tag." },
      { status: 400 }
    );
  }

  const snippet = `<script defer data-kerncms src="${appUrl}/api/script/${settings.siteId}"></script>`;

  let newContent: string;
  if (KERNCMS_SCRIPT_RE.test(content)) {
    KERNCMS_SCRIPT_RE.lastIndex = 0;
    const replaced = content.replace(KERNCMS_SCRIPT_RE, snippet);
    if (replaced === content) {
      db.update(projectAnalytics)
        .set({ enabled: true, layoutFile: file, updatedAt: new Date() })
        .where(eq(projectAnalytics.projectId, id))
        .run();
      return NextResponse.json({ ok: true, alreadyInstalled: true });
    }
    newContent = replaced;
  } else {
    newContent = content.replace("</head>", `    ${snippet}\n  </head>`);
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: file,
    message: `kern: install analytics tracker in ${file}`,
    content: Buffer.from(newContent, "utf-8").toString("base64"),
    sha: existing.data.sha,
    branch: project.branch,
  });

  db.update(projectAnalytics)
    .set({ enabled: true, layoutFile: file, updatedAt: new Date() })
    .where(eq(projectAnalytics.projectId, id))
    .run();

  return NextResponse.json({ ok: true });
}

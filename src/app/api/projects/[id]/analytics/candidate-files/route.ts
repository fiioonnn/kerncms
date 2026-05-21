import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import { getOctokit } from "@/lib/github";

const cache = new Map<string, { ts: number; files: string[] }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin", "editor", "viewer"]);

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project?.repo) return NextResponse.json([]);

  const cached = cache.get(project.repo);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.files);
  }

  const [owner, repo] = project.repo.split("/");
  const octokit = await getOctokit();
  if (!octokit) return NextResponse.json([]);

  try {
    const { data } = await octokit.rest.search.code({
      q: `"</head>" repo:${owner}/${repo}`,
      per_page: 50,
    });
    const files = (data.items ?? []).map((i) => i.path).filter(Boolean);
    cache.set(project.repo, { ts: Date.now(), files });
    return NextResponse.json(files);
  } catch {
    return NextResponse.json([]);
  }
}

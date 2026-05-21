import { NextResponse } from "next/server";
import { db } from "@/db";
import { mediaBuckets, projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession, requireRole, getMemberRole, isAdminRole } from "@/lib/auth-helpers";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const role = await getMemberRole(id, session.user.id);
  if (!role && !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allBuckets = db
    .select()
    .from(mediaBuckets)
    .where(eq(mediaBuckets.projectId, id))
    .all();

  // Deduplicate: keep only the first (oldest) GitHub bucket per project, delete extras
  const seen = new Set<string>();
  const dupeIds: string[] = [];
  const buckets = allBuckets.filter((b) => {
    if (b.provider !== "github") return true;
    const key = `${b.projectId}:${b.provider}`;
    if (seen.has(key)) { dupeIds.push(b.id); return false; }
    seen.add(key);
    return true;
  });

  if (dupeIds.length > 0) {
    for (const dupeId of dupeIds) {
      db.delete(mediaBuckets).where(eq(mediaBuckets.id, dupeId)).run();
    }
  }

  // Fix legacy GitHub buckets named just "GitHub" — rename to repo name
  const ghBucket = buckets.find((b) => b.provider === "github" && b.name === "GitHub");
  if (ghBucket) {
    const project = db.select({ repo: projects.repo }).from(projects).where(eq(projects.id, id)).get();
    if (project?.repo) {
      const repoName = project.repo.split("/").pop() ?? "GitHub";
      db.update(mediaBuckets).set({ name: repoName }).where(eq(mediaBuckets.id, ghBucket.id)).run();
      ghBucket.name = repoName;
    }
  }

  // Auto-create GitHub bucket if none exists
  if (!buckets.some((b) => b.provider === "github")) {
    const project = db.select({ repo: projects.repo, publicDir: projects.publicDir }).from(projects).where(eq(projects.id, id)).get();
    const repoName = project?.repo?.split("/").pop() ?? "GitHub";
    const pubDir = project?.publicDir || "public";
    const defaultConfig = JSON.stringify({ mediaDir: `${pubDir}/kern/media` });
    const isDefault = buckets.length === 0;
    const [created] = db.insert(mediaBuckets).values({
      projectId: id,
      name: repoName,
      provider: "github",
      config: defaultConfig,
      isDefault,
    }).returning().all();
    buckets.push(created);
  }

  return NextResponse.json({ buckets });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  await requireRole(id, session.user.id, ["admin"]);

  const { name, provider, config } = await request.json();

  const existingSameProvider = db
    .select({ id: mediaBuckets.id })
    .from(mediaBuckets)
    .where(and(eq(mediaBuckets.projectId, id), eq(mediaBuckets.provider, provider)))
    .get();

  if (existingSameProvider && provider === "github") {
    return NextResponse.json({ success: true, existing: true }, { status: 200 });
  }

  const anyExisting = db
    .select({ id: mediaBuckets.id })
    .from(mediaBuckets)
    .where(eq(mediaBuckets.projectId, id))
    .get();

  const isDefault = !anyExisting;

  db.insert(mediaBuckets)
    .values({
      projectId: id,
      name,
      provider,
      config: typeof config === "string" ? config : JSON.stringify(config ?? {}),
      isDefault,
    })
    .run();

  return NextResponse.json({ success: true }, { status: 201 });
}

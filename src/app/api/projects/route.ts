import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, isAdminRole } from "@/lib/auth-helpers";

export async function GET() {
  const session = await requireSession();

  if (isAdminRole(session.user.role)) {
    const rows = db
      .select({
        id: projects.id,
        name: projects.name,
        color: projects.color,
        url: projects.url,
        repo: projects.repo,
        branch: projects.branch,
        srcDir: projects.srcDir,
        publicDir: projects.publicDir,
        onboardingComplete: projects.onboardingComplete,
        kernInstalled: projects.kernInstalled,
        editorCaching: projects.editorCaching,
        localPath: projects.localPath,
        role: projectMembers.role,
      })
      .from(projects)
      .leftJoin(projectMembers, eq(projectMembers.projectId, projects.id))
      .where(eq(projectMembers.userId, session.user.id))
      .all()
      .map((row) => ({ ...row, role: row.role ?? "admin" }));

    const memberProjectIds = new Set(rows.map((r) => r.id));

    const allProjects = db.select({
      id: projects.id,
      name: projects.name,
      color: projects.color,
      url: projects.url,
      repo: projects.repo,
      branch: projects.branch,
      srcDir: projects.srcDir,
      publicDir: projects.publicDir,
      onboardingComplete: projects.onboardingComplete,
      kernInstalled: projects.kernInstalled,
      editorCaching: projects.editorCaching,
      localPath: projects.localPath,
    }).from(projects).all();

    for (const p of allProjects) {
      if (!memberProjectIds.has(p.id)) {
        rows.push({ ...p, role: "admin" });
      }
    }

    return NextResponse.json(rows);
  }

  const rows = db
    .select({
      id: projects.id,
      name: projects.name,
      color: projects.color,
      url: projects.url,
      repo: projects.repo,
      branch: projects.branch,
      srcDir: projects.srcDir,
      publicDir: projects.publicDir,
      onboardingComplete: projects.onboardingComplete,
      kernInstalled: projects.kernInstalled,
      editorCaching: projects.editorCaching,
      localPath: projects.localPath,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, session.user.id))
    .all();

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await requireSession();
  const { name, color, url, repo, branch } = await request.json();

  const [project] = db.insert(projects).values({
    name,
    color: color ?? "#3b82f6",
    url,
    repo,
    branch,
    createdBy: session.user.id,
  }).returning().all();

  db.insert(projectMembers).values({
    projectId: project.id,
    userId: session.user.id,
    role: "admin",
  }).run();

  return NextResponse.json(project);
}

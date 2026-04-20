import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects, pendingChanges } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { parseRepoString, getFileContent } from "@/lib/github-content";
import { readFileSync } from "fs";
import { join } from "path";

const DELETE_SENTINEL = "__KERN_DELETE__";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const url = new URL(request.url);
  const filePath = url.searchParams.get("path");
  if (!filePath) return NextResponse.json({ error: "path required" }, { status: 400 });

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project?.repo || !project?.branch) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const change = db.select({ content: pendingChanges.content }).from(pendingChanges)
    .where(and(eq(pendingChanges.projectId, id), eq(pendingChanges.filePath, filePath))).get();
  if (!change) return NextResponse.json({ error: "No pending change" }, { status: 404 });

  let original: string | null = null;

  if (project.localPath) {
    try {
      original = readFileSync(join(project.localPath, filePath), "utf-8");
    } catch { /* file may not exist yet */ }
  } else {
    const parsed = parseRepoString(project.repo);
    if (parsed) {
      original = await getFileContent(parsed.owner, parsed.repo, project.branch, filePath);
    }
  }

  const isDelete = change.content === DELETE_SENTINEL;
  const oldLines = original ? original.split("\n") : [];
  const newLines = isDelete ? [] : change.content.split("\n");

  const diff = computeLineDiff(oldLines, newLines);

  return NextResponse.json({ diff });
}

function computeLineDiff(oldLines: string[], newLines: string[]): string[] {
  const result: string[] = [];
  const max = Math.max(oldLines.length, newLines.length);
  let i = 0, j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      result.push(` ${oldLines[i]}`);
      i++; j++;
    } else {
      const lookAhead = findSync(oldLines, newLines, i, j, max);
      if (lookAhead) {
        while (i < lookAhead.oldIdx) { result.push(`-${oldLines[i]}`); i++; }
        while (j < lookAhead.newIdx) { result.push(`+${newLines[j]}`); j++; }
      } else {
        while (i < oldLines.length) { result.push(`-${oldLines[i]}`); i++; }
        while (j < newLines.length) { result.push(`+${newLines[j]}`); j++; }
      }
    }
  }
  return result;
}

function findSync(oldLines: string[], newLines: string[], oi: number, ni: number, maxLook: number) {
  const limit = Math.min(maxLook, 50);
  for (let d = 1; d < limit; d++) {
    for (let a = 0; a <= d; a++) {
      const b = d - a;
      if (oi + a < oldLines.length && ni + b < newLines.length && oldLines[oi + a] === newLines[ni + b]) {
        return { oldIdx: oi + a, newIdx: ni + b };
      }
    }
  }
  return null;
}

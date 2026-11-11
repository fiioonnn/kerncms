import { readFile } from "node:fs/promises";
import type { NextRequest } from "next/server";
import { safeJoin } from "@/server/content";
import { DRAFT_BRANCH, showFile } from "@/server/git";
import { getCommitDiff } from "@/server/queries";
import { getWorkspace } from "@/server/sites";

const SHA = /^[0-9a-f]{7,40}$/;

/**
 * Old and new text of one file, for the diff dialog.
 * - `?file=…&sha=…`              the change a commit made to the file
 * - `?file=…&compare=unsaved`    unsaved edits (worktree vs. last save)
 * - `?file=…&compare=live[&head=sha]`  live site vs. the draft (or a given commit)
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const file = params.get("file") ?? "";
  const sha = params.get("sha");
  const compare = params.get("compare");
  const head = params.get("head");
  if (!file) return Response.json({ error: "Datei fehlt." }, { status: 400 });

  const ws = await getWorkspace();
  let full: string;
  try {
    full = safeJoin(ws.dir, file);
  } catch {
    return Response.json({ error: "Ungültiger Pfad." }, { status: 400 });
  }
  const headers = { "Cache-Control": "no-store" };

  if (sha) {
    if (!SHA.test(sha)) return Response.json({ error: "Ungültige Version." }, { status: 400 });
    return Response.json(await getCommitDiff(sha, file), { headers });
  }
  if (compare === "unsaved") {
    const [before, after] = await Promise.all([showFile(ws.dir, "HEAD", file), readFile(full, "utf8").catch(() => null)]);
    return Response.json({ before: before ?? "", after: after ?? "" }, { headers });
  }
  if (compare === "live") {
    if (head && !SHA.test(head)) return Response.json({ error: "Ungültige Version." }, { status: 400 });
    const [before, after] = await Promise.all([showFile(ws.dir, ws.site.branch, file), showFile(ws.dir, head ?? DRAFT_BRANCH, file)]);
    return Response.json({ before: before ?? "", after: after ?? "" }, { headers });
  }
  return Response.json({ error: "Unbekannter Vergleich." }, { status: 400 });
}

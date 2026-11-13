import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { approvals, formSubmissions, notifications } from "@/db/schema";
import { latestDeploy } from "@/server/deploy";
import { uncommittedFiles, unpublishedFiles } from "@/server/git";
import { visibleTo } from "@/server/notifications";
import { getPreview } from "@/server/preview";
import { getWorkspace } from "@/server/sites";

/** Polled by the topbar and the editor: deploy progress, preview server, pending changes, unread notifications, nav badges. */
export async function GET(request: Request) {
  const ws = await getWorkspace();
  const [deploy, unsaved, unpublished, [unread], [formsUnread], [approvalsOpen]] = await Promise.all([
    latestDeploy(ws.site.id),
    uncommittedFiles(ws.dir),
    unpublishedFiles(ws.dir, ws.site.branch),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(visibleTo(ws.site.id, ws.user.id), sql`not (${notifications.readBy} ? ${ws.user.id})`)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(formSubmissions)
      .where(and(eq(formSubmissions.siteId, ws.site.id), eq(formSubmissions.read, false), eq(formSubmissions.archived, false), eq(formSubmissions.spam, false))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvals)
      .where(and(eq(approvals.siteId, ws.site.id), eq(approvals.status, "open"))),
  ]);
  return Response.json(
    {
      deploy: deploy && {
        id: deploy.id,
        status: deploy.status,
        message: deploy.message,
        steps: deploy.steps,
        createdAt: deploy.createdAt.toISOString(),
        finishedAt: deploy.finishedAt?.toISOString() ?? null,
      },
      // Polling from the editor keeps the preview server alive (see the idle stop in preview.ts).
      preview: getPreview(ws.site.id, { touch: new URL(request.headers.get("referer") ?? "http://x/").pathname.startsWith("/editor") }),
      unsaved,
      unpublished,
      unread: unread?.count ?? 0,
      formsUnread: formsUnread?.count ?? 0,
      approvalsOpen: approvalsOpen?.count ?? 0,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

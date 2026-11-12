"use server";

import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { approvals, formSubmissions, media, type MediaLocation, memberships, sites, trash } from "@/db/schema";
import { locateMedia, writeMedia } from "../media";
import { run } from "../action";
import { safeJoin } from "../content";
import { startPublish } from "../deploy";
import { commit, discard, DRAFT_BRANCH, git, resetDraftToLive, uncommittedFiles, unpublishedFiles, withSiteLock, worktreeDir } from "../git";
import { markAllRead, notify } from "../notifications";
import { ensurePreview, getPreview, stopPreview } from "../preview";
import { ForbiddenError, getSiteContext, getWorkspace, hasRole, requireRole, SITE_COOKIE, type Workspace } from "../sites";

function author(ws: Workspace) {
  return { id: ws.user.id, name: ws.user.name, email: ws.user.email };
}

function refresh() {
  revalidatePath("/", "layout");
}

/* ---------- Sites ---------- */

export async function switchSite(siteId: string) {
  return run(async () => {
    const ctx = await getSiteContext();
    if (!ctx.sites.some((s) => s.id === siteId)) throw new Error("Auf diese Website hast du keinen Zugriff.");
    (await cookies()).set(SITE_COOKIE, siteId, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 31_536_000 });
    refresh();
    return null;
  });
}

/**
 * Replaces the current site's draft with its live branch (old draft kept as a backup branch).
 * Offered when the draft has no kern.config.yaml but the live branch has one.
 */
export async function resetDraft() {
  return run(async () => {
    const ctx = await getSiteContext();
    if (!hasRole(ctx.role, "admin")) throw new ForbiddenError();
    const site = ctx.site;
    return withSiteLock(site.id, async () => {
      if (site.source === "github") {
        const github = await import("../github");
        await github.fetchRemote(site);
        const backup = await resetDraftToLive(site);
        // The old draft stays on GitHub as the backup branch, then the draft is replaced there too.
        await github.pushBranches(site, backup ? [backup] : []);
        await github.pushBranches(site, [DRAFT_BRANCH], { force: true });
        refresh();
        return { backup };
      }
      const backup = await resetDraftToLive(site);
      refresh();
      return { backup };
    });
  });
}

export async function updateSiteSettings(input: { name: string; liveUrl: string; requireApproval: boolean; analyticsEnabled: boolean }) {
  return run(async () => {
    const ctx = await requireRole("admin");
    if (!input.name.trim()) throw new Error("Die Website braucht einen Namen.");
    if (input.liveUrl && !/^https?:\/\//.test(input.liveUrl)) throw new Error("Die Adresse muss mit http:// oder https:// beginnen.");
    await db
      .update(sites)
      .set({ name: input.name.trim(), liveUrl: input.liveUrl.trim() || null, requireApproval: input.requireApproval, analyticsEnabled: input.analyticsEnabled })
      .where(eq(sites.id, ctx.site.id));
    refresh();
    return null;
  });
}

export async function disconnectSite(confirmName: string) {
  const result = await run(async () => {
    const ctx = await getSiteContext();
    // Customers can't remove their own site, not even as owners; that is up to the agency.
    if (!ctx.user.isAdmin) throw new ForbiddenError("Nur Plattform-Admins können eine Website trennen.");
    if (confirmName.trim() !== ctx.site.name) throw new Error("Der Name stimmt nicht überein.");
    stopPreview(ctx.site.id);
    const dir = worktreeDir(ctx.site);
    if (existsSync(dir)) await git(ctx.site.repoPath, ["worktree", "remove", "--force", dir]).catch(() => rm(dir, { recursive: true, force: true }));
    await db.delete(sites).where(eq(sites.id, ctx.site.id));
    (await cookies()).delete(SITE_COOKIE);
    return null;
  });
  if (result.ok) redirect("/sites");
  return result;
}

export async function leaveSite() {
  const result = await run(async () => {
    const ctx = await getSiteContext();
    if (ctx.role === "owner") {
      const owners = await db.select().from(memberships).where(and(eq(memberships.siteId, ctx.site.id), eq(memberships.role, "owner")));
      if (owners.length === 1) throw new Error("Du bist der einzige Inhaber. Übertrage die Website zuerst.");
    }
    await db.delete(memberships).where(and(eq(memberships.siteId, ctx.site.id), eq(memberships.userId, ctx.user.id)));
    (await cookies()).delete(SITE_COOKIE);
    return null;
  });
  if (result.ok) redirect("/");
  return result;
}

/* ---------- Preview ---------- */

async function cmsUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return process.env.KERN_PUBLIC_URL ?? `${proto}://${host}`;
}

export async function startPreview() {
  return run(async () => {
    const ws = await getWorkspace("viewer");
    void ensurePreview(ws.site, ws.dir, ws.config, await cmsUrl());
    return getPreview(ws.site.id);
  });
}

export async function restartPreview() {
  return run(async () => {
    const ws = await getWorkspace("editor");
    stopPreview(ws.site.id);
    void ensurePreview(ws.site, ws.dir, ws.config, await cmsUrl());
    return getPreview(ws.site.id);
  });
}

/* ---------- Publishing ---------- */

export async function publish(message?: string) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    if (ws.site.requireApproval && ws.role === "editor") {
      throw new Error("Auf dieser Website müssen Änderungen erst freigegeben werden.");
    }
    const deployId = await startPublish(ws.site, ws.dir, ws.config, author(ws), message?.trim() || "Änderungen veröffentlicht");
    refresh();
    return { deployId };
  });
}

/** Throws away every unpublished change and resets the draft to the live site. */
export async function discardAllChanges() {
  return run(async () => {
    const ws = await getWorkspace("admin");
    return withSiteLock(ws.site.id, async () => {
      await git(ws.dir, ["reset", "-q", "--hard", ws.site.branch]);
      await git(ws.dir, ["clean", "-fdq", "-e", "node_modules"]);
      refresh();
      return null;
    });
  });
}

export async function requestApproval(input: { title: string; note: string }) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    return withSiteLock(ws.site.id, async () => {
      await commit(ws.dir, "Zur Freigabe gespeichert", author(ws));
      const files = (await unpublishedFiles(ws.dir, ws.site.branch)).map((f) => f.file);
      if (files.length === 0) throw new Error("Es gibt keine Änderungen zum Freigeben.");
      const sha = (await git(ws.dir, ["rev-parse", DRAFT_BRANCH])).trim();
      await db.insert(approvals).values({
        siteId: ws.site.id,
        requestedBy: ws.user.id,
        title: input.title.trim() || "Änderungen",
        note: input.note.trim(),
        files,
        commit: sha,
      });
      await notify(ws.site.id, null, "approval", `${ws.user.name} bittet um Freigabe: ${input.title.trim() || "Änderungen"}`, "/approvals");
      refresh();
      return null;
    });
  });
}

export async function reviewApproval(id: string, decision: "approved" | "rejected", comment?: string) {
  return run(async () => {
    const ws = await getWorkspace("admin");
    const [approval] = await db.select().from(approvals).where(and(eq(approvals.id, id), eq(approvals.siteId, ws.site.id)));
    if (!approval || approval.status !== "open") throw new Error("Diese Anfrage ist schon erledigt.");
    await db
      .update(approvals)
      .set({ status: decision, reviewedBy: ws.user.id, reviewedAt: new Date(), comment: comment?.trim() || null })
      .where(eq(approvals.id, id));
    if (approval.requestedBy) {
      await notify(
        ws.site.id,
        approval.requestedBy,
        "approval",
        decision === "approved" ? `„${approval.title}“ wurde freigegeben` : `„${approval.title}“ wurde abgelehnt`,
        "/approvals",
      );
    }
    let deployId: string | null = null;
    if (decision === "approved") {
      deployId = await startPublish(ws.site, ws.dir, ws.config, author(ws), approval.title);
    }
    refresh();
    return { deployId };
  });
}

/* ---------- History ---------- */

export async function restoreVersion(file: string, sha: string) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error("Ungültige Version.");
    safeJoin(ws.dir, file);
    return withSiteLock(ws.site.id, async () => {
      await git(ws.dir, ["checkout", sha, "--", file]);
      const committed = await commit(ws.dir, `Version vom ${sha.slice(0, 7)} wiederhergestellt`, author(ws), [file]);
      refresh();
      return { sha: committed };
    });
  });
}

/** Undoes all edits since the last save for the given files (or everything). */
export async function discardUnsaved(files?: string[]) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    return withSiteLock(ws.site.id, async () => {
      const targets = files ?? (await uncommittedFiles(ws.dir));
      for (const file of targets) safeJoin(ws.dir, file);
      await discard(ws.dir, targets);
      refresh();
      return null;
    });
  });
}

/* ---------- Trash ---------- */

export async function restoreFromTrash(id: string) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    const [item] = await db.select().from(trash).where(and(eq(trash.id, id), eq(trash.siteId, ws.site.id)));
    if (!item) throw new Error("Nicht mehr im Papierkorb.");
    return withSiteLock(ws.site.id, async () => {
      const location = (item.meta.location ?? "repo") as MediaLocation;
      if (item.kind === "media" && location !== "repo") {
        // Back into the storage it came from (or the repository if that storage is gone).
        const name = path.basename(item.path);
        if (await locateMedia(ws.site.id, ws.dir, ws.config, name)) throw new Error(`„${name}“ gibt es schon.`);
        let restoredTo: MediaLocation = location;
        try {
          await writeMedia(ws.site.id, ws.dir, ws.config, location, name, Buffer.from(item.content, "base64"));
        } catch {
          restoredTo = "repo";
          await writeMedia(ws.site.id, ws.dir, ws.config, "repo", name, Buffer.from(item.content, "base64"));
        }
        await db
          .update(media)
          .set({ alt: item.meta.alt ?? "", caption: item.meta.caption ?? "" })
          .where(and(eq(media.siteId, ws.site.id), eq(media.name, name)));
        if (restoredTo === "repo") await commit(ws.dir, `„${item.label}“ wiederhergestellt`, author(ws), [item.path]);
        await db.delete(trash).where(eq(trash.id, id));
        refresh();
        return null;
      }
      const target = safeJoin(ws.dir, item.path);
      if (existsSync(target)) throw new Error(`Unter ${item.path} liegt schon eine Datei.`);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, item.binary ? Buffer.from(item.content, "base64") : item.content);
      if (item.kind === "media") {
        await db
          .insert(media)
          .values({ siteId: ws.site.id, name: path.basename(item.path), alt: item.meta.alt ?? "", caption: item.meta.caption ?? "" })
          .onConflictDoNothing();
      }
      await commit(ws.dir, `„${item.label}“ wiederhergestellt`, author(ws), [item.path]);
      await db.delete(trash).where(eq(trash.id, id));
      refresh();
      return null;
    });
  });
}

export async function deleteFromTrash(ids: string[]) {
  return run(async () => {
    const ws = await getWorkspace("admin");
    if (ids.length) await db.delete(trash).where(and(eq(trash.siteId, ws.site.id), inArray(trash.id, ids)));
    refresh();
    return null;
  });
}

export async function emptyTrash() {
  return run(async () => {
    const ws = await getWorkspace("admin");
    await db.delete(trash).where(eq(trash.siteId, ws.site.id));
    refresh();
    return null;
  });
}


/* ---------- Form submissions ---------- */

export async function updateSubmissions(ids: string[], change: { read?: boolean; archived?: boolean }) {
  return run(async () => {
    const ctx = await requireRole("editor");
    if (ids.length) {
      await db
        .update(formSubmissions)
        .set(change)
        .where(and(eq(formSubmissions.siteId, ctx.site.id), inArray(formSubmissions.id, ids)));
    }
    refresh();
    return null;
  });
}

export async function deleteSubmissions(ids: string[]) {
  return run(async () => {
    const ctx = await requireRole("editor");
    if (ids.length) await db.delete(formSubmissions).where(and(eq(formSubmissions.siteId, ctx.site.id), inArray(formSubmissions.id, ids)));
    refresh();
    return null;
  });
}

/* ---------- Notifications ---------- */

export async function markNotificationsRead() {
  return run(async () => {
    const ctx = await getSiteContext();
    await markAllRead(ctx.site.id, ctx.user.id);
    refresh();
    return null;
  });
}

import "server-only";
import type { Role } from "@/db/schema";
import type { EntryValues, PageSeo, Redirect } from "@/lib/kern-types";
import type { ActionResult } from "../action";
import { deleteEntry, deletePage, discardPage, duplicateEntry, duplicatePage, createPage, saveEntry, saveGlobal, saveRedirects, updatePageSettings } from "../actions/content";
import { resendSubmissionMail, saveFormSettings } from "../actions/forms";
import { createMediaFolder, deleteMedia, deleteMediaFolder, moveMediaToFolder, renameMediaFolder, saveMediaMeta } from "../actions/media";
import { saveSeoKeyword } from "../actions/seo";
import {
  deleteFromTrash,
  deleteSubmissions,
  discardAllChanges,
  discardUnsaved,
  emptyTrash,
  publish,
  requestApproval,
  restartPreview,
  restoreFromTrash,
  restoreVersion,
  reviewApproval,
  updateSiteSettings,
  updateSubmissions,
} from "../actions/site";
import { changeRole, inviteMember, removeMember, revokeInvite } from "../actions/team";
import { findCollection, findGlobal } from "../config";
import { readEntry, readGlobal, readPage } from "../content";
import { getApprovals, getMedia, getSettings, getTeam, getTrash } from "../queries";
import { json, str, ToolError, type Args, type ToolContext, type ToolDef } from "./tool-kit";

/*
 * Everything the person can change in the CMS, as tools. Each tool calls the same server action the UI
 * calls, inside the person's own request, so the action checks their role exactly as for a click:
 * the assistant can never do more than the person could. Platform administration (customers, sites,
 * AI settings, storage keys) is left out on purpose.
 */

const ROLES: Role[] = ["owner", "admin", "editor", "viewer"];

function list(args: Args, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) throw new ToolError(`Parameter "${key}" muss eine Liste von Texten sein.`);
  return value as string[];
}

function obj(args: Args, key: string, required = true): Record<string, unknown> {
  const value = args[key];
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (required) throw new ToolError(`Parameter "${key}" muss ein Objekt sein.`);
  return {};
}

function bool(args: Args, key: string): boolean | undefined {
  return typeof args[key] === "boolean" ? (args[key] as boolean) : undefined;
}

/** Unwraps a server action result; a refusal (missing rights, validation) becomes the tool's error. */
async function act<T>(ctx: ToolContext, call: () => Promise<ActionResult<T>>, done: (data: T) => string) {
  // The run's own file edits go into the draft first, so the action (publish, approval, …) sees them.
  await ctx.flush();
  const result = await call();
  if (!result.ok) {
    const fields = result.errors ? ` (${Object.entries(result.errors).map(([k, v]) => `${k}: ${v}`).join("; ")})` : "";
    throw new ToolError(`${result.error}${fields}`);
  }
  return done(result.data);
}

const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required });
const S = (description: string) => ({ type: "string", description });
const B = (description: string) => ({ type: "boolean", description });
const L = (description: string) => ({ type: "array", items: { type: "string" }, description });

/* ---------- Read what the actions need (ids, current values) ---------- */

const READ_TOOLS: ToolDef[] = [
  {
    name: "get_settings",
    description: "Current site settings (name, live URL, approvals, statistics), the person's role, redirects and the notification/auto-reply settings of each form.",
    schema: schema({}),
    label: () => "Liest die Einstellungen",
    async run() {
      const s = await getSettings();
      return json({ role: s.role, site: { name: s.site.name, liveUrl: s.site.liveUrl, requireApproval: s.site.requireApproval, analyticsEnabled: s.site.analyticsEnabled, analyticsPersonal: s.site.analyticsPersonal }, redirects: s.redirects, formSettings: s.formSettings, mediaStorage: s.media.storage });
    },
  },
  {
    name: "get_team",
    description: "Team members of the site (user id, name, email, role) and open invitations (id, email, role).",
    schema: schema({}),
    label: () => "Sieht sich das Team an",
    async run() {
      return json(await getTeam());
    },
  },
  {
    name: "list_media",
    description: "Files in the media library: name, value to use in content, type, size, alt text, caption, tags, folder, where it is used.",
    schema: schema({ folder: S("Only this folder (optional)") }),
    label: () => "Sieht sich die Medien an",
    async run(_ctx, args) {
      const folder = str(args, "folder", false);
      const items = (await getMedia()).filter((m) => !folder || m.folder === folder);
      return json(items.slice(0, 300).map((m) => ({ name: m.name, value: m.value, type: m.type, size: m.size, width: m.width, height: m.height, alt: m.alt, caption: m.caption, tags: m.tags, folder: m.folder, usedIn: m.usedIn })));
    },
  },
  {
    name: "list_approvals",
    description: "Approval requests (id, title, note, files, status open/approved/rejected, who asked, who reviewed).",
    schema: schema({}),
    label: () => "Sieht sich die Freigaben an",
    async run() {
      return json((await getApprovals()).slice(0, 40));
    },
  },
  {
    name: "list_trash",
    description: "Deleted pages, entries and files in the trash (id, kind, label, deleted by/at). Items are removed for good after 30 days.",
    schema: schema({}),
    label: () => "Sieht in den Papierkorb",
    async run() {
      return json((await getTrash()).map(({ id, kind, label, path, deletedBy, deletedAt }) => ({ id, kind, label, path, deletedBy, deletedAt })));
    },
  },
];

/* ---------- Change things ---------- */

const CHANGE_TOOLS: ToolDef[] = [
  // Pages
  {
    name: "create_page",
    description: "Creates a new page (empty, or as a copy of another page's blocks). Editors and up.",
    schema: schema({ title: S("Page title"), path: S("URL path, e.g. /angebot (optional, derived from the title)"), copy_from: S("File name of a page whose blocks to copy (optional)") }, ["title"]),
    label: (a) => `Legt die Seite „${String(a.title ?? "")}“ an`,
    run: (ctx, a) => act(ctx, () => createPage({ title: str(a, "title"), path: str(a, "path", false), copyFrom: str(a, "copy_from", false) || undefined }), (d) => `Angelegt: ${json(d)}`),
  },
  {
    name: "update_page_settings",
    description: "Changes a page's title, URL path and SEO fields (title, description, image, noindex). Only the given fields change. Editors and up.",
    schema: schema(
      { page: S("Page file name"), title: S("Page title"), path: S("URL path"), seo_title: S("SEO title"), seo_description: S("Meta description"), seo_image: S("Social image (media value)"), noindex: B("Hide from search engines") },
      ["page"],
    ),
    label: (a) => `Ändert die Einstellungen der Seite ${String(a.page ?? "")}`,
    async run(ctx, a) {
      const name = str(a, "page");
      const page = await readPage(ctx.dir, ctx.config, name).catch(() => {
        throw new ToolError(`Die Seite ${name} gibt es nicht.`);
      });
      const seo: PageSeo = { ...page.seo };
      if (typeof a.seo_title === "string") seo.title = a.seo_title;
      if (typeof a.seo_description === "string") seo.description = a.seo_description;
      if (typeof a.seo_image === "string") seo.image = a.seo_image;
      if (typeof a.noindex === "boolean") seo.noindex = a.noindex;
      return act(ctx, () => updatePageSettings(name, { title: str(a, "title", false) || page.title, path: str(a, "path", false) || page.path, seo }), () => `Gespeichert: ${name}`);
    },
  },
  {
    name: "duplicate_page",
    description: "Duplicates a page. Editors and up.",
    schema: schema({ page: S("Page file name") }, ["page"]),
    label: (a) => `Dupliziert die Seite ${String(a.page ?? "")}`,
    run: (ctx, a) => act(ctx, () => duplicatePage(str(a, "page")), (d) => `Kopie angelegt: ${d.name}`),
  },
  {
    name: "delete_page",
    description: "Moves a page to the trash (not the start page). Editors and up. Ask the person first.",
    schema: schema({ page: S("Page file name") }, ["page"]),
    label: (a) => `Löscht die Seite ${String(a.page ?? "")}`,
    run: (ctx, a) => act(ctx, () => deletePage(str(a, "page")), () => "In den Papierkorb gelegt."),
  },
  {
    name: "discard_page_changes",
    description: "Throws away unsaved edits of a page (back to its last saved version). Editors and up.",
    schema: schema({ page: S("Page file name") }, ["page"]),
    label: (a) => `Verwirft ungespeicherte Änderungen an ${String(a.page ?? "")}`,
    run: (ctx, a) => act(ctx, () => discardPage(str(a, "page")), () => "Verworfen."),
  },
  {
    name: "set_seo_keyword",
    description: "Sets the focus keyword of a page (used by seo_check and the editor's SEO panel). Editors and up.",
    schema: schema({ page: S("Page file name"), keyword: S("Focus keyword, empty to remove") }, ["page", "keyword"]),
    label: (a) => `Setzt das Keyword von ${String(a.page ?? "")}`,
    run: (ctx, a) => act(ctx, () => saveSeoKeyword(str(a, "page"), str(a, "keyword")), () => "Gespeichert."),
  },
  // Collections and globals
  {
    name: "save_entry",
    description:
      "Creates a collection entry (without id) or changes one (with id; only the given fields change). Values follow the collection's fields in kern.config.yaml. Editors and up.",
    schema: schema({ collection: S("Collection key"), id: S("Entry id (omit to create)"), values: { type: "object", description: "Field values" } }, ["collection", "values"]),
    label: (a) => (a.id ? `Ändert den Eintrag ${String(a.id)}` : `Legt einen Eintrag in ${String(a.collection ?? "")} an`),
    async run(ctx, a) {
      const key = str(a, "collection");
      const id = str(a, "id", false) || null;
      const collection = findCollection(ctx.config, key);
      if (!collection) throw new ToolError(`Die Sammlung ${key} gibt es nicht.`);
      const current: EntryValues = id ? await readEntry(ctx.dir, collection, id).catch(() => ({})) : {};
      return act(ctx, () => saveEntry(key, id, { ...current, ...obj(a, "values") }), (d) => `Gespeichert: ${collection.key}/${d.id}`);
    },
  },
  {
    name: "duplicate_entry",
    description: "Duplicates a collection entry. Editors and up.",
    schema: schema({ collection: S("Collection key"), id: S("Entry id") }, ["collection", "id"]),
    label: (a) => `Dupliziert den Eintrag ${String(a.id ?? "")}`,
    run: (ctx, a) => act(ctx, () => duplicateEntry(str(a, "collection"), str(a, "id")), (d) => `Kopie: ${json(d)}`),
  },
  {
    name: "delete_entry",
    description: "Moves a collection entry to the trash. Editors and up. Ask the person first.",
    schema: schema({ collection: S("Collection key"), id: S("Entry id") }, ["collection", "id"]),
    label: (a) => `Löscht den Eintrag ${String(a.id ?? "")}`,
    run: (ctx, a) => act(ctx, () => deleteEntry(str(a, "collection"), str(a, "id")), () => "In den Papierkorb gelegt."),
  },
  {
    name: "save_global",
    description: "Changes a global (header, footer, contact data, …). Only the given top-level fields change. Editors and up.",
    schema: schema({ key: S("Global key"), values: { type: "object", description: "Field values" } }, ["key", "values"]),
    label: (a) => `Ändert das Global ${String(a.key ?? "")}`,
    async run(ctx, a) {
      const key = str(a, "key");
      const global = findGlobal(ctx.config, key);
      if (!global) throw new ToolError(`Das Global ${key} gibt es nicht.`);
      const current = await readGlobal(ctx.dir, global);
      return act(ctx, () => saveGlobal(key, { ...current, ...obj(a, "values") }), () => `Gespeichert: ${global.label}`);
    },
  },
  {
    name: "save_redirects",
    description: "Replaces the whole list of redirects (read the current list with get_settings first). Admins and up.",
    schema: schema(
      {
        redirects: {
          type: "array",
          items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, status: { type: "integer", enum: [301, 302] } }, required: ["from", "to", "status"] },
        },
      },
      ["redirects"],
    ),
    label: () => "Ändert die Weiterleitungen",
    async run(ctx, a) {
      if (!Array.isArray(a.redirects)) throw new ToolError("redirects muss eine Liste sein.");
      return act(ctx, () => saveRedirects(a.redirects as Redirect[]), (d) => `Gespeichert: ${json(d)}`);
    },
  },
  // Media
  {
    name: "update_media",
    description: "Changes alt text, caption or tags of a media file. Editors and up.",
    schema: schema({ name: S("File name"), alt: S("Alt text"), caption: S("Caption"), tags: L("Tags") }, ["name"]),
    label: (a) => `Ändert die Angaben zu ${String(a.name ?? "")}`,
    run: (ctx, a) =>
      act(
        ctx,
        () =>
          saveMediaMeta(str(a, "name"), {
            ...(typeof a.alt === "string" && { alt: a.alt }),
            ...(typeof a.caption === "string" && { caption: a.caption }),
            ...(Array.isArray(a.tags) && { tags: list(a, "tags") }),
          }),
        () => "Gespeichert.",
      ),
  },
  {
    name: "delete_media",
    description: "Moves media files to the trash. Editors and up. Ask the person first.",
    schema: schema({ names: L("File names") }, ["names"]),
    label: (a) => `Löscht ${Array.isArray(a.names) ? a.names.length : ""} Mediendatei(en)`,
    run: (ctx, a) => act(ctx, () => deleteMedia(list(a, "names")), (d) => `Erledigt: ${json(d)}`),
  },
  {
    name: "media_folders",
    description: "Media folders: create a folder, move files into a folder (\"\" = top level), rename or delete a folder (its files move to the top level). Editors and up.",
    schema: schema(
      { action: { type: "string", enum: ["create", "move", "rename", "delete"] }, folder: S("Folder, e.g. Team/Portraits"), names: L("Files to move (move)"), new_name: S("New folder path (rename)") },
      ["action", "folder"],
    ),
    label: (a) => `Ordnet Medien (${String(a.action ?? "")} ${String(a.folder ?? "")})`,
    run(ctx, a) {
      const folder = str(a, "folder");
      switch (a.action) {
        case "create":
          return act(ctx, () => createMediaFolder(folder), () => "Ordner angelegt.");
        case "move":
          return act(ctx, () => moveMediaToFolder(list(a, "names"), folder), () => "Verschoben.");
        case "rename":
          return act(ctx, () => renameMediaFolder(folder, str(a, "new_name")), () => "Umbenannt.");
        case "delete":
          return act(ctx, () => deleteMediaFolder(folder), () => "Ordner gelöscht.");
        default:
          throw new ToolError("action muss create, move, rename oder delete sein.");
      }
    },
  },
  // Forms
  {
    name: "update_form_submissions",
    description: "Marks form messages (ids from list_form_submissions) as read/unread, archived/unarchived or spam/not spam. Editors and up.",
    schema: schema({ ids: L("Message ids"), read: B("Read"), archived: B("Archived"), spam: B("Spam") }, ["ids"]),
    label: (a) => `Ändert ${Array.isArray(a.ids) ? a.ids.length : ""} Formular-Nachricht(en)`,
    run: (ctx, a) =>
      act(
        ctx,
        () => updateSubmissions(list(a, "ids"), { ...(bool(a, "read") !== undefined && { read: bool(a, "read") }), ...(bool(a, "archived") !== undefined && { archived: bool(a, "archived") }), ...(bool(a, "spam") !== undefined && { spam: bool(a, "spam") }) }),
        () => "Gespeichert.",
      ),
  },
  {
    name: "delete_form_submissions",
    description: "Deletes form messages for good. Editors and up. Ask the person first; this cannot be undone.",
    schema: schema({ ids: L("Message ids") }, ["ids"]),
    label: (a) => `Löscht ${Array.isArray(a.ids) ? a.ids.length : ""} Formular-Nachricht(en)`,
    run: (ctx, a) => act(ctx, () => deleteSubmissions(list(a, "ids")), () => "Gelöscht."),
  },
  {
    name: "resend_form_mail",
    description: "Sends the notification mail of a form message again. Editors and up.",
    schema: schema({ id: S("Message id") }, ["id"]),
    label: () => "Verschickt die Benachrichtigung erneut",
    run: (ctx, a) => act(ctx, () => resendSubmissionMail(str(a, "id")), () => "Verschickt."),
  },
  {
    name: "update_form_settings",
    description: "Changes a form's notification mail (on/off, recipients, subject) and auto-reply (subject, text). Only the given fields change. Admins and up.",
    schema: schema(
      { form: S("Form key"), notify: B("Send notification mails"), recipients: L("Recipient emails (max 10)"), subject: S("Notification subject"), reply_subject: S("Auto-reply subject"), reply_body: S("Auto-reply text") },
      ["form"],
    ),
    label: (a) => `Ändert die Einstellungen des Formulars ${String(a.form ?? "")}`,
    async run(ctx, a) {
      const form = str(a, "form");
      const current = (await getSettings()).formSettings[form];
      if (!current) throw new ToolError(`Das Formular ${form} gibt es nicht.`);
      return act(
        ctx,
        () =>
          saveFormSettings(form, {
            notify: bool(a, "notify") ?? current.notify,
            recipients: Array.isArray(a.recipients) ? list(a, "recipients") : current.recipients,
            subject: typeof a.subject === "string" ? a.subject : current.subject,
            replySubject: typeof a.reply_subject === "string" ? a.reply_subject : current.replySubject,
            replyBody: typeof a.reply_body === "string" ? a.reply_body : current.replyBody,
          }),
        () => "Gespeichert.",
      );
    },
  },
  // Site settings
  {
    name: "update_site_settings",
    description: "Changes the site's name, live URL, whether changes need approval, and the statistics switches. Only the given fields change. Admins and up.",
    schema: schema({ name: S("Site name"), live_url: S("Live URL (https://…), empty to remove"), require_approval: B("Changes need approval"), analytics_enabled: B("Statistics on"), analytics_personal: B("Recognise returning visitors") }),
    label: () => "Ändert die Website-Einstellungen",
    run(ctx, a) {
      const s = ctx.site;
      return act(
        ctx,
        () =>
          updateSiteSettings({
            name: str(a, "name", false) || s.name,
            liveUrl: typeof a.live_url === "string" ? a.live_url : (s.liveUrl ?? ""),
            requireApproval: bool(a, "require_approval") ?? s.requireApproval,
            analyticsEnabled: bool(a, "analytics_enabled") ?? s.analyticsEnabled,
            analyticsPersonal: bool(a, "analytics_personal") ?? s.analyticsPersonal,
          }),
        () => "Gespeichert.",
      );
    },
  },
  // Publishing, approvals, history
  {
    name: "publish",
    description: "Publishes all saved changes of the draft to the live website (starts a deploy). Editors and up; on sites that need approval only admins. Ask the person first.",
    schema: schema({ message: S("Short description of what goes live") }),
    label: () => "Veröffentlicht die Änderungen",
    run: (ctx, a) => act(ctx, () => publish(str(a, "message", false)), (d) => `Veröffentlichung gestartet (Deploy ${d.deployId}). Fortschritt im Verlauf.`),
  },
  {
    name: "request_approval",
    description: "Asks the admins to approve the current changes (on sites that need approval). Editors and up.",
    schema: schema({ title: S("Title"), note: S("Note for the reviewers") }, ["title"]),
    label: () => "Bittet um Freigabe",
    run: (ctx, a) => act(ctx, () => requestApproval({ title: str(a, "title"), note: str(a, "note", false) }), () => "Freigabe angefragt."),
  },
  {
    name: "review_approval",
    description: "Approves (and publishes) or rejects an approval request. Admins and up. Ask the person first.",
    schema: schema({ id: S("Approval id"), decision: { type: "string", enum: ["approved", "rejected"] }, comment: S("Comment (optional)") }, ["id", "decision"]),
    label: (a) => (a.decision === "approved" ? "Gibt Änderungen frei" : "Lehnt Änderungen ab"),
    run(ctx, a) {
      const decision = a.decision === "approved" ? "approved" : a.decision === "rejected" ? "rejected" : null;
      if (!decision) throw new ToolError("decision muss approved oder rejected sein.");
      return act(ctx, () => reviewApproval(str(a, "id"), decision, str(a, "comment", false)), () => (decision === "approved" ? "Freigegeben und Veröffentlichung gestartet." : "Abgelehnt."));
    },
  },
  {
    name: "restore_version",
    description: "Restores a file to its state in an earlier version (sha from get_history) and saves it in the draft. Editors and up.",
    schema: schema({ file: S("Repo-relative file"), sha: S("Version sha") }, ["file", "sha"]),
    label: (a) => `Stellt ${String(a.file ?? "")} wieder her`,
    run: (ctx, a) => act(ctx, () => restoreVersion(str(a, "file"), str(a, "sha")), () => "Wiederhergestellt."),
  },
  {
    name: "discard_unsaved",
    description: "Throws away unsaved edits (not yet saved to the draft) of the given files, or of all files. Editors and up. Ask the person first.",
    schema: schema({ files: L("Repo-relative files (optional, default all)") }),
    label: () => "Verwirft ungespeicherte Änderungen",
    run: (ctx, a) => act(ctx, () => discardUnsaved(Array.isArray(a.files) ? list(a, "files") : undefined), () => "Verworfen."),
  },
  {
    name: "discard_all_changes",
    description: "Resets the draft to the live website: every change that is not live is lost. Admins and up. Only after the person explicitly confirmed.",
    schema: schema({}),
    label: () => "Setzt den Entwurf auf die Live-Website zurück",
    run: (ctx) => act(ctx, () => discardAllChanges(), () => "Entwurf zurückgesetzt."),
  },
  {
    name: "restart_preview",
    description: "Restarts the preview dev server (e.g. after it got stuck or after dependency changes).",
    schema: schema({}),
    label: () => "Startet die Vorschau neu",
    run: (ctx) => act(ctx, () => restartPreview(), () => "Vorschau wird neu gestartet."),
  },
  // Trash
  {
    name: "trash",
    description: "Restores an item from the trash, deletes items for good, or empties the trash. Ask the person before deleting for good.",
    schema: schema({ action: { type: "string", enum: ["restore", "delete", "empty"] }, ids: L("Trash item ids (restore: exactly one)") }, ["action"]),
    label: (a) => (a.action === "restore" ? "Stellt aus dem Papierkorb wieder her" : "Leert den Papierkorb"),
    run(ctx, a) {
      if (a.action === "restore") return act(ctx, () => restoreFromTrash(list(a, "ids")[0] ?? ""), () => "Wiederhergestellt.");
      if (a.action === "delete") return act(ctx, () => deleteFromTrash(list(a, "ids")), () => "Endgültig gelöscht.");
      if (a.action === "empty") return act(ctx, () => emptyTrash(), () => "Papierkorb geleert.");
      throw new ToolError("action muss restore, delete oder empty sein.");
    },
  },
  // Team
  {
    name: "team",
    description: "Invites someone by email, revokes an invitation, changes a member's role or removes a member (ids from get_team). Roles: owner, admin, editor, viewer. Admins and up (only owners may hand out owner). Ask the person first.",
    schema: schema(
      { action: { type: "string", enum: ["invite", "revoke_invite", "change_role", "remove"] }, email: S("Email (invite)"), role: { type: "string", enum: ROLES }, user_id: S("User id (change_role, remove)"), invite_id: S("Invite id (revoke_invite)") },
      ["action"],
    ),
    label: (a) => ({ invite: `Lädt ${String(a.email ?? "")} ein`, revoke_invite: "Zieht eine Einladung zurück", change_role: "Ändert eine Rolle", remove: "Entfernt ein Teammitglied" })[String(a.action)] ?? "Ändert das Team",
    run(ctx, a) {
      const role = ROLES.find((r) => r === a.role);
      switch (a.action) {
        case "invite":
          if (!role) throw new ToolError("role fehlt.");
          return act(ctx, () => inviteMember({ email: str(a, "email"), role }), () => "Einladung verschickt.");
        case "revoke_invite":
          return act(ctx, () => revokeInvite(str(a, "invite_id")), () => "Einladung zurückgezogen.");
        case "change_role":
          if (!role) throw new ToolError("role fehlt.");
          return act(ctx, () => changeRole(str(a, "user_id"), role), () => "Rolle geändert.");
        case "remove":
          return act(ctx, () => removeMember(str(a, "user_id")), () => "Entfernt.");
        default:
          throw new ToolError("Unbekannte action.");
      }
    },
  },
];

export const ACTION_TOOLS: ToolDef[] = [...READ_TOOLS, ...CHANGE_TOOLS];

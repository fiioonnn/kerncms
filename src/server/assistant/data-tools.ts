import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { approvals, deploys, formSubmissions, memberships, seoKeywords, users } from "@/db/schema";
import { scoreSeo } from "@/lib/seo";
import { analyticsSummary } from "../analytics";
import { getChangeSet, listEntries, listPages } from "../content";
import { git, log, uncommittedFiles, unpublishedFiles } from "../git";
import { analyzePreview } from "../seo/analyze";
import { hasRole } from "../sites";
import { int, json, str, ToolError, type ToolDef } from "./tool-kit";

/*
 * Read-only tools for the site's data next to the repository: statistics, form messages, history and
 * deploys, SEO of a rendered page, and an overview (collections, team, open items). Each tool checks
 * the person's role the same way the matching CMS page does.
 */

const DAY = 86_400_000;

export const DATA_TOOLS: ToolDef[] = [
  {
    name: "site_overview",
    description:
      "Overview of the website in kerncms: name, live URL, whether statistics are on, pages, collections with entry counts, globals, forms, team members with roles, unread form messages, open approvals and unpublished changes. A good first step for questions about the site as a whole.",
    schema: { type: "object", properties: {}, required: [] },
    label: () => "Verschafft sich einen Überblick",
    async run(ctx) {
      const changes = await getChangeSet(ctx.dir, ctx.site.branch);
      const [pages, collections, team, unread, open] = await Promise.all([
        listPages(ctx.dir, ctx.config, changes),
        Promise.all(
          ctx.config.collections.map(async (c) => {
            const entries = await listEntries(ctx.dir, c, changes);
            return { key: c.key, label: c.label, path: c.path, entries: entries.length, notLive: entries.filter((e) => e.status !== "live").length };
          }),
        ),
        db.select({ name: users.name, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.siteId, ctx.siteId)),
        hasRole(ctx.role, "editor")
          ? db
              .select({ id: formSubmissions.id })
              .from(formSubmissions)
              .where(and(eq(formSubmissions.siteId, ctx.siteId), eq(formSubmissions.read, false), eq(formSubmissions.archived, false), eq(formSubmissions.spam, false)))
          : Promise.resolve(null),
        db.select({ id: approvals.id }).from(approvals).where(and(eq(approvals.siteId, ctx.siteId), eq(approvals.status, "open"))),
      ]);
      return json({
        site: { name: ctx.site.name, liveUrl: ctx.site.liveUrl, liveBranch: ctx.site.branch, statistics: ctx.site.analyticsEnabled, requireApproval: ctx.site.requireApproval },
        pages: pages.map((p) => ({ name: p.name, title: p.title, path: p.path, status: p.status, blocks: p.blocks, updatedAt: p.updatedAt, updatedBy: p.updatedBy })),
        collections,
        globals: ctx.config.globals.map((g) => ({ key: g.key, label: g.label, file: g.path })),
        forms: ctx.config.forms.map((f) => ({ key: f.key, label: f.label })),
        team,
        unreadFormMessages: unread ? unread.length : "keine Berechtigung",
        openApprovals: open.length,
        unpublishedChanges: changes.unsaved.size + changes.unpublished.size,
      });
    },
  },
  {
    name: "get_analytics",
    description:
      "Website statistics of the last N days (cookieless, kerncms' own): visitors, page views, visits, average duration, change against the period before, daily series, top pages, referrers, channels, campaigns (UTM), devices, browsers, countries, clicks on phone/mail/download/outbound links, contact rate, form submissions and peak times (weekday × hour, 1 = Monday). Use it for any question about traffic or how the site performs.",
    schema: {
      type: "object",
      properties: { days: { type: "integer", description: "Number of days up to today, 1–365. Default 30." } },
      required: [],
    },
    label: (a) => `Liest die Statistiken (${typeof a.days === "number" ? a.days : 30} Tage)`,
    async run(ctx, args) {
      if (!ctx.site.analyticsEnabled) return "Die Statistiken sind für diese Website ausgeschaltet (Einstellungen → Statistiken). Es gibt keine Daten.";
      const days = int(args, "days", 30, 1, 365);
      const summary = await analyticsSummary(ctx.siteId, days, ctx.site.analyticsPersonal);
      return json({ ...summary, recent: summary.recent.slice(0, 20), note: "Changes are percentages against the previous period of the same length. avgDuration/avgSeconds are seconds." });
    },
  },
  {
    name: "list_form_submissions",
    description:
      "Messages sent through the website's forms (newest first) with their fields, the page they came from, read/archived/spam state and whether the notification mail went out. Only for editors and up.",
    schema: {
      type: "object",
      properties: {
        form: { type: "string", description: "Only this form key (optional)" },
        days: { type: "integer", description: "Only the last N days (optional)" },
        limit: { type: "integer", description: "At most this many, 1–200. Default 50." },
        unread_only: { type: "boolean" },
        include_spam: { type: "boolean", description: "Also messages the spam filter caught. Default false." },
      },
      required: [],
    },
    label: () => "Liest die Formular-Nachrichten",
    async run(ctx, args) {
      if (!hasRole(ctx.role, "editor")) throw new ToolError("Formular-Nachrichten dürfen nur Redakteure, Admins und Inhaber sehen.");
      const form = str(args, "form", false);
      const days = int(args, "days", 0, 0, 3650);
      const conditions = [eq(formSubmissions.siteId, ctx.siteId)];
      if (form) conditions.push(eq(formSubmissions.form, form));
      if (days) conditions.push(gte(formSubmissions.createdAt, new Date(Date.now() - days * DAY)));
      if (args.unread_only === true) conditions.push(eq(formSubmissions.read, false));
      if (args.include_spam !== true) conditions.push(eq(formSubmissions.spam, false));
      const rows = await db
        .select()
        .from(formSubmissions)
        .where(and(...conditions))
        .orderBy(desc(formSubmissions.createdAt))
        .limit(int(args, "limit", 50, 1, 200));
      if (rows.length === 0) return "Keine Nachrichten.";
      const labels = new Map(ctx.config.forms.map((f) => [f.key, f.label]));
      return json(
        rows.map((r) => ({
          id: r.id,
          form: labels.get(r.form) ?? r.form,
          at: r.createdAt.toISOString(),
          page: r.page,
          data: r.data,
          read: r.read,
          archived: r.archived,
          spam: r.spam ? (r.spamReason ?? true) : false,
          mail: r.mailStatus,
        })),
      );
    },
  },
  {
    name: "get_history",
    description:
      "Recent changes to the website: saved versions on the draft (who, when, message, files, whether it is live already), the latest publish/deploy runs, and what is not live yet (unsaved files and saved but unpublished files).",
    schema: { type: "object", properties: { limit: { type: "integer", description: "Number of versions, 1–100. Default 20." } }, required: [] },
    label: () => "Liest den Verlauf",
    async run(ctx, args) {
      const [entries, live, deployRows, unsaved, unpublished] = await Promise.all([
        log(ctx.dir, { ref: "kern/draft", limit: int(args, "limit", 20, 1, 100) }),
        git(ctx.dir, ["rev-list", "--max-count=2000", ctx.site.branch]).then((out) => new Set(out.split("\n").filter(Boolean))),
        db.select().from(deploys).where(eq(deploys.siteId, ctx.siteId)).orderBy(desc(deploys.createdAt)).limit(10),
        uncommittedFiles(ctx.dir),
        unpublishedFiles(ctx.dir, ctx.site.branch),
      ]);
      return json({
        versions: entries.map((e) => ({ sha: e.sha.slice(0, 8), author: e.author, date: e.date, message: e.message, files: e.files.slice(0, 20), live: live.has(e.sha) })),
        deploys: deployRows.map((d) => ({ status: d.status, message: d.message, at: d.createdAt.toISOString(), finishedAt: d.finishedAt?.toISOString() ?? null })),
        notLiveYet: { unsaved, unpublished },
      });
    },
  },
  {
    name: "seo_check",
    description:
      "Renders a page on the draft preview and rates its SEO like the editor's SEO panel: score 0–100, the individual checks (title, description, headings, alt texts, keyword, …) and the facts read from the HTML. Pass the page file name or its URL path.",
    schema: {
      type: "object",
      properties: {
        page: { type: "string", description: "Page file name (e.g. index) or URL path (e.g. /kontakt)" },
        keyword: { type: "string", description: "Focus keyword to rate against (optional; default is the one saved for the page)" },
      },
      required: ["page"],
    },
    label: (a) => `Prüft die SEO von ${String(a.page ?? "")}`,
    async run(ctx, args) {
      const wanted = str(args, "page").trim();
      const pages = await listPages(ctx.dir, ctx.config, await getChangeSet(ctx.dir, ctx.site.branch));
      const page = pages.find((p) => p.name === wanted || p.path === wanted || p.path === `/${wanted.replace(/^\/+/, "")}`);
      if (!page) throw new ToolError(`Die Seite ${wanted} gibt es nicht. Seiten: ${pages.map((p) => `${p.name} (${p.path})`).join(", ")}`);
      const [facts, [saved]] = await Promise.all([
        analyzePreview(ctx.siteId, page.path).catch((error: Error) => {
          throw new ToolError(error.message);
        }),
        db
          .select({ keyword: seoKeywords.keyword })
          .from(seoKeywords)
          .where(and(eq(seoKeywords.siteId, ctx.siteId), eq(seoKeywords.page, page.name)))
          .limit(1),
      ]);
      const keyword = str(args, "keyword", false).trim() || saved?.keyword || "";
      const report = scoreSeo(facts, keyword);
      return json({
        page: { name: page.name, title: page.title, path: page.path, file: page.file },
        keyword: keyword || null,
        score: report.score,
        checks: report.checks.map((c) => ({ status: c.status, title: c.title, detail: c.detail })),
        facts: { ...facts, text: facts.text.slice(0, 3000), images: facts.images.slice(0, 40) },
      });
    },
  },
];

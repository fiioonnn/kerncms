import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type MediaLocation = "repo" | "cms" | "s3";

export const roleEnum = pgEnum("role", ["owner", "admin", "editor", "viewer"]);

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  name: text().notNull(),
  /** Platform admin: sees every customer and site in /admin. */
  isAdmin: boolean().notNull().default(false),
  /** Disabled users cannot sign in. */
  disabled: boolean().notNull().default(false),
  /** Notification preferences and other per-user settings. */
  preferences: jsonb().$type<Record<string, boolean>>().notNull().default({}),
  createdAt: timestamp().notNull().defaultNow(),
});

/** One-time login codes sent by mail. Only a hash of the code is stored. */
export const loginCodes = pgTable(
  "login_codes",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    codeHash: text().notNull(),
    /** Name for the very first account, created when the code is confirmed. */
    name: text(),
    attempts: integer().notNull().default(0),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index().on(t.email, t.createdAt)],
);

export const sessions = pgTable("sessions", {
  /** SHA-256 of the cookie token; the token itself is never stored. */
  id: text().primaryKey(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  userAgent: text(),
  expiresAt: timestamp().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

/** Customers of the agency running kerncms. A customer owns one or more sites. */
export const customers = pgTable("customers", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  contactName: text().notNull().default(""),
  contactEmail: text().notNull().default(""),
  phone: text().notNull().default(""),
  notes: text().notNull().default(""),
  status: text().$type<"active" | "paused" | "archived">().notNull().default("active"),
  /** Own CMS address such as cms.kundendomain.de; links and the site list follow it. */
  domain: text().unique(),
  /** Cloudflare for SaaS custom hostname id, when the domain was registered there. */
  domainHostnameId: text(),
  domainStatus: text().$type<DomainStatus>(),
  createdAt: timestamp().notNull().defaultNow(),
});

export type DomainStatus = "pending" | "active" | "error";

/** Instance-wide GitHub App, created via the manifest flow in /admin/github. Secrets are encrypted. */
export const githubApp = pgTable("github_app", {
  id: text().primaryKey().default("default"),
  appId: text().notNull(),
  slug: text().notNull(),
  name: text().notNull(),
  clientId: text().notNull(),
  clientSecret: text().notNull(),
  privateKey: text().notNull(),
  webhookSecret: text(),
  owner: text(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const sites = pgTable("sites", {
  id: uuid().primaryKey().defaultRandom(),
  /** Public key from kern.config.yaml `site.id`, used by forms and analytics. */
  key: text().notNull().unique(),
  name: text().notNull(),
  customerId: uuid().references(() => customers.id, { onDelete: "set null" }),
  /** "github": cloned from GitHub by the CMS. "local": a folder on this machine (development only). */
  source: text().$type<"github" | "local">().notNull().default("local"),
  /** owner/name on GitHub. */
  githubRepo: text(),
  githubInstallationId: text(),
  /** Absolute path of the git repository (for GitHub sites: the CMS's own bare clone). */
  repoPath: text().notNull(),
  lastSyncedAt: timestamp(),
  liveUrl: text(),
  /** Live branch, from kern.config.yaml `branch`. */
  branch: text().notNull().default("main"),
  /** Changes need approval by an admin before they go live. */
  requireApproval: boolean().notNull().default(false),
  analyticsEnabled: boolean().notNull().default(true),
  /**
   * Random public key the website uses for forms and analytics (/api/public/<key>/…).
   * Not secret (it is in the site's HTML), but not guessable and can be replaced.
   */
  publicKey: text()
    .notNull()
    .unique()
    .default(sql`'pk_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20)`),
  /** Extra origins allowed to post forms, besides the live URL (e.g. a staging domain). */
  allowedOrigins: jsonb().$type<string[]>().notNull().default([]),
  /** Where new uploads go: the repository (default), kerncms' own storage or the site's S3. */
  mediaStorage: text().$type<MediaLocation>().notNull().default("repo"),
  createdAt: timestamp().notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum().notNull().default("editor"),
    lastActiveAt: timestamp(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.userId] })],
);

export const invites = pgTable("invites", {
  /** SHA-256 of the token in the invite link. */
  id: text().primaryKey(),
  siteId: uuid()
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  email: text().notNull(),
  role: roleEnum().notNull().default("editor"),
  invitedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

/** Metadata for files in the site's media folder (the files live in git, a copy in S3). */
export const media = pgTable(
  "media",
  {
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** File name inside the media dir. */
    name: text().notNull(),
    alt: text().notNull().default(""),
    caption: text().notNull().default(""),
    /** Focus point in percent. */
    focusX: integer().notNull().default(50),
    focusY: integer().notNull().default(50),
    tags: jsonb().$type<string[]>().notNull().default([]),
    /** "repo": file in the media dir. Otherwise the file lives in object storage at `url`. */
    location: text().$type<MediaLocation>().notNull().default("repo"),
    url: text(),
    size: integer(),
    width: integer(),
    height: integer(),
    uploadedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Folder in the CMS only ("Team/Portraits"; "" = top level). The file and its address stay the same. */
    folder: text().notNull().default(""),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.name] })],
);

/** Media folders that exist without files in them (folders with files also come from media.folder). */
export const mediaFolders = pgTable(
  "media_folders",
  {
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    path: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.path] })],
);

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid().primaryKey().defaultRandom(),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    form: text().notNull(),
    data: jsonb().$type<Record<string, string>>().notNull(),
    page: text(),
    /** Notification mail: "sent", "failed" or "off" (no notification configured). */
    mailStatus: text().$type<"sent" | "failed" | "off">(),
    mailError: text(),
    mailedAt: timestamp(),
    read: boolean().notNull().default(false),
    archived: boolean().notNull().default(false),
    /** Caught by the spam filter (or marked by hand): no mail, no notification, own tab. */
    spam: boolean().notNull().default(false),
    /** Why the filter flagged it, shown in the CMS so a false alarm is easy to judge. */
    spamReason: text(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index().on(t.siteId, t.createdAt)],
);

/** Per-form notification settings. */
export const formSettings = pgTable(
  "form_settings",
  {
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    form: text().notNull(),
    notify: boolean().notNull().default(false),
    recipients: jsonb().$type<string[]>().notNull().default([]),
    /** May contain {feldname} placeholders, e.g. "Neue Anfrage: {topic}". */
    subject: text().notNull().default(""),
    /** Prefilled "Per Mail antworten" mail, may contain {feldname} placeholders. Empty = defaults. */
    replySubject: text().notNull().default(""),
    replyBody: text().notNull().default(""),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.form] })],
);

/** Cookieless page views. `visitor` is a daily-rotating salted hash, never the IP. */
export const pageViews = pgTable(
  "page_views",
  {
    id: uuid().primaryKey().defaultRandom(),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    path: text().notNull(),
    referrer: text(),
    device: text().notNull(),
    browser: text().notNull(),
    visitor: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index().on(t.siteId, t.createdAt)],
);

export type DeployStep = { label: string; status: "pending" | "running" | "done" | "failed"; log?: string };

export const deploys = pgTable(
  "deploys",
  {
    id: uuid().primaryKey().defaultRandom(),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    status: text().$type<"running" | "done" | "failed">().notNull().default("running"),
    message: text().notNull(),
    commit: text(),
    steps: jsonb().$type<DeployStep[]>().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    finishedAt: timestamp(),
  },
  (t) => [index().on(t.siteId, t.createdAt)],
);

export const approvals = pgTable("approvals", {
  id: uuid().primaryKey().defaultRandom(),
  siteId: uuid()
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  requestedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  reviewedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  title: text().notNull(),
  note: text().notNull().default(""),
  /** Files changed between live and draft when the request was made. */
  files: jsonb().$type<string[]>().notNull().default([]),
  /** Draft commit the request refers to. */
  commit: text().notNull(),
  status: text().$type<"open" | "approved" | "rejected">().notNull().default("open"),
  comment: text(),
  createdAt: timestamp().notNull().defaultNow(),
  reviewedAt: timestamp(),
});

/** Deleted content, kept for 30 days so it can be restored. */
export const trash = pgTable("trash", {
  id: uuid().primaryKey().defaultRandom(),
  siteId: uuid()
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  kind: text().$type<"page" | "entry" | "media">().notNull(),
  label: text().notNull(),
  /** Repo-relative file path. */
  path: text().notNull(),
  /** File contents, base64 for binary files. */
  content: text().notNull(),
  binary: boolean().notNull().default(false),
  meta: jsonb().$type<Record<string, string>>().notNull().default({}),
  deletedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  deletedAt: timestamp().notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** null = everyone on the site. */
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    kind: text().$type<"form" | "approval" | "deploy" | "team">().notNull(),
    title: text().notNull(),
    href: text(),
    readBy: jsonb().$type<string[]>().notNull().default([]),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index().on(t.siteId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Site = typeof sites.$inferSelect;

/** The site's own S3-compatible bucket ("Eigener Speicher"). */
export const siteStorage = pgTable("site_storage", {
  siteId: uuid()
    .primaryKey()
    .references(() => sites.id, { onDelete: "cascade" }),
  endpoint: text().notNull().default(""),
  region: text().notNull().default("auto"),
  bucket: text().notNull(),
  accessKeyId: text().notNull(),
  /** Encrypted with KERN_SECRET. */
  secretAccessKey: text().notNull(),
  /** Public base URL of the bucket, e.g. https://cdn.example.com */
  publicUrl: text().notNull(),
  prefix: text().notNull().default(""),
  forcePathStyle: boolean().notNull().default(true),
  updatedAt: timestamp().notNull().defaultNow(),
});

/**
 * Objects to delete once the draft that stops using them is published
 * (the live site keeps pointing at them until then).
 */
export const mediaCleanup = pgTable("media_cleanup", {
  id: uuid().primaryKey().defaultRandom(),
  siteId: uuid()
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  location: text().$type<MediaLocation>().notNull(),
  key: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  /** Set when a publish went out without the file; deleted a while later, once hosting has rebuilt. */
  releasedAt: timestamp(),
});
export type Role = (typeof roleEnum.enumValues)[number];

/* ---------- OAuth for the MCP connector (Claude App etc.) ---------- */

/** Apps that registered themselves (RFC 7591), e.g. Claude. Public clients with PKCE, no secret. */
export const oauthClients = pgTable("oauth_clients", {
  id: text().primaryKey(),
  name: text().notNull(),
  redirectUris: jsonb().$type<string[]>().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

/** A user's permission for one app. Deleting it signs the app out (tokens cascade). */
export const oauthGrants = pgTable(
  "oauth_grants",
  {
    id: uuid().primaryKey().defaultRandom(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
    lastUsedAt: timestamp(),
  },
  (t) => [index().on(t.userId)],
);

/** Authorization codes (10 minutes, single use) and access/refresh tokens. Only hashes are stored. */
export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: text().primaryKey(),
    kind: text().$type<"code" | "access" | "refresh">().notNull(),
    grantId: uuid()
      .notNull()
      .references(() => oauthGrants.id, { onDelete: "cascade" }),
    /** For codes: the PKCE challenge and the redirect URI they were issued for. */
    codeChallenge: text(),
    redirectUri: text(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index().on(t.grantId)],
);

import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

// ── Better Auth managed tables ──────────────────────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role", { enum: ["superadmin", "admin", "member"] }).notNull().default("member"),
  advancedView: integer("advanced_view", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ── Application tables ──────────────────────────────────────

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  url: text("url"),
  repo: text("repo"),
  branch: text("branch"),
  srcDir: text("src_dir"),
  publicDir: text("public_dir"),
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).notNull().default(false),
  kernInstalled: integer("kern_installed", { mode: "boolean" }).notNull().default(false),
  localPath: text("local_path"),
  editorCaching: integer("editor_caching", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const projectMembers = sqliteTable("project_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["admin", "editor", "viewer"] }).notNull(),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("project_members_unique").on(table.projectId, table.userId),
]);

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role", { enum: ["admin", "editor", "viewer"] }).notNull(),
  token: text("token").notNull().unique().$defaultFn(() => crypto.randomUUID()),
  invitedBy: text("invited_by").notNull().references(() => user.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("invitations_unique").on(table.projectId, table.email),
]);

export const systemConfig = sqliteTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const customDomains = sqliteTable("custom_domains", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  domain: text("domain").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const domainTransferTokens = sqliteTable("domain_transfer_tokens", {
  token: text("token").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionToken: text("session_token").notNull(),
  targetDomain: text("target_domain").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const pendingChanges = sqliteTable("pending_changes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  content: text("content").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("pending_changes_unique").on(table.projectId, table.filePath),
]);

export const mediaSyncQueue = sqliteTable("media_sync_queue", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  action: text("action", { enum: ["upload", "delete", "rename", "move", "mkdir"] }).notNull(),
  path: text("path").notNull(),
  extra: text("extra"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const mediaBuckets = sqliteTable("media_buckets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  provider: text("provider", { enum: ["github", "aws", "cloudflare"] }).notNull(),
  config: text("config").notNull().default("{}"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const aiSettings = sqliteTable("ai_settings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  provider1: text("provider_1", { enum: ["anthropic", "openai"] }).notNull().default("anthropic"),
  apiKey1: text("api_key_1"),
  primaryModel: text("primary_model").notNull().default("claude-sonnet-4-5"),
  provider2: text("provider_2", { enum: ["anthropic", "openai"] }),
  apiKey2: text("api_key_2"),
  fallbackModel: text("fallback_model"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const githubAppConfig = sqliteTable("github_app_config", {
  id: text("id").primaryKey(),
  appId: text("app_id").notNull(),
  appName: text("app_name").notNull(),
  appSlug: text("app_slug").notNull(),
  privateKey: text("private_key").notNull(),
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret").notNull(),
  webhookSecret: text("webhook_secret").notNull(),
  installationId: text("installation_id"),
  installedOn: text("installed_on"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const webhookLogs = sqliteTable("webhook_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  repository: text("repository").notNull(),
  branch: text("branch").notNull(),
  commitSha: text("commit_sha").notNull(),
  filesChecked: integer("files_checked").notNull().default(0),
  filesFixed: integer("files_fixed").notNull().default(0),
  errorsFound: text("errors_found").notNull().default("[]"),
  errorsFixed: text("errors_fixed").notNull().default("[]"),
  status: text("status", { enum: ["clean", "fixed", "failed"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const resendConfig = sqliteTable("resend_config", {
  id: text("id").primaryKey().$defaultFn(() => "default"),
  apiKey: text("api_key"),
  fromDomain: text("from_domain").notNull().default("resend.dev"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const autofixSettings = sqliteTable("autofix_settings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }).unique(),
  fixSyntax: integer("fix_syntax", { mode: "boolean" }).notNull().default(true),
  fixMissingFields: integer("fix_missing_fields", { mode: "boolean" }).notNull().default(true),
  fixTypeMismatches: integer("fix_type_mismatches", { mode: "boolean" }).notNull().default(true),
  removeUnknownFields: integer("remove_unknown_fields", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const scanJobs = sqliteTable("scan_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["running", "review", "completed", "cancelled", "failed"] }).notNull().default("running"),
  currentTask: text("current_task").notNull().default("scan"),
  options: text("options").notNull().default("{}"),
  files: text("files").notNull().default("[]"),
  results: text("results").notNull().default("[]"),
  pendingFiles: text("pending_files").notNull().default("[]"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ── Content tables (existing) ───────────────────────────────

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

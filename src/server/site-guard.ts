import "server-only";
import { CONFIG_FILE, ConfigError } from "./config";
import { GitError, showFile } from "./git";
import { getSiteContext, hasRole } from "./sites";

/**
 * Runs the layout's site loading. When the current site cannot be opened (no kern.config.yaml,
 * broken config, checkout failed), returns what the "site unavailable" screen needs instead of throwing.
 */
export async function loadSiteOrReason<T>(load: () => Promise<T>) {
  try {
    return { ok: true as const, data: await load() };
  } catch (error) {
    if (!(error instanceof ConfigError || error instanceof GitError)) throw error;
    const ctx = await getSiteContext();
    // The draft lost its config but the live branch has one: offer to start the draft again from live.
    const canReset =
      error instanceof ConfigError && hasRole(ctx.role, "admin") && (await showFile(ctx.site.repoPath, ctx.site.branch, CONFIG_FILE)) !== null;
    return {
      ok: false as const,
      unavailable: {
        site: { id: ctx.site.id, name: ctx.site.name, branch: ctx.site.branch, repo: ctx.site.githubRepo },
        reason: error.message,
        kind: error instanceof ConfigError ? ("config" as const) : ("git" as const),
        sites: ctx.sites.map((s) => ({ id: s.id, name: s.name })),
        isAdmin: ctx.user.isAdmin,
        canReset,
      },
    };
  }
}

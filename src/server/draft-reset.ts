import "server-only";
import type { Site } from "@/db/schema";
import { DRAFT_BRANCH, resetDraftToLive, withSiteLock } from "./git";

/**
 * Starts the site's draft again from its live branch; the old draft stays as `kern/draft-backup-<time>`,
 * for GitHub sites also on GitHub. Returns the backup branch name, if there was a draft.
 */
export function restartDraft(site: Site) {
  return withSiteLock(site.id, async () => {
    if (site.source !== "github") return resetDraftToLive(site);
    const github = await import("./github");
    await github.fetchRemote(site);
    const backup = await resetDraftToLive(site);
    if (backup) await github.pushBranches(site, [backup]);
    await github.pushBranches(site, [DRAFT_BRANCH], { force: true });
    return backup;
  });
}

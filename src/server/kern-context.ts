import "server-only";
import type { KernClientData } from "@/components/kern/kern-provider";
import { assistantFor } from "./assistant/settings";
import { getChangeSet, listPages } from "./content";
import { mediaValue } from "./media";
import { getWorkspace } from "./sites";

/** Everything client components need to know about the current site, loaded once per request in the layout. */
export async function loadKernClientData(): Promise<KernClientData> {
  const ws = await getWorkspace();
  const changes = await getChangeSet(ws.dir, ws.site.branch);
  const [pages, assistant] = await Promise.all([listPages(ws.dir, ws.config, changes), assistantFor(ws.user, ws.role)]);
  return {
    user: { id: ws.user.id, name: ws.user.name, email: ws.user.email, isAdmin: ws.user.isAdmin },
    role: ws.role,
    site: {
      id: ws.site.id,
      key: ws.site.key,
      name: ws.site.name,
      liveUrl: ws.site.liveUrl,
      branch: ws.site.branch,
      requireApproval: ws.site.requireApproval,
      source: ws.site.source,
      publicKey: ws.site.publicKey,
      githubRepo: ws.site.githubRepo,
    },
    sites: ws.sites,
    config: ws.config,
    pages: pages.map((p) => ({ name: p.name, title: p.title, path: p.path, status: p.status })),
    mediaPrefix: mediaValue(ws.config, ""),
    assistant: assistant !== null,
    assistantPage: assistant?.standalone ?? false,
  };
}

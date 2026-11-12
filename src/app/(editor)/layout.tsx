import { KernProvider } from "@/components/kern/kern-provider";
import { loadKernClientData } from "@/server/kern-context";
import { SiteUnavailable } from "@/components/layout/site-unavailable";
import { loadSiteOrReason } from "@/server/site-guard";
import { siteTitle } from "@/server/titles";

export const generateMetadata = siteTitle;

export default async function EditorLayout({ children }: LayoutProps<"/">) {
  const result = await loadSiteOrReason(loadKernClientData);
  if (!result.ok) return <SiteUnavailable {...result.unavailable} />;
  return <KernProvider value={result.data}>{children}</KernProvider>;
}

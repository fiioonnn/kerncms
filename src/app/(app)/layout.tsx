import { KernProvider } from "@/components/kern/kern-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { SiteUnavailable } from "@/components/layout/site-unavailable";
import { Topbar } from "@/components/layout/topbar";
import { loadKernClientData } from "@/server/kern-context";
import { loadSiteOrReason } from "@/server/site-guard";
import { siteTitle } from "@/server/titles";

export const generateMetadata = siteTitle;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const result = await loadSiteOrReason(loadKernClientData);
  if (!result.ok) return <SiteUnavailable {...result.unavailable} />;
  return (
    <KernProvider value={result.data}>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </KernProvider>
  );
}

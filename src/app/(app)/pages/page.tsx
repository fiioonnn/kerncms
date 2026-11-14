import Link from "next/link";
import { LayoutPanelTop } from "lucide-react";
import { NewPageDialog } from "@/components/actions/create-dialogs";
import { formatChange } from "@/components/collections/format";
import { StatusBadge } from "@/components/collections/status-badge";
import { PageContainer } from "@/components/layout/page-container";
import { PageRowActions } from "@/components/pages/page-row-actions";
import { Card, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { getPage, getPages } from "@/server/queries";
import { searchConsoleFor, sitePerformance, type Metrics } from "@/server/seo/search-console";
import { getWorkspace } from "@/server/sites";

export const metadata = { title: "Seiten" };

const editorHref = (name: string) => `/editor?page=${encodeURIComponent(name)}`;

export default async function PagesPage() {
  const pages = await getPages();
  const seo = await Promise.all(pages.map(async (p) => (await getPage(p.name)).seo ?? {}));
  const google = await googleByPath();

  return (
    <PageContainer>
      <PageHeader
        title="Seiten"
        description="Alle Seiten deiner Website. Klicke auf eine Seite, um sie visuell zu bearbeiten."
        actions={<NewPageDialog />}
      />

      <Card>
        {pages.length === 0 ? (
          <EmptyState
            icon={LayoutPanelTop}
            title="Noch keine Seiten"
            description="Lege die erste Seite an. Sie landet als JSON-Datei im Repository."
          />
        ) : (
          // Simpler as it gets narrower: path and status move under the title, blocks and date drop out.
          <div className="@container">
            <Table className="table-fixed">
              <thead>
                <tr>
                  <Th>Titel</Th>
                  <Th className="hidden @2xl:table-cell">Pfad</Th>
                  <Th className="hidden w-28 @5xl:table-cell">Blöcke</Th>
                  {google && <Th className="hidden w-36 @3xl:table-cell">Google</Th>}
                  <Th className="hidden w-36 @lg:table-cell">Status</Th>
                  <Th className="hidden w-48 whitespace-nowrap @4xl:table-cell">Zuletzt geändert</Th>
                  <Th className="w-32 @3xl:w-64" aria-label="Aktionen" />
                </tr>
              </thead>
              <tbody>
                {pages.map((page, i) => (
                  <tr key={page.name} className="transition-colors hover:bg-subtle/50">
                    <Td className="py-3">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <Link href={editorHref(page.name)} className="truncate text-base font-medium hover:text-accent">
                          {page.title}
                        </Link>
                        <span className="flex min-w-0 items-center gap-2 @2xl:hidden">
                          <span className="truncate font-mono text-sm text-muted">{page.path}</span>
                          <span className="shrink-0 @lg:hidden">
                            <StatusBadge status={page.status} />
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td className="hidden truncate font-mono text-sm text-muted @2xl:table-cell">{page.path}</Td>
                    <Td className="hidden text-muted tabular-nums @5xl:table-cell">{page.blocks}</Td>
                    {google && (
                      <Td className="hidden @3xl:table-cell">
                        <GoogleCell metrics={google[pathKey(page.path)]} />
                      </Td>
                    )}
                    <Td className="hidden @lg:table-cell">
                      <StatusBadge status={page.status} />
                    </Td>
                    <Td className="hidden whitespace-nowrap @4xl:table-cell">
                      <span className="flex flex-col leading-tight">
                        <span>{formatChange(page.updatedAt)}</span>
                        {page.updatedBy && <span className="text-sm text-muted">{page.updatedBy}</span>}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <PageRowActions
                        page={{
                          name: page.name,
                          title: page.title,
                          path: page.path,
                          file: page.file,
                          seo: seo[i],
                        }}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}

const pathKey = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

/** Search Console figures of all pages, or null when the site is not connected (then the column is hidden). */
async function googleByPath(): Promise<Record<string, Metrics> | null> {
  try {
    const ws = await getWorkspace("viewer");
    const sc = await searchConsoleFor(ws.site.liveUrl);
    if (sc.state !== "ok") return null;
    return await sitePerformance(sc.account, sc.property, sc.liveUrl);
  } catch (error) {
    console.error("[kern] Search Console", error);
    return null;
  }
}

function GoogleCell({ metrics }: { metrics: Metrics | undefined }) {
  if (!metrics) return <span className="text-sm text-muted">Nicht gefunden</span>;
  return (
    <span className="flex flex-col leading-tight tabular-nums" title="Letzte 28 Tage">
      <span>Platz {metrics.position.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</span>
      <span className="text-sm text-muted">{metrics.clicks.toLocaleString("de-DE")} Klicks</span>
    </span>
  );
}

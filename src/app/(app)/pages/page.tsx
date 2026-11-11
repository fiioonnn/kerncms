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

const editorHref = (name: string) => `/editor?page=${encodeURIComponent(name)}`;

export default async function PagesPage() {
  const pages = await getPages();
  const seo = await Promise.all(pages.map(async (p) => (await getPage(p.name)).seo ?? {}));

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
          <Table>
            <thead>
              <tr>
                <Th>Titel</Th>
                <Th>Pfad</Th>
                <Th>Blöcke</Th>
                <Th>Status</Th>
                <Th>Zuletzt geändert</Th>
                <Th className="w-0" aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {pages.map((page, i) => (
                <tr key={page.name} className="transition-colors hover:bg-subtle/50">
                  <Td>
                    <Link href={editorHref(page.name)} className="text-base font-medium hover:text-accent">
                      {page.title}
                    </Link>
                  </Td>
                  <Td className="font-mono text-sm text-muted">{page.path}</Td>
                  <Td className="text-muted tabular-nums">{page.blocks}</Td>
                  <Td>
                    <StatusBadge status={page.status} />
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="flex flex-col leading-tight">
                      <span>{formatChange(page.updatedAt)}</span>
                      {page.updatedBy && <span className="text-sm text-muted">{page.updatedBy}</span>}
                    </span>
                  </Td>
                  <Td>
                    <PageRowActions
                      page={{ name: page.name, title: page.title, path: page.path, file: page.file, seo: seo[i] }}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </PageContainer>
  );
}

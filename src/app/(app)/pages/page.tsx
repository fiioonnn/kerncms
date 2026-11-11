import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageRowActions } from "@/components/pages/page-row-actions";
import { NewPageDialog } from "@/components/actions/create-dialogs";
import { buttonStyles } from "@/components/ui/button";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/display";

const pages = [
  { title: "Startseite", path: "/", status: "draft", updated: "Heute, 09:42" },
  { title: "Über uns", path: "/ueber-uns", status: "live", updated: "8. Nov." },
  { title: "Sortiment", path: "/sortiment", status: "live", updated: "5. Nov." },
  { title: "Catering", path: "/catering", status: "live", updated: "28. Okt." },
  { title: "Kontakt", path: "/kontakt", status: "live", updated: "12. Okt." },
  { title: "Impressum", path: "/impressum", status: "live", updated: "2. Sep." },
];

const editorHref = (path: string) => (path === "/" ? "/editor" : `/editor?page=${encodeURIComponent(path)}`);

export default function PagesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Seiten"
        description="Alle Seiten deiner Website. Klicke auf eine Seite, um sie visuell zu bearbeiten."
        actions={
          <NewPageDialog />
        }
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Titel</Th>
              <Th>Pfad</Th>
              <Th>Status</Th>
              <Th>Zuletzt geändert</Th>
              <Th className="w-0" aria-label="Aktionen" />
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.path} className="transition-colors hover:bg-subtle/50">
                <Td>
                  <Link href={editorHref(page.path)} className="text-base font-medium hover:text-accent">
                    {page.title}
                  </Link>
                </Td>
                <Td className="font-mono text-sm text-muted">{page.path}</Td>
                <Td>
                  {page.status === "draft" ? (
                    <Badge tone="warning" dot>
                      Entwurf
                    </Badge>
                  ) : (
                    <Badge tone="success" dot>
                      Live
                    </Badge>
                  )}
                </Td>
                <Td className="text-muted">{page.updated}</Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <Link href={editorHref(page.path)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      Bearbeiten
                    </Link>
                    <PageRowActions title={page.title} path={page.path} />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </PageContainer>
  );
}

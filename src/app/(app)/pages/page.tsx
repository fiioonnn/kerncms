import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/display";

const pages = [
  { title: "Startseite", path: "/", status: "draft", updated: "Heute, 09:42" },
  { title: "Über uns", path: "/ueber-uns", status: "live", updated: "8. Nov." },
  { title: "Sortiment", path: "/sortiment", status: "live", updated: "5. Nov." },
  { title: "Catering", path: "/catering", status: "live", updated: "28. Okt." },
  { title: "Kontakt", path: "/kontakt", status: "live", updated: "12. Okt." },
  { title: "Impressum", path: "/impressum", status: "live", updated: "2. Sep." },
];

export default function PagesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Seiten"
        description="Alle Seiten deiner Website. Klicke auf eine Seite, um sie visuell zu bearbeiten."
        actions={
          <Button>
            <Plus />
            Neue Seite
          </Button>
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
                  <Link href="/editor" className="text-base font-medium hover:text-accent">
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
                  <div className="flex items-center gap-2">
                    <Link href="/editor" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      Bearbeiten
                    </Link>
                    <Button variant="ghost" size="icon" aria-label="Mehr">
                      <MoreHorizontal />
                    </Button>
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

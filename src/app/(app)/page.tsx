import Link from "next/link";
import { ArrowRight, FileText, Image, Newspaper, PenLine } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";

const stats = [
  { label: "Seiten", value: "12", icon: FileText },
  { label: "Beiträge", value: "34", icon: Newspaper },
  { label: "Entwürfe", value: "3", icon: PenLine },
  { label: "Medien", value: "128", icon: Image },
];

const recent = [
  { title: "Startseite", type: "Seite", when: "vor 12 Minuten", status: "draft" },
  { title: "Neue Sauerteigbrote ab Mai", type: "Beitrag", when: "vor 2 Stunden", status: "draft" },
  { title: "Öffnungszeiten", type: "Global", when: "gestern", status: "live" },
  { title: "Über uns", type: "Seite", when: "vor 3 Tagen", status: "live" },
];

const changes = [
  { file: "Startseite", detail: "Hero-Überschrift geändert" },
  { file: "Neue Sauerteigbrote ab Mai", detail: "Neuer Beitrag" },
  { file: "Navigation", detail: "Menüpunkt hinzugefügt" },
];

export default function DashboardPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Guten Morgen, Anna"
        description="Hier siehst du, was sich auf deiner Website zuletzt getan hat."
        actions={
          <Link href="/posts/new" className={buttonStyles()}>
            Neuer Beitrag
          </Link>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="flex items-center gap-5 p-6">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <stat.icon className="size-6" strokeWidth={1.75} />
            </span>
            <span className="flex flex-col">
              <span className="text-3xl font-semibold tracking-tight">{stat.value}</span>
              <span className="text-[15px] text-muted">{stat.label}</span>
            </span>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Zuletzt bearbeitet" description="Seiten, Beiträge und Globals" />
          <CardContent className="flex flex-col gap-1 px-4">
            {recent.map((item) => (
              <Link
                key={item.title}
                href="/editor"
                className="flex items-center gap-4 rounded-xl px-3 py-3.5 transition-colors hover:bg-subtle"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-medium">{item.title}</span>
                  <span className="text-sm text-muted">
                    {item.type} · {item.when}
                  </span>
                </span>
                {item.status === "draft" ? (
                  <Badge tone="warning" dot>
                    Entwurf
                  </Badge>
                ) : (
                  <Badge tone="success" dot>
                    Live
                  </Badge>
                )}
                <ArrowRight className="size-5 text-muted" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Offene Änderungen" description="Noch nicht veröffentlicht" />
          <CardContent className="flex flex-1 flex-col gap-4">
            <ul className="flex flex-col gap-4">
              {changes.map((change) => (
                <li key={change.file} className="flex gap-3">
                  <span className="mt-2.5 size-2 shrink-0 rounded-full bg-warning" />
                  <span className="flex flex-col">
                    <span className="text-[15px] font-medium">{change.file}</span>
                    <span className="text-sm text-muted">{change.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex gap-3 pt-4">
              <Button className="flex-1">Veröffentlichen</Button>
              <Button variant="secondary">Verwerfen</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

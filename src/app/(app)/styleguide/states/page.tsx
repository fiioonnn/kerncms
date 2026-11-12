import Link from "next/link";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import AppLoading from "../../loading";
import { PageContainer } from "@/components/layout/page-container";
import { PageError } from "@/components/layout/page-error";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Seitenzustände" };

function Example({ title, rule, children }: { title: string; rule: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border py-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="max-w-2xl text-[15px] text-muted">{rule}</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-dashed border-border-strong bg-background">{children}</div>
    </section>
  );
}

/** Static examples of the page-level states, so they can be reviewed without slowing down or breaking a page. */
export default function StatesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Seitenzustände"
        description="Laden, leer und Fehler als statische Beispiele. Jede Seite im CMS nutzt genau diese Muster."
        actions={
          <Link href="/styleguide" className={buttonStyles({ variant: "secondary" })}>
            <ArrowLeft />
            Zum Styleguide
          </Link>
        }
      />

      <Example
        title="Laden"
        rule="loading.tsx zeigt Skeletons in der Form der echten Seite: Kopf, Kennzahlen, Tabelle. Kein Spinner, und ein unsichtbarer Status-Text für Screenreader."
      >
        <AppLoading />
      </Example>

      <Example
        title="Leer"
        rule="EmptyState in der Karte, in der sonst die Liste steht. Sagt, was hierhin gehört, und bietet die eine passende Aktion an."
      >
        <div className="p-8">
          <Card>
            <EmptyState
              icon={FileText}
              title="Noch keine Beiträge"
              description="Beiträge erscheinen auf deiner Website unter „Aktuelles“."
              action={
                <Button>
                  <Plus />
                  Neuer Beitrag
                </Button>
              }
            />
          </Card>
        </div>
      </Example>

      <Example
        title="Fehler"
        rule="error.tsx ersetzt nur den Seiteninhalt; Sidebar und Topbar bleiben bedienbar. Beruhigen, erneut versuchen anbieten, Fehler-ID für den Support zeigen."
      >
        <div className="flex justify-center p-8">
          <PageError digest="3f9a1c2e" />
        </div>
      </Example>

      <Example
        title="Nicht gefunden"
        rule="not-found.tsx für Adressen, die es nicht gibt. Läuft außerhalb der App-Shell und führt zurück zur Übersicht."
      >
        <div className="flex items-center justify-between gap-4 p-6">
          <p className="text-[15px] text-muted">Die 404-Seite ist eine ganze Seite und lässt sich nur direkt ansehen.</p>
          <Link href="/styleguide/gibt-es-nicht" className={buttonStyles({ variant: "secondary" })}>
            404-Seite öffnen
          </Link>
        </div>
      </Example>
    </PageContainer>
  );
}

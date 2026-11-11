import { ChevronRight, Clock, Menu, PanelBottom, Phone, Search } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const groups = [
  { label: "Kontakt", description: "Adresse, Telefon, E-Mail", icon: Phone, active: true },
  { label: "Öffnungszeiten", description: "Wochentage und Feiertage", icon: Clock },
  { label: "Navigation", description: "Hauptmenü der Website", icon: Menu },
  { label: "Footer", description: "Links und Hinweise", icon: PanelBottom },
  { label: "SEO", description: "Standard-Titel und Beschreibung", icon: Search },
];

export default function GlobalsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Globals"
        description="Inhalte, die auf jeder Seite gleich sind. Eine Änderung hier wirkt überall."
      />

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit p-2">
          {groups.map((group) => (
            <button
              key={group.label}
              type="button"
              className={cn(
                "flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-colors",
                group.active ? "bg-accent-soft" : "hover:bg-subtle",
              )}
            >
              <group.icon
                className={cn("size-5 shrink-0", group.active ? "text-accent" : "text-muted")}
                strokeWidth={1.75}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("text-base font-medium", group.active && "text-accent")}>
                  {group.label}
                </span>
                <span className="truncate text-sm text-muted">{group.description}</span>
              </span>
              <ChevronRight className="size-4 text-muted" />
            </button>
          ))}
        </Card>

        <Card>
          <CardHeader title="Kontakt" description="Wird im Footer und auf der Kontaktseite angezeigt." />
          <CardContent className="flex flex-col gap-6">
            <Field>
              <Label>Firmenname</Label>
              <Input defaultValue="Bäckerei Müller" />
            </Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field>
                <Label>Telefon</Label>
                <Input />
              </Field>
              <Field>
                <Label>E-Mail</Label>
                <Input type="email" />
              </Field>
            </div>
            <Field>
              <Label>Adresse</Label>
              <Textarea rows={3} />
              <Description>Jede Zeile wird als eigene Zeile angezeigt.</Description>
            </Field>
            <div className="flex justify-end gap-3 border-t border-border pt-6">
              <Button variant="secondary">Zurücksetzen</Button>
              <Button>Speichern</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

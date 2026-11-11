"use client";

import { useState } from "react";
import { ChevronRight, Clock, Menu, PanelBottom, Phone, Search, type LucideIcon } from "lucide-react";
import { SaveButton } from "@/components/actions/common";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type FieldDef = { label: string; multiline?: boolean; hint?: string; half?: boolean; value?: string };
type Group = { id: string; label: string; description: string; icon: LucideIcon; usage: string; fields: FieldDef[] };

const groups: Group[] = [
  {
    id: "contact",
    label: "Kontakt",
    description: "Adresse, Telefon, E-Mail",
    icon: Phone,
    usage: "Wird im Footer und auf der Kontaktseite angezeigt.",
    fields: [
      { label: "Firmenname", value: "Bäckerei Müller" },
      { label: "Telefon", half: true },
      { label: "E-Mail", half: true },
      { label: "Adresse", multiline: true, hint: "Jede Zeile wird als eigene Zeile angezeigt." },
    ],
  },
  {
    id: "hours",
    label: "Öffnungszeiten",
    description: "Wochentage und Feiertage",
    icon: Clock,
    usage: "Erscheint im Footer und in der Google-Suche.",
    fields: [
      { label: "Montag bis Freitag", half: true },
      { label: "Samstag", half: true },
      { label: "Sonntag", half: true },
      { label: "Feiertage", half: true },
      { label: "Hinweis", multiline: true, hint: "Zum Beispiel Betriebsurlaub." },
    ],
  },
  {
    id: "nav",
    label: "Navigation",
    description: "Hauptmenü der Website",
    icon: Menu,
    usage: "Die Menüpunkte oben auf jeder Seite.",
    fields: [
      { label: "Menüpunkt 1", value: "Sortiment" },
      { label: "Menüpunkt 2", value: "Über uns" },
      { label: "Menüpunkt 3", value: "Kontakt" },
    ],
  },
  {
    id: "footer",
    label: "Footer",
    description: "Links und Hinweise",
    icon: PanelBottom,
    usage: "Der Bereich ganz unten auf jeder Seite.",
    fields: [{ label: "Copyright-Hinweis" }, { label: "Zusatztext", multiline: true }],
  },
  {
    id: "seo",
    label: "SEO",
    description: "Standard-Titel und Beschreibung",
    icon: Search,
    usage: "Gilt für alle Seiten ohne eigene Angaben.",
    fields: [
      { label: "Seitentitel", hint: "Wird an jeden Seitentitel angehängt." },
      { label: "Beschreibung", multiline: true, hint: "Etwa 150 Zeichen." },
    ],
  },
];

export default function GlobalsPage() {
  const [activeId, setActiveId] = useState(groups[0].id);
  const [resetOpen, setResetOpen] = useState(false);
  const active = groups.find((g) => g.id === activeId) ?? groups[0];

  return (
    <PageContainer>
      <PageHeader
        title="Globals"
        description="Inhalte, die auf jeder Seite gleich sind. Eine Änderung hier wirkt überall."
      />

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit p-2">
          {groups.map((group) => {
            const isActive = group.id === active.id;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveId(group.id)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-colors",
                  isActive ? "bg-accent-soft" : "hover:bg-subtle",
                )}
              >
                <group.icon className={cn("size-5 shrink-0", isActive ? "text-accent" : "text-muted")} strokeWidth={1.75} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("text-base font-medium", isActive && "text-accent")}>{group.label}</span>
                  <span className="truncate text-sm text-muted">{group.description}</span>
                </span>
                <ChevronRight className="size-4 text-muted" />
              </button>
            );
          })}
        </Card>

        <Card key={active.id}>
          <CardHeader title={active.label} description={active.usage} />
          <CardContent className="grid gap-6 sm:grid-cols-2">
            {active.fields.map((field) => (
              <Field key={field.label} className={field.half ? undefined : "sm:col-span-2"}>
                <Label>{field.label}</Label>
                {field.multiline ? <Textarea rows={3} defaultValue={field.value} /> : <Input defaultValue={field.value} />}
                {field.hint && <Description>{field.hint}</Description>}
              </Field>
            ))}
            <div className="flex justify-end gap-3 border-t border-border pt-6 sm:col-span-2">
              <button type="button" className={buttonStyles({ variant: "secondary" })} onClick={() => setResetOpen(true)}>
                Zurücksetzen
              </button>
              <SaveButton message={`${active.label} gespeichert`} description="Die Änderung gilt auf allen Seiten." />
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Änderungen zurücksetzen?"
        description={`Alle ungespeicherten Änderungen an „${active.label}“ gehen verloren.`}
        confirmLabel="Zurücksetzen"
        danger
        onConfirm={() => toast.info("Zurückgesetzt")}
      />
    </PageContainer>
  );
}

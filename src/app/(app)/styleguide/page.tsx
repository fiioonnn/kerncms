import Link from "next/link";
import { ArrowRight, Inbox, Plus } from "lucide-react";
import { InputDemos, MediaDemos, RichTextDemo } from "./component-demos";
import { InteractionDemos } from "./interaction-demos";
import { PageContainer } from "@/components/layout/page-container";
import { Button, buttonStyles } from "@/components/ui/button";
import { Avatar, Badge, Card, CardContent, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { Checkbox, Switch } from "@/components/ui/toggles";

const colorGroups = [
  {
    title: "Flächen",
    colors: [
      { token: "background", use: "App-Hintergrund", className: "bg-background" },
      { token: "surface", use: "Karten, Sidebar, Felder", className: "bg-surface" },
      { token: "subtle", use: "Hover, Tabellenköpfe", className: "bg-subtle" },
    ],
  },
  {
    title: "Text und Linien",
    colors: [
      { token: "foreground", use: "Haupttext", className: "bg-foreground" },
      { token: "muted", use: "Nebentext, Icons", className: "bg-muted" },
      { token: "border", use: "Trennlinien", className: "bg-border" },
      { token: "border-strong", use: "Feldrahmen", className: "bg-border-strong" },
    ],
  },
  {
    title: "Marke",
    colors: [
      { token: "accent", use: "Primäre Aktion, aktiv", className: "bg-accent" },
      { token: "accent-hover", use: "Hover der Aktion", className: "bg-accent-hover" },
      { token: "accent-soft", use: "Aktive Navigation", className: "bg-accent-soft" },
    ],
  },
  {
    title: "Status",
    colors: [
      { token: "success", use: "Live, verbunden", className: "bg-success" },
      { token: "warning", use: "Entwurf, offen", className: "bg-warning" },
      { token: "danger", use: "Löschen, Fehler", className: "bg-danger" },
    ],
  },
];

const typeScale = [
  { name: "Seitentitel", spec: "24 px · Semibold", className: "text-2xl font-semibold tracking-tight" },
  { name: "Kartentitel", spec: "18 px · Semibold", className: "text-lg font-semibold tracking-tight" },
  { name: "Fließtext", spec: "16 px · Regular", className: "text-base" },
  { name: "Bedienelemente", spec: "15 px · Medium", className: "text-[15px] font-medium" },
  { name: "Nebentext", spec: "14 px · Regular · muted", className: "text-sm text-muted" },
  { name: "Gruppenlabel", spec: "12 px · Semibold · Versalien", className: "text-xs font-semibold tracking-wider text-muted uppercase" },
];

const sizes = [
  { name: "Buttons und Felder", value: "44 px hoch (h-11) · Icon-Buttons 44 × 44 px" },
  { name: "Kleine Buttons", value: "36 px hoch (h-9), nur in Karten- und Tabellenzeilen" },
  { name: "Große Buttons", value: "48 px hoch (h-12)" },
  { name: "Navigationseinträge", value: "44 px hoch" },
  { name: "Topbar", value: "64 px hoch" },
  { name: "Sidebar", value: "288 px breit" },
  { name: "Tabellenzeilen", value: "56 px hoch, Kopfzeile 44 px" },
  { name: "Seiteninhalt", value: "max. 1280 px breit, 32 px Rand" },
  { name: "Radien", value: "Felder und Buttons 12 px · Karten und Dialoge 16 px" },
  { name: "Abstände", value: "4-px-Raster · Karten innen 24 px seitlich, 20 px oben und unten" },
];

const avatarSizes = [
  { size: "sm", name: "Anna Schmidt", label: "sm · 32 px" },
  { size: "md", name: "Jonas Weber", label: "md · 40 px" },
  { size: "lg", name: "Lena Hoffmann", label: "lg · 48 px" },
] as const;

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-border py-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-[15px] text-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <PageContainer>
      <PageHeader
        title="Styleguide"
        description="Farben, Schrift, Größen und Bausteine von kerncms. Alles ist bewusst etwas größer, damit das CMS ruhig und gut bedienbar wirkt."
      />

      <Section title="Farben" description="Alle Farben sind Tokens in globals.css. Im Code nur die Token-Namen verwenden, nie Hex-Werte.">
        <div className="flex flex-col gap-6">
          {colorGroups.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <h3 className="text-[15px] font-medium">{group.title}</h3>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {group.colors.map((color) => (
                  <div key={color.token} className="overflow-hidden rounded-xl border border-border bg-surface">
                    <div className={`h-20 border-b border-border ${color.className}`} />
                    <div className="flex flex-col px-4 py-3">
                      <span className="font-mono text-sm font-medium">{color.token}</span>
                      <span className="text-sm text-muted">{color.use}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typografie" description="Geist für alles, Geist Mono für Pfade und Code. Fließtext ist 16 px, nie kleiner als 14 px.">
        <Card className="divide-y divide-border">
          {typeScale.map((type) => (
            <div key={type.name} className="flex flex-wrap items-baseline justify-between gap-4 px-6 py-4">
              <span className={type.className}>{type.name}</span>
              <span className="font-mono text-sm text-muted">{type.spec}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Größen und Abstände" description="Großzügige Klickflächen und viel Luft statt dichter Listen.">
        <Card className="divide-y divide-border">
          {sizes.map((size) => (
            <div key={size.name} className="flex items-center justify-between gap-4 px-7 py-4">
              <span className="text-[15px] font-medium">{size.name}</span>
              <span className="text-[15px] text-muted">{size.value}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Buttons" description="Eine primäre Aktion pro Bereich. Sekundär für Alternativen, Ghost für Icons und Nebenaktionen.">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primär</Button>
            <Button variant="secondary">Sekundär</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Löschen</Button>
            <Button disabled>Deaktiviert</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Klein</Button>
            <Button>Standard</Button>
            <Button size="lg">Groß</Button>
            <Button>
              <Plus />
              Mit Icon
            </Button>
            <Button variant="secondary" size="icon" aria-label="Hinzufügen">
              <Plus />
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Formulare" description="Label immer über dem Feld, Hilfetext darunter. Keine Beispielwerte als Platzhalter.">
        <Card>
          <CardContent className="grid gap-6 py-7 md:grid-cols-2">
            <Field>
              <Label>Titel</Label>
              <Input />
            </Field>
            <Select
              label="Kategorie"
              items={[
                { label: "Neuigkeiten", value: "news" },
                { label: "Rezepte", value: "recipes" },
              ]}
              defaultValue="news"
            />
            <Field className="md:col-span-2">
              <Label>Beschreibung</Label>
              <Textarea rows={3} />
              <Description>Hilfetext steht unter dem Feld.</Description>
            </Field>
            <Switch label="Auf Startseite zeigen" description="Schalter für Einstellungen, die sofort gelten." defaultChecked />
            <div className="flex flex-col gap-3">
              <Checkbox label="Im Menü anzeigen" defaultChecked />
              <Checkbox label="Von Suchmaschinen ausschließen" />
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section
        title="Eingabe-Bausteine"
        description="Spezialfelder für Werte, die ein normales Textfeld schlecht abbildet. Label immer sichtbar darüber."
      >
        <InputDemos />
      </Section>

      <Section
        title="Rich Text"
        description="Für längere Texte mit Struktur. Nur Zwischenüberschriften, Hervorhebungen, Listen, Zitate und Links, keine freien Farben oder Schriftgrößen."
      >
        <RichTextDemo />
      </Section>

      <Section
        title="Bilder und Medien"
        description="Bilder kommen immer aus der Mediathek. Hochladen geht direkt im Dialog, Bearbeiten öffnet den Bildeditor."
      >
        <MediaDemos />
      </Section>

      <Section title="Status und Personen" description="Badges zeigen Zustände, nie Aktionen. Punkt-Badges für Live und Entwurf.">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-3">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Akzent</Badge>
            <Badge tone="success" dot>
              Live
            </Badge>
            <Badge tone="warning" dot>
              Entwurf
            </Badge>
            <Badge tone="danger">Fehler</Badge>
          </div>
          <div className="flex flex-wrap items-end gap-6">
            {avatarSizes.map((avatar) => (
              <div key={avatar.size} className="flex flex-col items-center gap-2">
                <Avatar name={avatar.name} size={avatar.size} />
                <span className="text-sm text-muted">{avatar.label}</span>
              </div>
            ))}
          </div>
          <p className="text-[15px] text-muted">
            Klein in Tabellen und Listen, Standard in Menüs und Kopfzeilen, Groß im Profil.
          </p>
        </div>
      </Section>

      <Section title="Karten und Tabellen" description="Inhalte stehen in Karten auf dem grauen Hintergrund. Tabellen haben hohe Zeilen.">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Kartentitel" description="Optionale Beschreibung unter dem Titel" action={<Button size="sm" variant="secondary">Aktion</Button>} />
            <CardContent className="text-muted">Karteninhalt mit 24 px Innenabstand.</CardContent>
          </Card>
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Titel</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td className="font-medium">Startseite</Td>
                  <Td>
                    <Badge tone="warning" dot>
                      Entwurf
                    </Badge>
                  </Td>
                </tr>
                <tr>
                  <Td className="font-medium">Über uns</Td>
                  <Td>
                    <Badge tone="success" dot>
                      Live
                    </Badge>
                  </Td>
                </tr>
              </tbody>
            </Table>
          </Card>
        </div>
      </Section>

      <Section title="Interaktion" description="Menüs, Dialoge, Toasts, Tooltips und Umschalter. Alle basieren auf Base UI und sind per Tastatur bedienbar.">
        <InteractionDemos />
      </Section>

      <Section title="Tabs" description="Für Unterbereiche einer Seite, nicht für Hauptnavigation.">
        <Tabs defaultValue="a">
          <TabsList>
            <Tab value="a">Allgemein</Tab>
            <Tab value="b">Repository</Tab>
            <Tab value="c">Veröffentlichung</Tab>
          </TabsList>
          <TabPanel value="a" className="text-muted">
            Inhalt des ersten Tabs.
          </TabPanel>
          <TabPanel value="b" className="text-muted">
            Inhalt des zweiten Tabs.
          </TabPanel>
          <TabPanel value="c" className="text-muted">
            Inhalt des dritten Tabs.
          </TabPanel>
        </Tabs>
      </Section>

      <Section
        title="Leer und Laden"
        description="EmptyState, wenn eine Liste noch nichts enthält. Skeleton in der Form des späteren Inhalts, nie ein einzelner Spinner."
      >
        <div className="flex flex-col gap-6">
          <Card>
            <EmptyState
              icon={Inbox}
              title="Noch keine Eingänge"
              description="Sobald jemand ein Formular auf deiner Website absendet, erscheint es hier."
              action={<Button variant="secondary">Formular anlegen</Button>}
            />
          </Card>
          <Card className="flex flex-col gap-4 p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-7 w-20 rounded-full" />
            </div>
            <Skeleton className="h-24 w-full rounded-xl" />
          </Card>
        </div>
      </Section>

      <Section
        title="Seitenzustände"
        description="Laden, leer, Fehler und 404 als ganze Seiten. Jede neue Seite übernimmt diese Muster statt eigener Varianten."
      >
        <Card className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex flex-col gap-1">
            <span className="text-base font-semibold">Alle Zustände als statische Beispiele</span>
            <span className="text-[15px] text-muted">loading.tsx, EmptyState, error.tsx und not-found.tsx im Vergleich.</span>
          </div>
          <Link href="/styleguide/states" className={buttonStyles({ variant: "secondary" })}>
            Ansehen
            <ArrowRight />
          </Link>
        </Card>
      </Section>
    </PageContainer>
  );
}

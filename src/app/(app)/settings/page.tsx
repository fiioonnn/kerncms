import { GitBranch, ShieldCheck } from "lucide-react";
import { CopyButton, SaveButton } from "@/components/actions/common";
import { Redirects } from "./redirects";
import { RepoChangeButton } from "./repo-change";
import { Schema } from "./schema";
import { PageContainer } from "@/components/layout/page-container";
import { Badge, Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/toggles";

const languages = [
  { label: "Deutsch", value: "de" },
  { label: "Englisch", value: "en" },
];

const retention = [
  { label: "12 Monate", value: "12" },
  { label: "24 Monate", value: "24" },
  { label: "36 Monate", value: "36" },
];

const branches = [
  { label: "main", value: "main" },
  { label: "staging", value: "staging" },
];

export default function SettingsPage() {
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Einstellungen" description="Allgemeine Angaben, Repository, Veröffentlichung, Tracking, Weiterleitungen und Schema." />

      <Tabs defaultValue="general">
        <TabsList>
          <Tab value="general">Allgemein</Tab>
          <Tab value="repository">Repository</Tab>
          <Tab value="publishing">Veröffentlichung</Tab>
          <Tab value="tracking">Tracking</Tab>
          <Tab value="redirects">Weiterleitungen</Tab>
          <Tab value="schema">Schema</Tab>
        </TabsList>

        <TabPanel value="general">
          <Card>
            <CardHeader title="Website" description="So erscheint die Website im CMS." />
            <CardContent className="flex flex-col gap-6">
              <Field>
                <Label>Name</Label>
                <Input defaultValue="Bäckerei Müller" />
              </Field>
              <Field>
                <Label>Domain</Label>
                <Input defaultValue="baeckerei-mueller.de" />
              </Field>
              <Select label="Sprache" items={languages} defaultValue="de" />
              <div className="flex justify-end border-t border-border pt-6">
                <SaveButton description="Die Einstellungen gelten sofort." />
              </div>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="repository">
          <Card>
            <CardHeader
              title="Git-Repository"
              description="Hier liegen alle Inhalte als Dateien."
              action={
                <Badge tone="success" dot>
                  Verbunden
                </Badge>
              }
            />
            <CardContent className="flex flex-col gap-6">
              <div className="flex items-center gap-4 rounded-xl border border-border bg-subtle/50 px-5 py-4">
                <GitBranch className="size-6 text-muted" strokeWidth={1.75} />
                <span className="flex flex-col">
                  <span className="font-mono text-[15px] font-medium">baeckerei-mueller/website</span>
                  <span className="text-sm text-muted">über die kerncms GitHub App</span>
                </span>
                <RepoChangeButton />
              </div>
              <Select label="Live-Branch" items={branches} defaultValue="main" />
              <Field>
                <Label>Content-Ordner</Label>
                <Input defaultValue="src/content" className="font-mono" />
                <Description>Relativ zum Stammverzeichnis des Repositorys.</Description>
              </Field>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="publishing">
          <Card>
            <CardHeader title="Veröffentlichung" description="Was beim Klick auf „Veröffentlichen“ passiert." />
            <CardContent className="flex flex-col gap-7">
              <Switch
                label="Freigabe erforderlich"
                description="Änderungen von Redakteuren muss ein Admin freigeben."
                defaultChecked
              />
              <Switch label="Entwürfe als eigener Branch" description="Jede Person arbeitet auf einem eigenen Branch." defaultChecked />
              <Switch label="Vorschau-Links teilen" description="Entwürfe per Link ohne Anmeldung ansehen." />
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="tracking" className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title="Besucherstatistik"
              description="Cookielos und ohne personenbezogene Daten, daher ohne Cookie-Banner nutzbar."
              action={
                <Badge tone="success" dot>
                  Aktiv
                </Badge>
              }
            />
            <CardContent className="flex flex-col gap-7">
              <Switch label="Statistik erfassen" description="Zählt Besucher und Seitenaufrufe dieser Website." defaultChecked />
              <Switch
                label="„Do Not Track“ respektieren"
                description="Browser mit aktivierter DNT-Einstellung werden nicht gezählt."
                defaultChecked
              />
              <Switch
                label="Opt-out-Link für die Datenschutzerklärung"
                description="Besucher können die Zählung für ihren Browser abschalten."
                defaultChecked
              />
              <Switch label="Eigene Aufrufe ausschließen" description="Angemeldete CMS-Nutzer werden nicht gezählt." defaultChecked />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Speicherung" description="Wo und wie lange die Statistik aufbewahrt wird." />
            <CardContent className="flex flex-col gap-6">
              <div className="flex items-center gap-4 rounded-xl border border-border bg-subtle/50 px-5 py-4">
                <ShieldCheck className="size-6 shrink-0 text-success" strokeWidth={1.75} />
                <span className="flex flex-col">
                  <span className="text-[15px] font-medium">Rechenzentrum in Frankfurt am Main</span>
                  <span className="text-sm text-muted">Keine Übermittlung in Drittländer, IP-Adressen werden nie gespeichert.</span>
                </span>
              </div>
              <Select label="Aufbewahrung" items={retention} defaultValue="24" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Einbindung" description="Bei Astro-Seiten fügt die kerncms-Integration das Skript automatisch ein." />
            <CardContent className="flex flex-col gap-3">
              <span className="text-[15px] font-medium">Manuelles Snippet</span>
              <div className="flex items-start gap-3 rounded-xl border border-border bg-subtle/50 p-4">
                <code className="min-w-0 flex-1 font-mono text-sm leading-relaxed break-all">
                  {'<script defer src="/_kern/t.js"></script>'}
                </code>
                <CopyButton value={"<script defer src=\"/_kern/t.js\"></script>"} />
              </div>
              <p className="text-sm text-muted">
                Das Skript wird über die eigene Domain ausgeliefert, damit keine Daten an Dritte gehen.
              </p>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="redirects" className="pt-5">
          <Redirects />
        </TabPanel>

        <TabPanel value="schema">
          <Schema />
        </TabPanel>
      </Tabs>
    </PageContainer>
  );
}

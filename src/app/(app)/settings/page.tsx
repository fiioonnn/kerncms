import { GitBranch } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/toggles";

const languages = [
  { label: "Deutsch", value: "de" },
  { label: "Englisch", value: "en" },
];

const branches = [
  { label: "main", value: "main" },
  { label: "staging", value: "staging" },
];

export default function SettingsPage() {
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Einstellungen" description="Allgemeine Angaben, Repository und Veröffentlichung." />

      <Tabs defaultValue="general">
        <TabsList>
          <Tab value="general">Allgemein</Tab>
          <Tab value="repository">Repository</Tab>
          <Tab value="publishing">Veröffentlichung</Tab>
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
                <Button>Speichern</Button>
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
                <Button variant="secondary" size="sm" className="ml-auto">
                  Ändern
                </Button>
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
      </Tabs>
    </PageContainer>
  );
}

import Link from "next/link";
import { ExternalLink, FolderGit2, GitBranch, History } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { getSettings } from "@/server/queries";
import { getSiteContext } from "@/server/sites";
import { DangerZone } from "./danger-zone";
import { GeneralSettings } from "./general";
import { Redirects } from "./redirects";
import { Schema } from "./schema";

function InfoRow({ icon: Icon, label, value, mono = true }: { icon: typeof GitBranch; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-subtle/50 px-5 py-4">
      <Icon className="size-6 shrink-0 text-muted" strokeWidth={1.75} />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm text-muted">{label}</span>
        <span className={mono ? "truncate font-mono text-[15px] font-medium" : "truncate text-[15px] font-medium"}>{value}</span>
      </span>
    </div>
  );
}

export default async function SettingsPage() {
  const [settings, ctx] = await Promise.all([getSettings(), getSiteContext()]);
  const github = ctx.site.source === "github" && ctx.site.githubRepo ? ctx.site.githubRepo : null;
  const { site, role, config } = settings;
  const isAdmin = role === "admin" || role === "owner";

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Einstellungen" description="Allgemeine Angaben, Weiterleitungen, Schema und Repository dieser Website." />

      <Tabs defaultValue="general">
        <TabsList className="overflow-x-auto">
          <Tab value="general">Allgemein</Tab>
          <Tab value="redirects">Weiterleitungen</Tab>
          <Tab value="schema">Schema</Tab>
          <Tab value="repository">Repository</Tab>
          <Tab value="danger">Gefahrenzone</Tab>
        </TabsList>

        <TabPanel value="general">
          <GeneralSettings
            canEdit={isAdmin}
            initial={{
              name: site.name,
              liveUrl: site.liveUrl ?? "",
              requireApproval: site.requireApproval,
              analyticsEnabled: site.analyticsEnabled,
            }}
          />
        </TabPanel>

        <TabPanel value="redirects" className="pt-5">
          <Redirects initial={settings.redirects} file={config.redirects} canEdit={isAdmin} />
        </TabPanel>

        <TabPanel value="schema">
          <Schema config={config} source={settings.configSource} file={settings.configFile} />
        </TabPanel>

        <TabPanel value="repository">
          <Card>
            <CardHeader
              title="Git-Repository"
              description="Alle Inhalte liegen als Dateien im Repository. Git ist die einzige Quelle der Wahrheit."
              action={
                <Badge tone="success" dot>
                  Verbunden
                </Badge>
              }
            />
            <CardContent className="flex flex-col gap-4">
              {github ? (
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-subtle/50 px-5 py-4">
                  <FolderGit2 className="size-6 shrink-0 text-muted" strokeWidth={1.75} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm text-muted">GitHub-Repository</span>
                    <span className="truncate font-mono text-[15px] font-medium">{github}</span>
                  </span>
                  <a href={`https://github.com/${github}`} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    <ExternalLink />
                    Auf GitHub öffnen
                  </a>
                </div>
              ) : (
                <InfoRow icon={FolderGit2} label="Lokaler Ordner" value={site.repoPath} />
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow icon={GitBranch} label="Live-Branch" value={site.branch} />
                <InfoRow icon={GitBranch} label="Entwurfs-Branch" value="kern/draft" />
              </div>
              <p className="text-sm text-muted">
                Speichern legt einen Commit auf <code className="font-mono">kern/draft</code> an. Veröffentlichen übernimmt ihn in{" "}
                <code className="font-mono">{site.branch}</code> und baut die Website. Änderungen, die Entwickler direkt auf{" "}
                <code className="font-mono">{site.branch}</code> pushen, werden beim Veröffentlichen übernommen.
              </p>
              <div>
                <Link href="/history" className={buttonStyles({ variant: "secondary" })}>
                  <History />
                  Verlauf ansehen
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="danger">
          <DangerZone siteName={site.name} role={role} />
        </TabPanel>
      </Tabs>
    </PageContainer>
  );
}

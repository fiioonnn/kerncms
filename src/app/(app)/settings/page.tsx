import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  FileCode,
  FolderGit2,
  GitBranch,
  GitMerge,
  History,
  KeyRound,
  Route,
  Settings2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { cn } from "@/lib/utils";
import { getSettings } from "@/server/queries";
import { getSiteContext } from "@/server/sites";
import { headers } from "next/headers";
import { DangerZone } from "./danger-zone";
import { EmbedSettings } from "./embed";
import { GeneralSettings } from "./general";
import { Redirects } from "./redirects";
import { Schema } from "./schema";
import { SettingsRow, SettingsSection } from "./settings-ui";

export const metadata = { title: "Einstellungen · kerncms" };

const sections: { id: string; label: string; description: string; icon: LucideIcon }[] = [
  { id: "general", label: "Allgemein", description: "Name, Adresse, Freigaben", icon: Settings2 },
  { id: "redirects", label: "Weiterleitungen", description: "Alte Adressen umleiten", icon: Route },
  { id: "embed", label: "Einbindung", description: "Schlüssel und Domains", icon: KeyRound },
  { id: "schema", label: "Schema", description: "Was bearbeitbar ist", icon: FileCode },
  { id: "repository", label: "Repository", description: "Git und Veröffentlichen", icon: FolderGit2 },
  { id: "danger", label: "Gefahrenzone", description: "Verwerfen, verlassen", icon: TriangleAlert },
];

function hostOf(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function BranchChip({ name, tone }: { name: string; tone: "draft" | "live" }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg border px-3 font-mono text-sm font-medium",
        tone === "live" ? "border-success/30 bg-success-soft text-success" : "border-warning/30 bg-warning-soft text-warning",
      )}
    >
      <GitBranch className="size-4" strokeWidth={2} />
      {name}
    </span>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const [settings, ctx, { tab }] = await Promise.all([getSettings(), getSiteContext(), searchParams]);
  const active = sections.some((s) => s.id === tab) ? (tab as string) : "general";
  const github = ctx.site.source === "github" && ctx.site.githubRepo ? ctx.site.githubRepo : null;
  const { site, role, config } = settings;
  const isAdmin = role === "admin" || role === "owner";
  const host = hostOf(site.liveUrl);
  const initials = site.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <PageContainer className="max-w-6xl">
      {/* Site card */}
      <div className="mb-8 flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card sm:gap-5 sm:p-5">
        <span className="flex size-12 shrink-0 sm:size-14 items-center justify-center rounded-2xl bg-accent-soft text-lg font-semibold text-accent">{initials}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight">Einstellungen</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
            <span className="font-medium text-foreground">{site.name}</span>
            {host && (
              <a href={site.liveUrl!} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-accent">
                {host}
                <ExternalLink className="size-3.5" />
              </a>
            )}
            <span className="flex items-center gap-1.5">
              {github ? <GithubMark className="size-3.5" /> : <FolderGit2 className="size-3.5" />}
              {github ?? "Lokaler Ordner"}
            </span>
            <span className="flex items-center gap-1.5">
              <GitBranch className="size-3.5" />
              {site.branch}
            </span>
          </div>
        </div>
        <Badge tone="success" dot className="hidden sm:inline-flex">
          Verbunden
        </Badge>
      </div>

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        {/* Section navigation */}
        <nav aria-label="Bereiche" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:sticky lg:top-24 lg:flex-col lg:overflow-visible">
          {sections.map((section) => {
            const isActive = section.id === active;
            return (
              <Link
                key={section.id}
                href={section.id === "general" ? "/settings" : `/settings?tab=${section.id}`}
                aria-current={isActive ? "page" : undefined}
                scroll={false}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent lg:py-3",
                  isActive ? "bg-surface shadow-card ring-1 ring-border" : "text-muted hover:bg-subtle hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    isActive ? (section.id === "danger" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent") : "bg-subtle",
                  )}
                >
                  <section.icon className="size-[18px]" strokeWidth={1.75} />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className={cn("text-[15px] font-medium", isActive && "text-foreground")}>{section.label}</span>
                  <span className="hidden text-[13px] text-muted lg:block">{section.description}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0">
          {active === "general" && (
            <GeneralSettings
              canEdit={isAdmin}
              initial={{
                name: site.name,
                liveUrl: site.liveUrl ?? "",
                requireApproval: site.requireApproval,
                analyticsEnabled: site.analyticsEnabled,
              }}
            />
          )}

          {active === "redirects" && <Redirects initial={settings.redirects} file={config.redirects} canEdit={isAdmin} />}

          {active === "embed" && (
            <EmbedSettings
              publicKey={site.publicKey}
              allowedOrigins={site.allowedOrigins}
              liveUrl={site.liveUrl}
              cmsUrl={process.env.KERN_PUBLIC_URL ?? `${(await headers()).get("x-forwarded-proto") ?? "http"}://${(await headers()).get("host")}`}
              canEdit={isAdmin}
            />
          )}

          {active === "schema" && <Schema config={config} source={settings.configSource} file={settings.configFile} />}

          {active === "repository" && (
            <div className="flex flex-col gap-6">
              <SettingsSection
                title="Git-Repository"
                description="Alle Inhalte liegen als Dateien im Repository. Git ist die einzige Quelle der Wahrheit."
                action={
                  github ? (
                    <a href={`https://github.com/${github}`} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      <GithubMark className="size-4" />
                      Auf GitHub öffnen
                    </a>
                  ) : null
                }
              >
                <SettingsRow
                  icon={FolderGit2}
                  label={github ? "GitHub-Repository" : "Lokaler Ordner"}
                  description={github ? "Über die GitHub App verbunden." : "Nur in der Entwicklung: kerncms arbeitet direkt in diesem Ordner."}
                >
                  <code className="block truncate rounded-xl border border-border bg-subtle/60 px-4 py-3 font-mono text-[15px]">{github ?? site.repoPath}</code>
                </SettingsRow>
                <SettingsRow icon={GitMerge} label="Branches" description="Bearbeitet wird im Entwurf; Veröffentlichen übernimmt ihn in den Live-Branch.">
                  <div className="flex flex-wrap items-center gap-2">
                    <BranchChip name="kern/draft" tone="draft" />
                    <ArrowRight className="size-4 text-muted" />
                    <BranchChip name={site.branch} tone="live" />
                  </div>
                </SettingsRow>
              </SettingsSection>

              <SettingsSection title="So kommen Änderungen live">
                <ol className="grid gap-px bg-border sm:grid-cols-3">
                  {[
                    {
                      title: "Speichern",
                      text: (
                        <>
                          Legt einen Commit auf <code className="font-mono">kern/draft</code> an.
                          {github ? " Er wird als Sicherung zu GitHub übertragen." : ""}
                        </>
                      ),
                    },
                    {
                      title: "Veröffentlichen",
                      text: (
                        <>
                          Übernimmt den Entwurf in <code className="font-mono">{site.branch}</code>, inklusive Änderungen, die Entwickler dort gepusht haben.
                        </>
                      ),
                    },
                    {
                      title: github ? "Hosting baut" : "Website wird gebaut",
                      text: github ? "Dein Hosting baut die Website aus dem Live-Branch." : "kerncms führt den Build-Befehl aus der Konfiguration aus.",
                    },
                  ].map((step, i) => (
                    <li key={step.title} className="flex flex-col gap-2 bg-surface px-6 py-5">
                      <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{i + 1}</span>
                      <span className="text-[15px] font-medium">{step.title}</span>
                      <span className="text-sm leading-relaxed text-muted">{step.text}</span>
                    </li>
                  ))}
                </ol>
              </SettingsSection>

              <div>
                <Link href="/history" className={buttonStyles({ variant: "secondary" })}>
                  <History />
                  Verlauf ansehen
                </Link>
              </div>
            </div>
          )}

          {active === "danger" && <DangerZone siteName={site.name} role={role} platformAdmin={ctx.user.isAdmin} />}
        </div>
      </div>
    </PageContainer>
  );
}

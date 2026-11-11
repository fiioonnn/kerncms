import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, Building2, CircleAlert, CircleCheck, ExternalLink, Info, Settings2, UserRound } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { adminGithub } from "@/server/admin";
import { GithubIcon, GithubLucide } from "../_components/github-icon";
import { AppSetupForm, DisconnectButton, ResetupButton } from "./github-actions";

export const metadata = { title: "GitHub · Admin · kerncms" };

const errors: Record<string, string> = {
  state: "Die Anfrage war abgelaufen oder kam nicht aus diesem Browser. Bitte starte die Einrichtung noch einmal.",
  exchange: "GitHub hat die Zugangsdaten der neuen App nicht herausgegeben. Bitte versuche es noch einmal.",
};

function manageUrl(account: string, type: string) {
  return type === "Organization"
    ? `https://github.com/organizations/${encodeURIComponent(account)}/settings/installations`
    : "https://github.com/settings/installations";
}

export default async function GithubPage({ searchParams }: PageProps<"/admin/github">) {
  const [params, github, h] = await Promise.all([searchParams, adminGithub(), headers()]);
  const base = github.publicUrl ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost"}`;
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(base);
  const installUrl = github.app ? `https://github.com/apps/${github.app.slug}/installations/new` : null;
  const error = typeof params.error === "string" ? (errors[params.error] ?? "Bei der Einrichtung ist etwas schiefgelaufen. Bitte versuche es noch einmal.") : null;

  return (
    <PageContainer>
      <PageHeader title="GitHub" description="Über eine eigene GitHub-App liest und schreibt kerncms die Repositories der Websites." />

      <div className="flex flex-col gap-6">
        {error && <Banner tone="danger" title="Einrichtung fehlgeschlagen" text={error} />}
        {params.created === "1" && github.app && (
          <Banner
            tone="success"
            title={`${github.app.name} ist angelegt`}
            text="Installiere die App jetzt auf dem Konto oder der Organisation, in der die Repositories liegen."
            action={
              installUrl && (
                <a href={installUrl} className={buttonStyles({ size: "sm" })}>
                  <GithubIcon />
                  Jetzt installieren
                </a>
              )
            }
          />
        )}
        {params.installed === "1" && (
          <Banner
            tone="success"
            title="App installiert"
            text="Die Repositories dieses Kontos stehen jetzt zum Verbinden bereit."
            action={
              <Link href="/admin/sites/new" className={buttonStyles({ size: "sm" })}>
                Website verbinden
                <ArrowRight />
              </Link>
            }
          />
        )}
        {local && (
          <Banner
            tone="info"
            title="kerncms läuft lokal"
            text="GitHub kann diese Adresse nicht erreichen, deshalb sind Webhooks aus. kerncms holt Änderungen stattdessen jede Minute und vor jedem Veröffentlichen von GitHub."
          />
        )}

        <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
          {github.app ? (
            <div className="flex min-w-0 flex-col gap-6">
              <Card>
                <CardHeader
                  title={github.app.name}
                  description="Die GitHub-App dieser kerncms-Installation"
                  action={
                    <a href={`https://github.com/apps/${github.app.slug}`} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      <ExternalLink />
                      Auf GitHub
                    </a>
                  }
                />
                <CardContent className="flex flex-col gap-6">
                  <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
                    <Fact label="Name" value={github.app.slug} mono />
                    <Fact label="App-ID" value={github.app.appId} mono />
                    <Fact label="Eigentümer" value={github.app.owner ?? "Unbekannt"} />
                  </dl>
                  <div className="flex flex-wrap gap-3 border-t border-border pt-5">
                    <ResetupButton />
                    <DisconnectButton />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader
                  title="Installationen"
                  description="Konten, deren Repositories kerncms sehen darf"
                  className="pb-4"
                  action={
                    installUrl && github.installations.length > 0 ? (
                      <a href={installUrl} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                        <GithubIcon />
                        Auf weiterem Konto installieren
                      </a>
                    ) : undefined
                  }
                />
                {github.error ? (
                  <div className="border-t border-border p-6">
                    <Banner tone="danger" title="GitHub antwortet nicht" text={github.error} />
                  </div>
                ) : github.installations.length === 0 ? (
                  <EmptyState
                    icon={GithubLucide}
                    title="Noch nirgends installiert"
                    description="Installiere die App auf dem Konto oder der Organisation mit den Repositories der Websites."
                    className="border-t border-border py-12"
                    action={
                      installUrl && (
                        <a href={installUrl} className={buttonStyles()}>
                          <GithubIcon />
                          App installieren
                        </a>
                      )
                    }
                  />
                ) : (
                  <ul className="border-t border-border">
                    {github.installations.map((i) => {
                      const org = i.type === "Organization";
                      return (
                        <li key={i.id} className="flex flex-wrap items-center gap-4 border-b border-border px-6 py-4 last:border-0">
                          {i.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element -- small remote avatar from GitHub
                            <img src={i.avatar} alt="" width={40} height={40} className="size-10 rounded-full border border-border" />
                          ) : (
                            <span className="flex size-10 items-center justify-center rounded-full bg-subtle text-muted">
                              {org ? <Building2 className="size-5" strokeWidth={1.75} /> : <UserRound className="size-5" strokeWidth={1.75} />}
                            </span>
                          )}
                          <span className="flex min-w-0 flex-1 flex-col leading-snug">
                            <span className="truncate text-base font-medium">{i.account}</span>
                            <span className="text-sm text-muted">{org ? "Organisation" : "Persönliches Konto"}</span>
                          </span>
                          <a href={manageUrl(i.account, i.type)} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "ghost", size: "sm" })}>
                            <Settings2 />
                            Installation verwalten
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          ) : (
            <SetupSteps />
          )}

          <Permissions />
        </div>
      </div>
    </PageContainer>
  );
}

function SetupSteps() {
  return (
    <Card>
      <CardHeader title="GitHub einrichten" description="Einmalig für diese kerncms-Installation. Dauert etwa zwei Minuten." />
      <CardContent>
        <ol className="flex flex-col">
          <Step n={1} title="App anlegen" active>
            <p className="text-[15px] text-muted">
              kerncms schickt dich zu GitHub, wo die App mit den passenden Rechten vorbereitet ist. Du bestätigst dort nur noch und kommst automatisch zurück.
            </p>
            <AppSetupForm />
          </Step>
          <Step n={2} title="Auf dem Konto installieren">
            <p className="text-[15px] text-muted">
              Danach installierst du die App auf deinem GitHub-Konto oder der Organisation und wählst die Repositories der Kunden-Websites aus.
            </p>
          </Step>
          <Step n={3} title="Fertig" last>
            <p className="text-[15px] text-muted">Ab dann verbindest du Websites direkt aus der Liste der Repositories.</p>
          </Step>
        </ol>
      </CardContent>
    </Card>
  );
}

function Step({ n, title, active, last, children }: { n: number; title: string; active?: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold",
            active ? "bg-accent text-accent-foreground" : "bg-subtle text-muted",
          )}
        >
          {n}
        </span>
        {!last && <span className="my-2 w-px flex-1 bg-border" />}
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col gap-3 pt-1.5", !last && "pb-8")}>
        <h3 className={cn("text-base font-semibold", !active && "text-foreground/70")}>{title}</h3>
        {children}
      </div>
    </li>
  );
}

function Permissions() {
  return (
    <Card>
      <CardHeader title="Was die App darf" />
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <Permission label="Contents" access="Lesen und schreiben" text="Inhalte lesen, Änderungen als Commits speichern und veröffentlichen." />
          <Permission label="Metadata" access="Lesen" text="Repositories und Branches auflisten." />
        </div>
        <p className="border-t border-border pt-4 text-[15px] text-muted">
          Der Code der Websites bleibt auf GitHub. kerncms arbeitet in einer eigenen Kopie und schreibt nur in die Repositories, auf denen die App installiert ist.
        </p>
      </CardContent>
    </Card>
  );
}

function Permission({ label, access, text }: { label: string; access: string; text: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-subtle/60 px-4 py-3">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-medium">{label}</span>
        <Badge className="h-6 bg-surface px-2 text-xs">{access}</Badge>
      </span>
      <span className="text-sm text-muted">{text}</span>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={cn("truncate text-base font-medium", mono && "font-mono text-[15px]")}>{value}</dd>
    </div>
  );
}

function Banner({ tone, title, text, action }: { tone: "success" | "danger" | "info"; title: string; text: string; action?: React.ReactNode }) {
  const Icon = tone === "success" ? CircleCheck : tone === "danger" ? CircleAlert : Info;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border px-5 py-4 sm:flex-row sm:items-center",
        tone === "success" && "border-success/30 bg-success-soft",
        tone === "danger" && "border-danger/30 bg-danger-soft",
        tone === "info" && "border-accent/20 bg-accent-soft",
      )}
    >
      <Icon
        className={cn("size-6 shrink-0", tone === "success" && "text-success", tone === "danger" && "text-danger", tone === "info" && "text-accent")}
        strokeWidth={1.75}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-semibold">{title}</span>
        <span className="text-[15px] text-foreground/80">{text}</span>
      </div>
      {action}
    </div>
  );
}

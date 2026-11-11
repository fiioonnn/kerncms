import Link from "next/link";
import { ArrowRight, BadgeCheck, ExternalLink, GitCommitHorizontal, Inbox, MousePointerClick, Plus, TrendingDown, TrendingUp, Users } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { VisitorsChart } from "@/components/charts/visitors-chart";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { formatWhen, numberFormat } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { getDashboard } from "@/server/queries";
import { PendingCard } from "./_dashboard/pending-card";

function greeting(hour: number) {
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
}

function Change({ value }: { value: number }) {
  if (value === 0) return <span className="text-sm text-muted">wie zuvor</span>;
  const up = value > 0;
  return (
    <span className={cn("flex items-center gap-1 text-sm font-medium", up ? "text-success" : "text-danger")}>
      {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
      {up ? "+" : "−"}
      {Math.abs(value)} %
    </span>
  );
}

export default async function DashboardPage() {
  const data = await getDashboard();
  const firstName = data.user.name.split(" ")[0];
  const pageTitles = new Map(data.pages.map((p) => [p.path, p.title]));
  const a = data.analytics;

  return (
    <PageContainer>
      <PageHeader
        title={`${greeting(new Date().getHours())}, ${firstName}`}
        description={`Was sich auf ${data.site.name} zuletzt getan hat.`}
        actions={
          <>
            {data.site.liveUrl && (
              <a href={data.site.liveUrl} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary" })}>
                <ExternalLink />
                Live ansehen
              </a>
            )}
            <Link href="/editor" className={buttonStyles()}>
              <MousePointerClick />
              Website bearbeiten
            </Link>
          </>
        }
      />

      {/* Things that need attention */}
      <div className="grid gap-5 sm:grid-cols-3">
        <StatLink href="/analytics" icon={Users} value={numberFormat.format(a.visitors)} label="Besucher, letzte 7 Tage" />
        <StatLink
          href="/forms"
          icon={Inbox}
          value={numberFormat.format(data.unreadForms)}
          label={data.unreadForms === 1 ? "Ungelesene Nachricht" : "Ungelesene Nachrichten"}
          highlight={data.unreadForms > 0}
        />
        <StatLink
          href="/approvals"
          icon={BadgeCheck}
          value={numberFormat.format(data.openApprovals)}
          label={data.openApprovals === 1 ? "Offene Freigabe" : "Offene Freigaben"}
          highlight={data.openApprovals > 0}
        />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Besucher"
          description="Letzte 7 Tage · ohne Cookies erfasst"
          action={
            <Link href="/analytics" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Alle Statistiken
              <ArrowRight />
            </Link>
          }
        />
        <CardContent className="grid gap-10 pt-6 xl:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-6">
            <div className="flex flex-wrap gap-x-12 gap-y-4">
              <Kpi label="Besucher" value={numberFormat.format(a.visitors)} change={a.visitorsChange} />
              <Kpi label="Seitenaufrufe" value={numberFormat.format(a.views)} change={a.viewsChange} />
              <Kpi label="Aufrufe pro Besuch" value={a.viewsPerVisit.toLocaleString("de-DE")} />
            </div>
            <VisitorsChart
              data={a.series.map((d) => ({ date: d.day, value: d.visitors }))}
              height={180}
              label="Besucher pro Tag, letzte 7 Tage"
            />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-[15px] font-medium">Beliebteste Seiten</h3>
            <BarList
              items={a.pages.slice(0, 5).map((p) => ({ label: pageTitles.get(p.path) ?? p.path, hint: pageTitles.has(p.path) ? p.path : undefined, value: p.views }))}
              valueLabel="Aufrufe"
            />
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title="Letzte Aktivität"
            description="Gespeicherte Änderungen im Entwurf"
            action={
              <Link href="/history" className="text-sm font-medium text-accent hover:underline">
                Ganzer Verlauf
              </Link>
            }
          />
          <CardContent className="flex flex-col gap-1 px-4">
            {data.recent.length === 0 ? (
              <EmptyState icon={GitCommitHorizontal} title="Noch keine Änderungen" description="Sobald jemand speichert, erscheint es hier." className="py-10" />
            ) : (
              data.recent.map((item) => (
                <div key={item.sha} className="flex items-center gap-4 rounded-xl px-3 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-subtle text-muted">
                    <GitCommitHorizontal className="size-4" strokeWidth={1.75} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-medium">{item.message}</span>
                    <span className="text-sm text-muted">
                      {item.author} · {formatWhen(item.date)}
                    </span>
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <PendingCard initialCount={data.pendingChanges} />
      </div>

      {data.collections.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Schnell anlegen" description="Neue Einträge für deine Inhalte" />
          <CardContent className="flex flex-wrap gap-3">
            {data.collections.map((c) => (
              <Link key={c.key} href={`/collections/${c.key}/new`} className={buttonStyles({ variant: "secondary" })}>
                <Plus />
                {c.singular}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}

function Kpi({ label, value, change }: { label: string; value: string; change?: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-[15px] text-muted">{label}</span>
      <span className="flex items-baseline gap-2.5">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {change !== undefined && <Change value={change} />}
      </span>
    </div>
  );
}

function StatLink({
  href,
  icon: Icon,
  value,
  label,
  highlight,
}: {
  href: string;
  icon: typeof Users;
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <Link href={href} className="group rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <Card className="flex items-center gap-4 p-5 transition-colors group-hover:border-border-strong">
        <span className={cn("flex size-12 items-center justify-center rounded-xl", highlight ? "bg-accent text-accent-foreground" : "bg-accent-soft text-accent")}>
          <Icon className="size-6" strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-3xl font-semibold tracking-tight">{value}</span>
          <span className="truncate text-[15px] text-muted">{label}</span>
        </span>
        <ArrowRight className="size-5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </Card>
    </Link>
  );
}

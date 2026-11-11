import Link from "next/link";
import { ArrowRight, Building2, Eye, Globe, Inbox, Plus, Rocket, TriangleAlert, Users } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { formatWhen, numberFormat } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { adminOverview } from "@/server/admin";
import { GithubIcon } from "./_components/github-icon";
import { NewCustomerDialog } from "./_components/customer-dialog";

export const metadata = { title: "Admin · kerncms" };

export default async function AdminOverviewPage() {
  const data = await adminOverview();

  return (
    <PageContainer>
      <PageHeader
        title="Übersicht"
        description="Alle Kunden, Websites und Nutzer dieser kerncms-Installation."
        actions={
          <>
            <NewCustomerDialog variant="secondary" />
            <Link href="/admin/sites/new" className={buttonStyles()}>
              <Plus />
              Website verbinden
            </Link>
          </>
        }
      />

      {!data.githubConfigured && (
        <Card className="mb-6 flex flex-col gap-4 border-warning/40 bg-warning-soft p-5 sm:flex-row sm:items-center">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface text-warning">
            <TriangleAlert className="size-6" strokeWidth={1.75} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="text-base font-semibold">GitHub ist noch nicht eingerichtet</h2>
            <p className="text-[15px] text-muted">Ohne GitHub-App lassen sich keine Websites aus GitHub verbinden. Die Einrichtung dauert zwei Minuten.</p>
          </div>
          <Link href="/admin/github" className={buttonStyles({ variant: "secondary", className: "self-start sm:self-center" })}>
            <GithubIcon />
            GitHub einrichten
          </Link>
        </Card>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
        <Stat href="/admin/customers" icon={Building2} value={data.customers} label={data.customers === 1 ? "Aktiver Kunde" : "Aktive Kunden"} />
        <Stat href="/admin/sites" icon={Globe} value={data.sites} label={data.sites === 1 ? "Website" : "Websites"} />
        <Stat href="/admin/users" icon={Users} value={data.users} label="Nutzer" />
        <Stat href="/admin/sites" icon={Eye} value={data.views30d} label="Seitenaufrufe, 30 Tage" />
        <Stat icon={Inbox} value={data.forms30d} label="Formular-Nachrichten, 30 Tage" />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Letzte Veröffentlichungen"
          description={
            data.failedDeploys > 0
              ? `${data.failedDeploys} der letzten ${data.recentDeploys.length} fehlgeschlagen`
              : "Über alle Websites hinweg"
          }
          action={
            data.failedDeploys > 0 ? (
              <Badge tone="danger" dot>
                {data.failedDeploys} fehlgeschlagen
              </Badge>
            ) : undefined
          }
          className="pb-4"
        />
        {data.recentDeploys.length === 0 ? (
          <EmptyState icon={Rocket} title="Noch nichts veröffentlicht" description="Sobald jemand eine Website veröffentlicht, erscheint es hier." className="py-12" />
        ) : (
          <ul className="border-t border-border">
            {data.recentDeploys.map((d) => {
              const failed = d.status === "failed";
              return (
                <li
                  key={d.id}
                  className={cn(
                    "flex flex-col gap-2 border-b border-border px-6 py-4 last:rounded-b-2xl last:border-0 sm:flex-row sm:items-center sm:gap-6",
                    failed && "bg-danger-soft/60",
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-base font-medium">{d.message || "Veröffentlichung"}</span>
                    <span className="truncate text-sm text-muted">
                      {d.site}
                      {d.by ? ` · ${d.by}` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <Badge tone={failed ? "danger" : d.status === "running" ? "accent" : "success"} dot>
                      {failed ? "Fehlgeschlagen" : d.status === "running" ? "Läuft" : "Live"}
                    </Badge>
                    <span className="w-32 text-right text-sm text-muted tabular-nums">{formatWhen(d.createdAt)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </PageContainer>
  );
}

function Stat({ href, icon: Icon, value, label }: { href?: string; icon: typeof Users; value: number; label: string }) {
  const body = (
    <Card className={cn("flex h-full items-center gap-4 p-5", href && "transition-colors group-hover:border-border-strong")}>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon className="size-6" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{numberFormat.format(value)}</span>
        <span className="text-[15px] leading-snug text-muted">{label}</span>
      </span>
      {href && <ArrowRight className="size-5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />}
    </Card>
  );
  if (!href) return body;
  return (
    <Link href={href} className="group rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      {body}
    </Link>
  );
}

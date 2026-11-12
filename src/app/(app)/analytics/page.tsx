import Link from "next/link";
import { Radio, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";
import { numberFormat } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { getAnalytics, getPages, getSettings } from "@/server/queries";
import { RangeControl, VisitorsCard } from "./visitors-card";

export const metadata = { title: "Statistiken" };

const RANGES = [7, 30, 90];

const deviceLabels: Record<string, string> = { desktop: "Desktop", mobile: "Smartphone", tablet: "Tablet" };

function Change({ value }: { value: number }) {
  if (value === 0) return <span className="text-sm text-muted">wie im Zeitraum davor</span>;
  const up = value > 0;
  return (
    <span className={cn("flex items-center gap-1.5 text-sm font-medium", up ? "text-success" : "text-danger")}>
      {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
      {up ? "+" : "−"}
      {Math.abs(value)} % zum Zeitraum davor
    </span>
  );
}

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const requested = Number((await searchParams).days);
  const days = RANGES.includes(requested) ? requested : 30;
  const [a, settings, pages] = await Promise.all([getAnalytics(days), getSettings(), getPages()]);
  const titles = new Map(pages.map((p) => [p.path, p.title]));
  const site = settings.site;

  return (
    <PageContainer>
      <PageHeader
        title="Statistiken"
        description="Wie viele Menschen deine Website besuchen und was sie sich ansehen. Ohne Cookies und ohne Cookie-Banner."
        actions={<RangeControl days={days} />}
      />

      {!site.analyticsEnabled && (
        <Card className="mb-6 flex flex-wrap items-center gap-4 border-warning/40 p-5">
          <span className="min-w-0 flex-1 text-[15px]">
            Die Statistik ist für diese Website ausgeschaltet. Neue Besuche werden nicht gezählt.
          </span>
          {(settings.role === "admin" || settings.role === "owner") && (
            <Link href="/settings" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Einschalten
            </Link>
          )}
        </Card>
      )}

      {/* KPIs */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="flex flex-col gap-1.5 p-5">
          <span className="text-[15px] text-muted">Besucher</span>
          <span className="text-3xl font-semibold tracking-tight">{numberFormat.format(a.visitors)}</span>
          <Change value={a.visitorsChange} />
        </Card>
        <Card className="flex flex-col gap-1.5 p-5">
          <span className="text-[15px] text-muted">Seitenaufrufe</span>
          <span className="text-3xl font-semibold tracking-tight">{numberFormat.format(a.views)}</span>
          <Change value={a.viewsChange} />
        </Card>
        <Card className="flex flex-col gap-1.5 p-5">
          <span className="text-[15px] text-muted">Aufrufe pro Besuch</span>
          <span className="text-3xl font-semibold tracking-tight">{a.viewsPerVisit.toLocaleString("de-DE")}</span>
          <span className="text-sm text-muted">Durchschnitt im Zeitraum</span>
        </Card>
        <Card className="flex flex-col gap-1.5 p-5">
          <span className="text-[15px] text-muted">Gerade auf der Website</span>
          <span className="text-3xl font-semibold tracking-tight">{numberFormat.format(a.live)}</span>
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <Radio className={cn("size-4", a.live > 0 && "text-success")} />
            Besucher der letzten 5 Minuten
          </span>
        </Card>
      </div>

      <VisitorsCard days={days} data={a.series.map((d) => ({ date: d.day, value: d.visitors }))} />

      {/* Breakdowns */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Beliebteste Seiten" />
          <CardContent>
            <BarList
              items={a.pages.map((p) => ({ label: titles.get(p.path) ?? p.path, hint: titles.has(p.path) ? p.path : undefined, value: p.views }))}
              valueLabel="Aufrufe"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Herkunft" description="Woher die Besucher kommen" />
          <CardContent>
            <BarList items={a.referrers.map((r) => ({ label: r.source, value: r.visitors }))} valueLabel="Besucher" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Geräte" />
          <CardContent>
            <BarList
              items={[...a.devices]
                .sort((x, y) => y.visitors - x.visitors)
                .map((d) => ({ label: deviceLabels[d.device] ?? d.device, hint: `${d.share} %`, value: d.visitors }))}
              valueLabel="Besucher"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Browser" />
          <CardContent>
            <BarList items={a.browsers.map((b) => ({ label: b.browser, value: b.visitors }))} valueLabel="Besucher" />
          </CardContent>
        </Card>
      </div>

      {/* Privacy note */}
      <Card className="mt-6 flex flex-wrap items-center gap-5 p-6">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
          <ShieldCheck className="size-6" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-base font-semibold">
            Ohne Cookies, ohne gespeicherte IP-Adressen
            <Badge tone="success">Kein Cookie-Banner nötig</Badge>
          </span>
          <span className="text-[15px] text-muted">
            Die Website meldet nur Pfad, Herkunft und Bildschirmbreite. Besucher werden über einen anonymen Schlüssel gezählt, der sich
            jeden Tag ändert. IP-Adressen werden nicht gespeichert, Browser mit „Do Not Track“ und die Vorschau im CMS werden nicht gezählt.
          </span>
        </div>
        {(settings.role === "admin" || settings.role === "owner") && (
          <Link href="/settings" className={buttonStyles({ variant: "secondary" })}>
            Einstellungen
          </Link>
        )}
      </Card>

      {a.visitors === 0 && a.views === 0 && (
        <Card className="mt-6">
          <CardHeader title="Noch keine Besuche gezählt" description="So meldet die Website Seitenaufrufe an kerncms." />
          <CardContent className="flex flex-col gap-3 text-[15px]">
            <p>
              Beim Laden jeder Seite schickt die Website per <code className="font-mono text-sm">navigator.sendBeacon</code> eine Anfrage an:
            </p>
            <code className="rounded-xl border border-border bg-subtle/50 px-4 py-3 font-mono text-sm break-all">
              POST /api/public/{site.key}/collect
            </code>
            <p className="text-muted">
              Inhalt: Pfad, Referrer und Bildschirmbreite als JSON. Die Variablen <code className="font-mono text-sm">PUBLIC_KERN_URL</code> und{" "}
              <code className="font-mono text-sm">PUBLIC_KERN_SITE</code> in der <code className="font-mono text-sm">.env</code> der Website
              legen Adresse und Website fest.
            </p>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}

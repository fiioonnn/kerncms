import Link from "next/link";
import { ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { VisitorsChart, type DailyPoint } from "@/components/charts/visitors-chart";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";
import { cn } from "@/lib/utils";

/* ---- Example data (UI only, nothing is tracked yet) ---- */

const daily: DailyPoint[] = [
  132, 148, 141, 120, 96, 88, 139, 151, 162, 158, 149, 110, 102, 155, 171, 168, 176, 160, 121, 115, 182, 190, 186,
  201, 194, 138, 129, 205, 214, 221,
].map((value, i) => ({
  date: new Date(Date.UTC(2026, 9, 13 + i)).toISOString().slice(0, 10),
  value,
}));

const kpis = [
  { label: "Besucher", value: "4.812", delta: "+12 %", up: true },
  { label: "Seitenaufrufe", value: "13.540", delta: "+8 %", up: true },
  { label: "Ø Besuchsdauer", value: "1:48 min", delta: "+6 %", up: true },
  { label: "Absprungrate", value: "41 %", delta: "−3 Pkt.", up: true },
];

const topPages = [
  { label: "Startseite", hint: "/", value: 5210 },
  { label: "Sortiment", hint: "/sortiment", value: 2980 },
  { label: "Neue Sauerteigbrote ab Mai", hint: "/aktuelles/…", value: 1640 },
  { label: "Kontakt", hint: "/kontakt", value: 1230 },
  { label: "Catering", hint: "/catering", value: 880 },
];

const sources = [
  { label: "Google", value: 2410 },
  { label: "Direkt", value: 1320 },
  { label: "Instagram", value: 610 },
  { label: "Google Maps", value: 330 },
  { label: "Facebook", value: 142 },
];

const devices = [
  { label: "Smartphone", value: 3180 },
  { label: "Desktop", value: 1290 },
  { label: "Tablet", value: 342 },
];

const regions = [
  { label: "Bayern", value: 3020 },
  { label: "Baden-Württemberg", value: 760 },
  { label: "Hessen", value: 410 },
  { label: "Österreich", value: 280 },
  { label: "Andere", value: 342 },
];

const ranges = ["7 Tage", "30 Tage", "12 Monate"];

export default function AnalyticsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Statistiken"
        description="Wie viele Menschen deine Website besuchen und was sie sich ansehen. Ohne Cookies und ohne Cookie-Banner."
      />

      {/* Filter row */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex rounded-xl border border-border bg-surface p-1">
          {ranges.map((range) => (
            <button
              key={range}
              type="button"
              className={cn(
                "h-9 rounded-lg px-4 text-[15px] font-medium transition-colors",
                range === "30 Tage" ? "bg-subtle text-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {range}
            </button>
          ))}
        </div>
        <Badge tone="success" className="h-9 gap-2 px-3.5">
          <ShieldCheck className="size-4" />
          Cookielos · Daten in der EU
        </Badge>
      </div>

      {/* KPIs */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="flex flex-col gap-2 p-6">
            <span className="text-[15px] text-muted">{kpi.label}</span>
            <span className="text-3xl font-semibold tracking-tight">{kpi.value}</span>
            <span className={cn("flex items-center gap-1.5 text-sm font-medium", kpi.up ? "text-success" : "text-danger")}>
              {kpi.up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              {kpi.delta} zum Vormonat
            </span>
          </Card>
        ))}
      </div>

      {/* Visitors over time */}
      <Card className="mt-8">
        <CardHeader title="Besucher pro Tag" description="Letzte 30 Tage, eindeutige Besucher je Tag" />
        <CardContent className="pt-8">
          <VisitorsChart data={daily} label="Besucher pro Tag, letzte 30 Tage" />
        </CardContent>
      </Card>

      {/* Breakdowns */}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader title="Beliebteste Seiten" />
          <CardContent>
            <BarList items={topPages} valueLabel="Aufrufe" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Herkunft" description="Woher die Besucher kommen" />
          <CardContent>
            <BarList items={sources} valueLabel="Besucher" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Geräte" />
          <CardContent>
            <BarList items={devices} valueLabel="Besucher" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Regionen" description="Aus der IP abgeleitet, die IP selbst wird nicht gespeichert" />
          <CardContent>
            <BarList items={regions} valueLabel="Besucher" />
          </CardContent>
        </Card>
      </div>

      {/* Privacy note */}
      <Card className="mt-8 flex flex-wrap items-center gap-6 p-7">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
          <ShieldCheck className="size-6" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-base font-semibold">DSGVO-konform ohne Einwilligung</span>
          <span className="text-[15px] text-muted">
            Keine Cookies, keine Fingerprints, keine personenbezogenen Daten. Besucher werden über einen täglich
            wechselnden, anonymen Schlüssel gezählt. Gespeichert wird ausschließlich in der EU.
          </span>
        </div>
        <Link href="/settings" className={buttonStyles({ variant: "secondary" })}>
          Tracking-Einstellungen
        </Link>
      </Card>
    </PageContainer>
  );
}

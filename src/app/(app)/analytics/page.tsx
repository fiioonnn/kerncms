import Link from "next/link";
import { ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { VisitorsCard } from "./visitors-card";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";
import { analyticsKpis, dailyVisitors, topPages } from "@/lib/example-analytics";
import { cn } from "@/lib/utils";

/* ---- Example data (UI only, nothing is tracked yet) ---- */

const daily = dailyVisitors;
const kpis = analyticsKpis;
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


export default function AnalyticsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Statistiken"
        description="Wie viele Menschen deine Website besuchen und was sie sich ansehen. Ohne Cookies und ohne Cookie-Banner."
        actions={
          <Badge tone="success" className="h-9 gap-2 px-3.5">
            <ShieldCheck className="size-4" />
            Cookielos · Daten in der EU
          </Badge>
        }
      />

      {/* KPIs */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="flex flex-col gap-1.5 p-5">
            <span className="text-[15px] text-muted">{kpi.label}</span>
            <span className="text-3xl font-semibold tracking-tight">{kpi.value}</span>
            <span className={cn("flex items-center gap-1.5 text-sm font-medium", kpi.up ? "text-success" : "text-danger")}>
              {kpi.up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              {kpi.delta} zum Vormonat
            </span>
          </Card>
        ))}
      </div>

      <VisitorsCard data={daily} />

      {/* Breakdowns */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
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
      <Card className="mt-6 flex flex-wrap items-center gap-5 p-6">
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

"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleAlert, Clock, FilePen, Plus, Search, Users } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { SampleImage } from "@/components/media/sample-image";
import { buttonStyles } from "@/components/ui/button";
import { Badge, Card, PageHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type SiteStatus = "live" | "failed" | "drafts";

type Site = {
  name: string;
  domain: string;
  status: SiteStatus;
  updated: string;
  visitors: number;
  trend: number[];
  drafts: number;
};

const sites: Site[] = [
  {
    name: "Bäckerei Müller",
    domain: "baeckerei-mueller.de",
    status: "drafts",
    updated: "Heute, 09:42",
    visitors: 4820,
    trend: [120, 140, 132, 160, 151, 170, 182, 165, 190, 204, 198, 220],
    drafts: 3,
  },
  {
    name: "Hotel Seeblick",
    domain: "hotel-seeblick.at",
    status: "live",
    updated: "Gestern, 17:05",
    visitors: 12940,
    trend: [380, 410, 395, 450, 470, 440, 500, 520, 480, 540, 560, 590],
    drafts: 0,
  },
  {
    name: "Zahnarztpraxis Dr. Wolf",
    domain: "praxis-dr-wolf.de",
    status: "failed",
    updated: "Gestern, 11:20",
    visitors: 2310,
    trend: [90, 84, 96, 88, 80, 92, 78, 85, 74, 70, 76, 72],
    drafts: 1,
  },
  {
    name: "Weingut Reiter",
    domain: "weingut-reiter.de",
    status: "live",
    updated: "8. Nov.",
    visitors: 6105,
    trend: [140, 150, 170, 210, 260, 240, 220, 230, 250, 270, 300, 310],
    drafts: 0,
  },
  {
    name: "Tischlerei Brandt",
    domain: "tischlerei-brandt.de",
    status: "drafts",
    updated: "6. Nov.",
    visitors: 1480,
    trend: [50, 48, 55, 60, 52, 58, 62, 57, 66, 64, 70, 68],
    drafts: 5,
  },
  {
    name: "Kanzlei Hartmann & Partner",
    domain: "kanzlei-hartmann.de",
    status: "live",
    updated: "2. Nov.",
    visitors: 3790,
    trend: [130, 125, 128, 122, 135, 140, 132, 138, 129, 142, 136, 145],
    drafts: 0,
  },
];

const statusBadge: Record<SiteStatus, React.ReactNode> = {
  live: (
    <Badge tone="success" dot>
      Live
    </Badge>
  ),
  failed: (
    <Badge tone="danger">
      <CircleAlert className="size-3.5" />
      Build fehlgeschlagen
    </Badge>
  ),
  drafts: (
    <Badge tone="warning" dot>
      Entwürfe offen
    </Badge>
  ),
};

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const width = 96;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - 2 - ((v - min) / range) * (height - 4),
  ]);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-7 w-24 overflow-visible", className)} aria-hidden>
      <polygon points={area} className="fill-current opacity-10" />
      <polyline
        points={line}
        fill="none"
        className="stroke-current"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const numberFormat = new Intl.NumberFormat("de-DE");

export default function SitesPage() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = sites.filter((s) => s.name.toLowerCase().includes(q) || s.domain.includes(q));

  return (
    <PageContainer>
      <PageHeader
        title="Websites"
        description="Alle Kunden-Websites, die eure Agentur mit kerncms betreut."
        actions={
          <Link href="/onboarding" className={buttonStyles()}>
            <Plus />
            Website verbinden
          </Link>
        }
      />

      <div className="relative mb-6 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" strokeWidth={1.75} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Websites durchsuchen"
          placeholder="Websites durchsuchen"
          className="pl-11"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Search}
            title="Keine Website gefunden"
            description="Versuche es mit einem anderen Namen oder einer Domain."
          />
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((site) => {
            const first = site.trend[0];
            const last = site.trend.at(-1) ?? first;
            const change = Math.round(((last - first) / first) * 100);
            return (
              <Link
                key={site.domain}
                href="/"
                className="group rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
              >
                <Card className="flex h-full flex-col overflow-hidden transition-colors group-hover:border-border-strong">
                  <SampleImage name={site.domain} className="aspect-[16/9] w-full border-b border-border" />
                  <div className="flex flex-1 flex-col gap-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-base font-semibold group-hover:text-accent">{site.name}</span>
                        <span className="truncate text-sm text-muted">{site.domain}</span>
                      </div>
                      {statusBadge[site.status]}
                    </div>

                    <div className="flex items-end justify-between gap-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 text-sm text-muted">
                          <Users className="size-4" strokeWidth={1.75} />
                          Besucher, 30 Tage
                        </span>
                        <span className="flex items-baseline gap-2">
                          <span className="text-xl font-semibold tracking-tight">{numberFormat.format(site.visitors)}</span>
                          <span className={cn("text-sm font-medium", change >= 0 ? "text-success" : "text-danger")}>
                            {change >= 0 ? "+" : "−"}
                            {Math.abs(change)} %
                          </span>
                        </span>
                      </div>
                      <Sparkline values={site.trend} className={change >= 0 ? "text-accent" : "text-danger"} />
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4 text-sm text-muted">
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-4" strokeWidth={1.75} />
                        {site.updated}
                      </span>
                      <span className={cn("flex items-center gap-1.5", site.drafts > 0 && "text-warning")}>
                        <FilePen className="size-4" strokeWidth={1.75} />
                        {site.drafts === 0 ? "Keine Entwürfe" : site.drafts === 1 ? "1 Entwurf" : `${site.drafts} Entwürfe`}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

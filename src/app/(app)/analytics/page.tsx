import Link from "next/link";
import { Download, ExternalLink, FileText, Mail, Phone, Radio, ShieldCheck, TrendingDown, TrendingUp, UserSearch } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";
import { numberFormat } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { getAnalytics, getPages, getSettings } from "@/server/queries";
import { BreakdownCard } from "./breakdown-card";
import { RangeControl, VisitorsCard } from "./visitors-card";

export const metadata = { title: "Statistiken" };

const RANGES = [7, 30, 90];

const deviceLabels: Record<string, string> = { desktop: "Desktop", mobile: "Smartphone", tablet: "Tablet" };

const eventLabels = {
  tel: { label: "Anrufe", short: "Anruf", icon: Phone },
  mailto: { label: "E-Mails", short: "E-Mail", icon: Mail },
  download: { label: "Downloads", short: "Download", icon: Download },
  outbound: { label: "Externe Links", short: "Link", icon: ExternalLink },
};

const regionNames = new Intl.DisplayNames(["de"], { type: "region" });
const languageNames = new Intl.DisplayNames(["de"], { type: "language" });
const dateTime = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function countryName(code: string) {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function languageName(code: string) {
  try {
    return languageNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

function eventTarget(kind: string, target: string) {
  if (kind === "tel" || kind === "mailto") return target.replace(/^(tel|mailto):/, "");
  try {
    const url = new URL(target);
    return kind === "download" ? url.pathname.split("/").pop() || target : url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/$/, "");
  } catch {
    return target;
  }
}

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function peakSummary(grid: number[][]) {
  let best = { day: 0, hour: 0, views: 0 };
  grid.forEach((hours, day) => hours.forEach((views, hour) => views > best.views && (best = { day, hour, views })));
  if (!best.views) return "Seitenaufrufe nach Wochentag und Uhrzeit";
  const days = grid.map((hours) => hours.reduce((sum, v) => sum + v, 0));
  const topDay = days.indexOf(Math.max(...days));
  return `Am meisten los: ${WEEKDAYS[topDay]}s, am stärksten ${WEEKDAYS[best.day]} ${best.hour}–${best.hour + 1} Uhr`;
}

/** Weekday × hour grid of page views (German time); stronger tint = more views. */
function PeakHeatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="flex flex-col gap-1.5" role="img" aria-label="Seitenaufrufe nach Wochentag und Uhrzeit">
      {grid.map((hours, day) => (
        <div key={day} className="flex items-center gap-2">
          <span className="w-7 shrink-0 text-sm text-muted">{WEEKDAYS[day].slice(0, 2)}</span>
          <div className="grid flex-1 grid-cols-24 gap-[3px]">
            {hours.map((views, hour) => (
              <span
                key={hour}
                title={`${WEEKDAYS[day]}, ${hour}–${hour + 1} Uhr: ${numberFormat.format(views)} Aufrufe`}
                className="aspect-square rounded-[3px] bg-subtle"
                style={views ? { backgroundColor: `color-mix(in oklab, var(--color-accent) ${15 + Math.round((views / max) * 85)}%, transparent)` } : undefined}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <span className="w-7 shrink-0" />
        <div className="grid flex-1 grid-cols-4 text-xs text-muted">
          {[0, 6, 12, 18].map((h) => (
            <span key={h}>{h} Uhr</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function GoalTile({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
      <Icon className="size-5 shrink-0 text-muted max-sm:hidden" strokeWidth={1.75} />
      <span className="flex min-w-0 flex-col">
        <span className="text-xl font-semibold tabular-nums">{numberFormat.format(value)}</span>
        <span className="truncate text-sm text-muted">{label}</span>
      </span>
    </div>
  );
}

/** Change of a rate in percentage points. */
function PointChange({ value }: { value: number }) {
  if (value === 0) return <span>wie im Zeitraum davor</span>;
  const up = value > 0;
  return (
    <span className={cn("flex items-center gap-1.5 font-medium", up ? "text-success" : "text-danger")}>
      {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
      {up ? "+" : "−"}
      {Math.abs(value).toLocaleString("de-DE")} Prozentpunkte
    </span>
  );
}

function Kpi({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1.5 p-5">
      <span className="text-[15px] text-muted">{label}</span>
      <span className="text-3xl font-semibold tracking-tight">{value}</span>
      {children}
    </Card>
  );
}

function Change({ value, inline }: { value: number; inline?: boolean }) {
  if (value === 0) return <span className="text-sm text-muted">{inline ? "gleich" : "wie im Zeitraum davor"}</span>;
  const up = value > 0;
  return (
    <span className={cn("items-center gap-1.5 text-sm font-medium", inline ? "inline-flex" : "flex", up ? "text-success" : "text-danger")}>
      {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
      {up ? "+" : "−"}
      {Math.abs(value)} %{!inline && " zum Zeitraum davor"}
    </span>
  );
}

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const requested = Number((await searchParams).days);
  const days = RANGES.includes(requested) ? requested : 30;
  const [a, settings, pages] = await Promise.all([getAnalytics(days), getSettings(), getPages()]);
  const titles = new Map(pages.map((p) => [p.path, p.title]));
  const pageLabel = (path: string) => titles.get(path) ?? path;
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
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Kpi label="Besucher" value={numberFormat.format(a.visitors)}>
          {a.personal && a.returning > 0 ? (
            <span className="text-sm text-muted">davon {numberFormat.format(a.returning)} wiederkehrend</span>
          ) : (
            <Change value={a.visitorsChange} />
          )}
        </Kpi>
        <Kpi label="Seitenaufrufe" value={numberFormat.format(a.views)}>
          <span className="text-sm text-muted">
            {a.viewsPerVisit.toLocaleString("de-DE")} pro Besuch · <Change value={a.viewsChange} inline />
          </span>
        </Kpi>
        <Kpi label="Absprungrate" value={`${a.bounceRate} %`}>
          <span className="text-sm text-muted">Besuche mit nur einer Seite</span>
        </Kpi>
        <Kpi label="Ø Besuchsdauer" value={formatDuration(a.avgDuration)}>
          <Change value={a.durationChange} />
        </Kpi>
        <Kpi label="Gerade auf der Website" value={numberFormat.format(a.live)}>
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <Radio className={cn("size-4", a.live > 0 && "text-success")} />
            Besucher der letzten 5 Minuten
          </span>
        </Kpi>
      </div>

      <VisitorsCard days={days} data={a.series.map((d) => ({ date: d.day, value: d.visitors }))} />

      {/* Goals and peak times */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Anfragen" description="Besuche mit Formular, Anruf oder E-Mail" />
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <span className="flex flex-col gap-1">
                <span className="text-[15px] text-muted">Kontaktquote</span>
                <span className="text-3xl font-semibold tracking-tight">{a.contactRate.toLocaleString("de-DE")} %</span>
              </span>
              <span className="flex flex-col gap-1 pb-1 text-sm text-muted">
                <span>
                  {numberFormat.format(a.contacts)} von {numberFormat.format(a.visits)} Besuchen
                </span>
                <PointChange value={a.contactRateChange} />
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <GoalTile icon={FileText} label="Formulare" value={a.forms} />
              <GoalTile icon={Phone} label="Anrufe" value={a.eventTotals.tel} />
              <GoalTile icon={Mail} label="E-Mails" value={a.eventTotals.mailto} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-medium">Woher die Anfragen kommen</span>
              <BarList items={a.contactChannels.map((c) => ({ label: c.channel, value: c.visits }))} valueLabel="Besuche" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Spitzenzeiten" description={peakSummary(a.peaks)} />
          <CardContent>
            <PeakHeatmap grid={a.peaks} />
          </CardContent>
        </Card>
      </div>

      {/* Breakdowns */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <BreakdownCard
          title="Seiten"
          tabs={[
            {
              key: "top",
              label: "Beliebt",
              valueLabel: "Aufrufe",
              items: a.pages.map((p) => ({
                label: pageLabel(p.path),
                hint: p.avgSeconds != null ? `Ø ${formatDuration(p.avgSeconds)}` : undefined,
                value: p.views,
              })),
            },
            { key: "entry", label: "Einstieg", valueLabel: "Besuche", items: a.entries.map((p) => ({ label: pageLabel(p.path), value: p.visits })) },
            { key: "exit", label: "Ausstieg", valueLabel: "Besuche", items: a.exits.map((p) => ({ label: pageLabel(p.path), value: p.visits })) },
          ]}
        />
        <BreakdownCard
          title="Herkunft"
          tabs={[
            { key: "channels", label: "Kanäle", valueLabel: "Besucher", items: a.channels.map((c) => ({ label: c.channel, value: c.visitors })) },
            { key: "sites", label: "Websites", valueLabel: "Besucher", items: a.referrers.map((r) => ({ label: r.source, value: r.visitors })) },
            {
              key: "campaigns",
              label: "Kampagnen",
              valueLabel: "Besucher",
              items: a.campaigns.map((c) => ({
                label: c.campaign ?? c.source ?? "",
                hint: [c.campaign ? c.source : null, c.medium].filter(Boolean).join(" · ") || undefined,
                value: c.visitors,
              })),
            },
          ]}
        />
        <BreakdownCard
          title="Standort"
          tabs={[
            { key: "countries", label: "Länder", valueLabel: "Besucher", items: a.countries.map((c) => ({ label: countryName(c.country), value: c.visitors })) },
            { key: "languages", label: "Sprachen", valueLabel: "Besucher", items: a.languages.map((l) => ({ label: languageName(l.language), value: l.visitors })) },
          ]}
        />
        <BreakdownCard
          title="Technik"
          tabs={[
            {
              key: "devices",
              label: "Geräte",
              valueLabel: "Besucher",
              items: [...a.devices]
                .sort((x, y) => y.visitors - x.visitors)
                .map((d) => ({ label: deviceLabels[d.device] ?? d.device, hint: `${d.share} %`, value: d.visitors })),
            },
            { key: "os", label: "Systeme", valueLabel: "Besucher", items: a.systems.map((s) => ({ label: s.os, value: s.visitors })) },
            { key: "browsers", label: "Browser", valueLabel: "Besucher", items: a.browsers.map((b) => ({ label: b.browser, value: b.visitors })) },
          ]}
        />
      </div>

      {/* Clicks */}
      <Card className="mt-6">
        <CardHeader title="Kontakt und Klicks" description="Klicks auf Telefonnummern, E-Mail-Adressen, Downloads und Links zu anderen Websites" />
        <CardContent className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(Object.keys(eventLabels) as (keyof typeof eventLabels)[]).map((kind) => {
              const Icon = eventLabels[kind].icon;
              return (
                <div key={kind} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                  <Icon className="size-5 shrink-0 text-muted" strokeWidth={1.75} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xl font-semibold tabular-nums">{numberFormat.format(a.eventTotals[kind])}</span>
                    <span className="truncate text-sm text-muted">{eventLabels[kind].label}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <BarList
            items={a.events.map((e) => ({ label: eventTarget(e.kind, e.target), hint: eventLabels[e.kind].short, value: e.clicks }))}
            valueLabel="Klicks"
          />
        </CardContent>
      </Card>

      {a.personal && (
        <Card className="mt-6">
          <CardHeader title="Letzte Besuche" description="Die 50 neuesten Besuche im Zeitraum" />
          <CardContent className="overflow-x-auto px-0 pb-2">
            {a.recent.length === 0 ? (
              <p className="py-6 text-center text-[15px] text-muted">Noch keine Daten im Zeitraum</p>
            ) : (
              <table className="w-full min-w-[900px] text-left text-[15px]">
                <thead>
                  <tr className="text-sm text-muted">
                    {["Zeit", "IP-Adresse", "Land", "Gerät", "Herkunft", "Einstieg", "Seiten", "Dauer"].map((h) => (
                      <th key={h} className="h-11 border-b border-border px-4 font-medium first:pl-6 last:pr-6">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.recent.map((v) => (
                    <tr key={v.session} className="transition-colors hover:bg-subtle/40">
                      <td className="border-b border-border px-4 py-3 pl-6 whitespace-nowrap">
                        <span className="flex flex-col">
                          {dateTime.format(new Date(v.start))}
                          <span className="text-sm text-muted">{v.returning ? "Wiederkehrend" : "Neu"}</span>
                        </span>
                      </td>
                      <td className="border-b border-border px-4 py-3 font-mono text-sm">{v.ip ?? "–"}</td>
                      <td className="border-b border-border px-4 py-3">{v.country ? countryName(v.country) : "–"}</td>
                      <td className="border-b border-border px-4 py-3">
                        <span className="flex flex-col">
                          {deviceLabels[v.device] ?? v.device}
                          <span className="text-sm text-muted">{[v.os, v.browser].filter(Boolean).join(" · ")}</span>
                        </span>
                      </td>
                      <td className="border-b border-border px-4 py-3">{v.referrer ?? "Direkt"}</td>
                      <td className="max-w-56 truncate border-b border-border px-4 py-3" title={v.entry}>
                        {pageLabel(v.entry)}
                      </td>
                      <td className="border-b border-border px-4 py-3 tabular-nums">{v.pages}</td>
                      <td className="border-b border-border px-4 py-3 pr-6 tabular-nums">{formatDuration(v.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Privacy note */}
      <Card className="mt-6 flex flex-wrap items-center gap-5 p-6">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl",
            a.personal ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
          )}
        >
          {a.personal ? <UserSearch className="size-6" strokeWidth={1.75} /> : <ShieldCheck className="size-6" strokeWidth={1.75} />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {a.personal ? (
            <>
              <span className="flex flex-wrap items-center gap-2 text-base font-semibold">
                Personenbezogene Statistik ohne Cookies
                <Badge tone="warning">Einwilligung nötig</Badge>
              </span>
              <span className="text-[15px] text-muted">
                Gespeichert werden IP-Adresse, Browser-Kennung, Land, Sprache, Herkunft, besuchte Seiten, Verweildauer und Klicks.
                Wiederkehrende Besucher werden auf dem Server über IP und Browser erkannt, im Browser wird nichts gespeichert. Nur
                zulässig, wenn die Besucher eingewilligt haben.
              </span>
            </>
          ) : (
            <>
              <span className="flex flex-wrap items-center gap-2 text-base font-semibold">
                Ohne Cookies, ohne gespeicherte IP-Adressen
                <Badge tone="success">Kein Cookie-Banner nötig</Badge>
              </span>
              <span className="text-[15px] text-muted">
                Gespeichert werden Seite, Herkunft, Land, Sprache, Gerät, Verweildauer und Klicks. Besucher werden über einen anonymen
                Schlüssel gezählt, dessen Zufallswert jeden Tag neu erzeugt und danach gelöscht wird. Browser mit „Do Not Track“ und die
                Vorschau im CMS werden nicht gezählt.
              </span>
            </>
          )}
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
              Inhalt: Pfad, Suchparameter, Referrer, Bildschirmbreite und Zeitzone als JSON. Die Variablen <code className="font-mono text-sm">PUBLIC_KERN_URL</code> und{" "}
              <code className="font-mono text-sm">PUBLIC_KERN_SITE</code> in der <code className="font-mono text-sm">.env</code> der Website
              legen Adresse und Website fest.
            </p>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}

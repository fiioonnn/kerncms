import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChartLine, FileText, Mail, Phone, ShieldCheck, UserSearch } from "lucide-react";
import { VisitorsChart } from "@/components/charts/visitors-chart";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/display";
import { numberFormat } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import type { AnalyticsSummary } from "@/server/analytics";
import { BreakdownCard } from "./breakdown-card";
import { RangeControl } from "./range-control";

const deviceLabels: Record<string, string> = { desktop: "Computer", mobile: "Smartphone", tablet: "Tablet" };
const regionNames = new Intl.DisplayNames(["de"], { type: "region" });
const dateTime = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function countryName(code: string) {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} Sek.`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}:${String(s).padStart(2, "0")} Min.` : `${m} Min.`;
}

function linkLabel(kind: string, target: string) {
  if (kind === "tel" || kind === "mailto") return target.replace(/^(tel|mailto):/, "");
  try {
    const url = new URL(target);
    return kind === "download" ? decodeURIComponent(url.pathname.split("/").pop() || target) : url.hostname.replace(/^www\./, "");
  } catch {
    return target;
  }
}

/* ---------- Pieces ---------- */

/** Small arrow with the change against the period before; neutral when nothing changed. */
function Trend({ value, days }: { value: number | null; days: number }) {
  if (value === null) return null;
  const title = `Im Vergleich zu den ${days} Tagen davor`;
  if (value === 0) return <span className="text-sm text-muted" title={title}>±0 %</span>;
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span title={title} className={cn("inline-flex items-center gap-0.5 text-sm font-medium", up ? "text-success" : "text-danger")}>
      <Icon className="size-4" />
      {Math.abs(value)} %
    </span>
  );
}

function Metric({ label, value, note, help }: { label: string; value: string; note?: React.ReactNode; help: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-5 py-4" title={help}>
      <span className="truncate text-sm text-muted">{label}</span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
        {note}
      </span>
    </div>
  );
}

function ContactTile({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-subtle/60 px-2 py-3 text-center">
      <Icon className="size-5 text-muted" strokeWidth={1.75} />
      <span className="text-xl font-semibold tabular-nums">{numberFormat.format(value)}</span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}

function peakSummary(grid: number[][]) {
  let best = { day: 0, hour: 0, views: 0 };
  grid.forEach((hours, day) => hours.forEach((views, hour) => views > best.views && (best = { day, hour, views })));
  if (!best.views) return null;
  return `Am meisten los: ${WEEKDAYS[best.day]} zwischen ${best.hour} und ${best.hour + 1} Uhr.`;
}

/** Weekday × hour grid of page views (German time); stronger tint = more views. */
function PeakHeatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="flex flex-col gap-1" role="img" aria-label="Seitenaufrufe nach Wochentag und Uhrzeit">
      {grid.map((hours, day) => (
        <div key={day} className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-xs text-muted">{WEEKDAYS[day].slice(0, 2)}</span>
          <div className="grid h-4 flex-1 grid-cols-24 gap-[2px]">
            {hours.map((views, hour) => (
              <span
                key={hour}
                title={`${WEEKDAYS[day]}, ${hour}–${hour + 1} Uhr: ${numberFormat.format(views)} Aufrufe`}
                className="rounded-[2px] bg-subtle"
                style={views ? { backgroundColor: `color-mix(in oklab, var(--color-accent) ${15 + Math.round((views / max) * 85)}%, transparent)` } : undefined}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-0.5">
        <span className="w-6 shrink-0" />
        <div className="grid flex-1 grid-cols-4 text-xs text-muted">
          {[0, 6, 12, 18].map((h) => (
            <span key={h}>{h} Uhr</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export function AnalyticsView({
  a,
  days,
  enabled,
  canManage,
  siteKey,
  titles,
  google,
}: {
  a: AnalyticsSummary;
  days: number;
  enabled: boolean;
  canManage: boolean;
  siteKey: string;
  /** Page path → page title, so customers see "Kontakt" instead of "/kontakt". */
  titles: Map<string, string>;
  /** Google cards (PageSpeed, Maps position); they stream in on their own. */
  google?: React.ReactNode;
}) {
  const pageLabel = (path: string) => titles.get(path) ?? path;
  const empty = a.views === 0;
  const peak = peakSummary(a.peaks);
  const otherClicks = a.events.filter((e) => e.kind === "download" || e.kind === "outbound");

  return (
    <PageContainer>
      <PageHeader
        title="Statistiken"
        description="Wie viele Menschen deine Website besuchen und was sie dort tun."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {a.live > 0 && (
              <span className="flex items-center gap-2 text-sm text-muted" title="Besucher der letzten 5 Minuten">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-success" />
                </span>
                {a.live === 1 ? "1 Besucher gerade online" : `${numberFormat.format(a.live)} Besucher gerade online`}
              </span>
            )}
            <RangeControl days={days} />
          </div>
        }
      />

      {!enabled && (
        <Card className="mb-5 flex flex-wrap items-center gap-4 border-warning/40 px-5 py-4">
          <span className="min-w-0 flex-1 text-[15px]">Die Statistik ist ausgeschaltet. Neue Besuche werden nicht gezählt.</span>
          {canManage && (
            <Link href="/settings" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Einschalten
            </Link>
          )}
        </Card>
      )}

      {empty ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-subtle text-muted">
            <ChartLine className="size-6" strokeWidth={1.75} />
          </span>
          <h2 className="text-lg font-semibold">Noch keine Besuche in den letzten {days} Tagen</h2>
          <p className="max-w-md text-[15px] text-muted">
            Sobald jemand deine Website öffnet, erscheinen hier die Zahlen. Das dauert nach dem Veröffentlichen meist nur wenige
            Minuten.
          </p>
          <p className="max-w-md text-sm text-muted">
            Für Entwickler: Die Website meldet Aufrufe an{" "}
            <code className="font-mono text-xs break-all">POST /api/public/{siteKey}/collect</code>.
          </p>
        </Card>
      ) : (
        <>
          {/* Overview: the four numbers that matter and the trend */}
          <Card>
            <div className="grid grid-cols-2 divide-border border-b border-border lg:grid-cols-4 lg:divide-x max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(odd)]:border-r">
              <Metric
                label="Besucher"
                value={numberFormat.format(a.visitors)}
                note={<Trend value={a.visitorsChange} days={days} />}
                help="Verschiedene Personen, die deine Website geöffnet haben"
              />
              <Metric
                label="Seitenaufrufe"
                value={numberFormat.format(a.views)}
                note={<Trend value={a.viewsChange} days={days} />}
                help="Wie oft Seiten insgesamt geöffnet wurden"
              />
              <Metric
                label="Verweildauer"
                value={formatDuration(a.avgDuration)}
                note={<Trend value={a.durationChange} days={days} />}
                help="So lange bleibt ein Besuch im Durchschnitt auf der Website"
              />
              <Metric
                label="Anfragen"
                value={numberFormat.format(a.contacts)}
                note={a.visits > 0 && <span className="text-sm text-muted">{a.contactRate.toLocaleString("de-DE")} % der Besuche</span>}
                help="Besuche, bei denen jemand ein Formular geschickt, angerufen oder eine E-Mail geschrieben hat"
              />
            </div>
            <div className="px-5 pt-4 pb-5">
              <VisitorsChart height={180} data={a.series.map((d) => ({ date: d.day, value: d.visitors }))} label={`Besucher pro Tag, letzte ${days} Tage`} />
            </div>
          </Card>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <BreakdownCard
              title="Was wird angesehen?"
              tabs={[{ key: "pages", label: "Seiten", valueLabel: "Aufrufe", items: a.pages.map((p) => ({ label: pageLabel(p.path), value: p.views })) }]}
            />
            <BreakdownCard
              title="Woher kommen die Besucher?"
              tabs={[
                { key: "channels", label: "Überblick", valueLabel: "Besucher", items: a.channels.map((c) => ({ label: c.channel, value: c.visitors })) },
                {
                  key: "sites",
                  label: "Websites",
                  valueLabel: "Besucher",
                  items: a.referrers.filter((r) => r.source !== "Direkt").map((r) => ({ label: r.source, value: r.visitors })),
                },
                {
                  key: "campaigns",
                  label: "Kampagnen",
                  valueLabel: "Besucher",
                  items: a.campaigns.map((c) => ({ label: c.campaign ?? c.source ?? "", hint: c.campaign ? (c.source ?? undefined) : undefined, value: c.visitors })),
                },
              ]}
            />

            {/* Contacts */}
            <Card className="flex flex-col gap-4 px-5 py-4">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-base font-semibold">Wer hat Kontakt aufgenommen?</h2>
                <p className="text-sm text-muted">
                  {a.contacts === 0
                    ? "Noch keine Anfragen im Zeitraum."
                    : a.contactChannels[0]
                      ? `Die meisten Anfragen kamen über: ${a.contactChannels[0].channel}.`
                      : `${numberFormat.format(a.contacts)} Besuche mit Anfrage.`}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <ContactTile icon={FileText} label="Formulare" value={a.forms} />
                <ContactTile icon={Phone} label="Anrufe" value={a.eventTotals.tel} />
                <ContactTile icon={Mail} label="E-Mails" value={a.eventTotals.mailto} />
              </div>
              {otherClicks.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                  <span className="text-sm font-medium">Außerdem angeklickt</span>
                  <ul className="flex flex-col gap-1 text-[15px]">
                    {otherClicks.slice(0, 4).map((e) => (
                      <li key={e.kind + e.target} className="flex items-center justify-between gap-4">
                        <span className="min-w-0 truncate">
                          {linkLabel(e.kind, e.target)}{" "}
                          <span className="text-sm text-muted">{e.kind === "download" ? "Download" : "Link"}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">{numberFormat.format(e.clicks)}×</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <BreakdownCard
              title="Wer sind die Besucher?"
              tabs={[
                {
                  key: "devices",
                  label: "Geräte",
                  valueLabel: "Besucher",
                  items: [...a.devices]
                    .sort((x, y) => y.visitors - x.visitors)
                    .map((d) => ({ label: deviceLabels[d.device] ?? d.device, hint: `${d.share} %`, value: d.visitors })),
                },
                { key: "countries", label: "Länder", valueLabel: "Besucher", items: a.countries.map((c) => ({ label: countryName(c.country), value: c.visitors })) },
                { key: "browsers", label: "Browser", valueLabel: "Besucher", items: a.browsers.map((b) => ({ label: b.browser, value: b.visitors })) },
              ]}
            />

            {/* Peak times */}
            <Card className={cn("flex flex-col gap-4 px-5 py-4", !a.personal && "lg:col-span-2")}>
              <div className="flex flex-col gap-0.5">
                <h2 className="text-base font-semibold">Wann ist am meisten los?</h2>
                <p className="text-sm text-muted">{peak ?? "Noch zu wenig Daten."}</p>
              </div>
              <PeakHeatmap grid={a.peaks} />
            </Card>

            {a.personal && (
              <Card className="flex flex-col py-4">
                <div className="flex flex-col gap-0.5 px-5 pb-3">
                  <h2 className="text-base font-semibold">Letzte Besuche</h2>
                  <p className="text-sm text-muted">
                    {a.returning > 0 ? `${numberFormat.format(a.returning)} Besucher kamen im Zeitraum wieder.` : "Die neuesten Besuche im Zeitraum."}
                  </p>
                </div>
                <ul className="flex flex-col">
                  {a.recent.slice(0, 6).map((v) => (
                    <li key={v.session} className="flex items-center justify-between gap-4 border-t border-border px-5 py-2.5 text-[15px]">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">
                          {pageLabel(v.entry)}
                          {v.pages > 1 && <span className="text-muted"> + {v.pages - 1} weitere</span>}
                        </span>
                        <span className="truncate text-sm text-muted">
                          {[v.country && countryName(v.country), deviceLabels[v.device] ?? v.device, v.referrer ?? "Direkt", v.ip].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end text-sm text-muted">
                        <span>{dateTime.format(new Date(v.start))}</span>
                        <span>{v.returning ? "Wiederkehrend" : "Neu"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </>
      )}

      {google}

      {/* Privacy, one line */}
      <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        {a.personal ? <UserSearch className="size-4" /> : <ShieldCheck className="size-4 text-success" />}
        {a.personal
          ? "Ohne Cookies. Personenbezogene Statistik ist an: IP-Adressen werden gespeichert."
          : "Ohne Cookies und ohne gespeicherte IP-Adressen, kein Cookie-Banner nötig."}
        {canManage && (
          <Link href="/settings" className="font-medium text-foreground underline-offset-4 hover:underline">
            Einstellungen
          </Link>
        )}
      </p>
    </PageContainer>
  );
}

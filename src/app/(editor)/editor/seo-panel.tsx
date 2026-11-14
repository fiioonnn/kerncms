"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, CircleAlert, CircleCheck, CircleDashed, Loader2, RotateCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { SEO_GROUPS, matchesPhrase, scoreSeo, scoreTone, type SeoCheck, type SeoFacts, type SeoStatus, type SeoTarget } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { analyzeSeo, saveSeoKeyword, searchPerformance, type SearchResult } from "@/server/actions/seo";

/** Re-analysis after a change waits this long, so the preview has rebuilt the page. */
const ANALYZE_DELAY = 1200;

/**
 * SEO score of the open page: analyzes the rendered preview whenever `refresh` is called (after a
 * draft write or a preview reload) and re-scores instantly when the focus keyword changes.
 */
type SeoData = { name: string; facts: SeoFacts | null; keyword: string; touched: boolean; error: string | null };
const emptyData = (name: string): SeoData => ({ name, facts: null, keyword: "", touched: false, error: null });

export function useSeo(name: string, canEdit: boolean) {
  const [state, setState] = useState<SeoData>(() => emptyData(name));
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef(0);
  const nameRef = useRef(name);
  // State of another page counts as empty until its own analysis arrives.
  const current = state.name === name ? state : emptyData(name);
  const forPage = (prev: SeoData, target: string) => (prev.name === target ? prev : emptyData(target));

  const analyze = useCallback(async () => {
    const id = ++request.current;
    const target = nameRef.current;
    setLoading(true);
    const result = await analyzeSeo(target);
    if (id !== request.current) return;
    setLoading(false);
    setState((prev) => {
      const base = forPage(prev, target);
      if (!result.ok) return { ...base, error: result.error };
      // The stored keyword, unless it was edited in the meantime.
      return { ...base, facts: result.data.facts, error: null, keyword: base.touched ? base.keyword : result.data.keyword };
    });
  }, []);

  /** Schedules an analysis; calls in quick succession run it once. `now` skips the wait. */
  const refresh = useCallback(
    (now = false) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void analyze(), now ? 0 : ANALYZE_DELAY);
    },
    [analyze],
  );

  // Another page: forget pending work of the previous one.
  useEffect(() => {
    nameRef.current = name;
    request.current += 1;
    return () => {
      clearTimeout(timer.current);
      clearTimeout(saveTimer.current);
    };
  }, [name]);

  const setKeyword = (value: string) => {
    setState((prev) => ({ ...forPage(prev, name), keyword: value, touched: true }));
    if (!canEdit) return;
    clearTimeout(saveTimer.current);
    const target = name;
    saveTimer.current = setTimeout(() => {
      void saveSeoKeyword(target, value).then((result) => {
        if (!result.ok) toast.error("Suchphrase nicht gespeichert", { description: result.error });
      });
    }, 600);
  };

  const { facts, keyword, error } = current;
  const report = useMemo(() => (facts ? scoreSeo(facts, keyword) : null), [facts, keyword]);
  return { facts, report, keyword, setKeyword, error, loading, refresh };
}

export type SeoState = ReturnType<typeof useSeo>;

const toneText: Record<SeoStatus, string> = { good: "text-success", improve: "text-warning", problem: "text-danger" };
const toneSoft: Record<SeoStatus, string> = { good: "bg-success-soft text-success", improve: "bg-warning-soft text-warning", problem: "bg-danger-soft text-danger" };
const toneStroke: Record<SeoStatus, string> = { good: "stroke-success", improve: "stroke-warning", problem: "stroke-danger" };

/** Small score pill for the sidebar tab. */
export function SeoScoreBadge({ seo }: { seo: SeoState }) {
  if (!seo.report) return seo.loading ? <Loader2 className="size-3.5 animate-spin text-muted" /> : null;
  const tone = scoreTone(seo.report.score);
  return <span className={cn("rounded-full px-2 text-xs leading-5 font-semibold tabular-nums", toneSoft[tone])}>{seo.report.score}</span>;
}

function ScoreRing({ score }: { score: number }) {
  const tone = scoreTone(score);
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-subtle" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          className={cn("transition-[stroke-dashoffset] duration-500", toneStroke[tone])}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums">{score}</span>
    </div>
  );
}

const StatusIcon = ({ status }: { status: SeoStatus }) => {
  const Icon = status === "good" ? CircleCheck : status === "improve" ? CircleDashed : CircleAlert;
  return <Icon className={cn("mt-0.5 size-[18px] shrink-0", toneText[status])} strokeWidth={2} />;
};

function CheckRow({ check, onTarget }: { check: SeoCheck; onTarget: (target: SeoTarget) => void }) {
  const body = (
    <>
      <StatusIcon status={check.status} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">{check.title}</span>
        <span className="text-sm leading-snug text-muted">{check.detail}</span>
      </span>
      {check.target && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted" />}
    </>
  );
  const className = "-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2.5 text-left";
  if (!check.target) return <div className={className}>{body}</div>;
  return (
    <button
      type="button"
      onClick={() => onTarget(check.target!)}
      className={cn(className, "transition-colors outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent")}
    >
      {body}
    </button>
  );
}

const order: Record<SeoStatus, number> = { problem: 0, improve: 1, good: 2 };

const number = (value: number, digits = 0) => value.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits });

function Metric({ label, value, change }: { label: string; value: string; change?: { text: string; better: boolean } | null }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border px-3 py-2.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      {change && (
        <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", change.better ? "text-success" : "text-danger")}>
          {change.better ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
          {change.text}
        </span>
      )}
    </div>
  );
}

function GoogleSection({ name, keyword, canEdit, onUseKeyword }: { name: string; keyword: string; canEdit: boolean; onUseKeyword: (value: string) => void }) {
  const [result, setResult] = useState<{ name: string; data: SearchResult | null; error: string | null } | null>(null);

  useEffect(() => {
    let stale = false;
    void searchPerformance(name).then((r) => {
      if (!stale) setResult({ name, data: r.ok ? r.data : null, error: r.ok ? null : r.error });
    });
    return () => {
      stale = true;
    };
  }, [name]);

  const current = result?.name === name ? result : null;
  let content: React.ReactNode;
  if (!current) {
    content = (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" />
        Daten von Google werden geladen…
      </p>
    );
  } else if (current.error || !current.data) {
    content = <p className="text-sm text-danger">{current.error ?? "Die Daten konnten nicht geladen werden."}</p>;
  } else if (current.data.state === "off") {
    content = <p className="text-sm text-muted">Die Google Search Console ist nicht verbunden. Ein App-Admin kann sie im Admin unter „SEO“ einrichten.</p>;
  } else if (current.data.state === "no-url") {
    content = <p className="text-sm text-muted">Für diese Website ist keine Live-Adresse hinterlegt. Ohne sie lassen sich die Daten von Google nicht zuordnen.</p>;
  } else if (current.data.state === "no-property") {
    content = (
      <p className="text-sm text-muted">
        Für die Live-Adresse gibt es keine freigegebene Property. Füge in der Search Console unter Einstellungen → Nutzer und Berechtigungen{" "}
        <span className="font-mono text-foreground select-all">{current.data.email}</span> als Nutzer hinzu.
      </p>
    );
  } else {
    const { data } = current.data;
    if (!data.current) {
      content = <p className="text-sm text-muted">Google hat diese Seite in den letzten 28 Tagen in keinem Suchergebnis gezeigt.</p>;
    } else {
      const now = data.current;
      const before = data.previous;
      const posDelta = before ? before.position - now.position : 0;
      const clickDelta = before && before.clicks > 0 ? ((now.clicks - before.clicks) * 100) / before.clicks : null;
      content = (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <Metric
              label="Ø Position"
              value={number(now.position, 1)}
              change={before && Math.abs(posDelta) >= 0.1 ? { text: `${number(Math.abs(posDelta), 1)} Plätze`, better: posDelta > 0 } : null}
            />
            <Metric
              label="Klicks"
              value={number(now.clicks)}
              change={clickDelta !== null && Math.round(clickDelta) !== 0 ? { text: `${number(Math.abs(clickDelta))} %`, better: clickDelta > 0 } : null}
            />
            <Metric label="Impressionen" value={number(now.impressions)} />
            <Metric label="Klickrate" value={`${number(now.ctr * 100, 1)} %`} />
          </div>
          {data.queries.length > 0 && (
            <div className="flex flex-col">
              <div className="flex items-center justify-between pb-1 text-xs font-medium text-muted">
                <span>Suchbegriff</span>
                <span>Position · Klicks</span>
              </div>
              {data.queries.map((q) => {
                const isFocus = keyword.trim() !== "" && matchesPhrase(q.query, keyword) && matchesPhrase(keyword, q.query);
                const row = (
                  <>
                    <span className={cn("min-w-0 flex-1 truncate", isFocus && "font-semibold text-accent")}>{q.query}</span>
                    <span className="shrink-0 text-muted tabular-nums">
                      {number(q.position, 1)} · {number(q.clicks)}
                    </span>
                  </>
                );
                return canEdit ? (
                  <Tooltip key={q.query} label={`${number(q.impressions)} Impressionen. Klicken, um es als Fokus-Suchphrase zu nehmen.`}>
                    <button
                      type="button"
                      onClick={() => onUseKeyword(q.query)}
                      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {row}
                    </button>
                  </Tooltip>
                ) : (
                  <div key={q.query} className="flex items-center gap-3 py-1.5 text-sm">
                    {row}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }
  }

  const range = current?.data?.state === "ok" ? current.data.data.range : null;
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-lg font-semibold tracking-tight">Google</h3>
        <span className="text-sm text-muted">
          Live-Seite{range ? `, ${new Date(range.start).toLocaleDateString("de-DE")} bis ${new Date(range.end).toLocaleDateString("de-DE")}` : ", letzte 28 Tage"}
        </span>
      </div>
      {content}
    </section>
  );
}

/** The SEO tab: score, focus keyword, checks and Google figures. */
export function SeoPanel({
  seo,
  name,
  canEdit,
  onTarget,
}: {
  seo: SeoState;
  name: string;
  canEdit: boolean;
  onTarget: (target: SeoTarget) => void;
}) {
  const keywordRef = useRef<HTMLInputElement>(null);
  const report = seo.report;
  const groups = useMemo(() => {
    if (!report) return [];
    return (Object.keys(SEO_GROUPS) as SeoCheck["group"][])
      .map((group) => ({ group, checks: report.checks.filter((c) => c.group === group).sort((a, b) => order[a.status] - order[b.status]) }))
      .filter((g) => g.checks.length > 0);
  }, [report]);
  const open = report?.checks.filter((c) => c.status !== "good").length ?? 0;

  const target = (t: SeoTarget) => {
    if (t.kind === "keyword") keywordRef.current?.focus();
    else onTarget(t);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
      <div className="flex items-center gap-4">
        {report ? <ScoreRing score={report.score} /> : <div className="size-16 shrink-0 animate-pulse rounded-full bg-subtle" />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-lg font-semibold tracking-tight">SEO-Bewertung</h2>
          <span className="text-sm text-muted">
            {seo.error ? "Analyse fehlgeschlagen" : !report ? "Seite wird analysiert…" : open === 0 ? "Alles erledigt." : `${open} ${open === 1 ? "Punkt" : "Punkte"} zu verbessern`}
          </span>
        </div>
        <Tooltip label="Neu analysieren">
          <Button variant="ghost" size="icon" className="size-9 shrink-0 rounded-lg" aria-label="Neu analysieren" disabled={seo.loading} onClick={() => seo.refresh(true)}>
            {seo.loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
          </Button>
        </Tooltip>
      </div>

      {seo.error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{seo.error}</p>}
      {seo.facts && seo.facts.status >= 400 && (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">Die Vorschau antwortet für diese Seite mit Fehler {seo.facts.status}. Die Bewertung ist deshalb nicht aussagekräftig.</p>
      )}

      <Field>
        <Label>Fokus-Suchphrase</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input ref={keywordRef} value={seo.keyword} onChange={(e) => seo.setKeyword(e.target.value)} disabled={!canEdit} className="pl-9" maxLength={100} />
        </div>
        <Description>Der Begriff, unter dem die Seite bei Google gefunden werden soll. Wird nur in kerncms gespeichert.</Description>
      </Field>

      {groups.map(({ group, checks }) => (
        <section key={group} className="flex flex-col gap-1">
          <h3 className="pb-1 text-xs font-semibold tracking-wider text-muted uppercase">{SEO_GROUPS[group]}</h3>
          {checks.map((check) => (
            <CheckRow key={check.id} check={check} onTarget={target} />
          ))}
        </section>
      ))}
      {report && !seo.keyword.trim() && (
        <p className="text-sm text-muted">Mit einer Fokus-Suchphrase prüft die Bewertung auch, ob Titel, Überschrift und Text dazu passen.</p>
      )}

      <GoogleSection name={name} keyword={seo.keyword} canEdit={canEdit} onUseKeyword={seo.setKeyword} />
    </div>
  );
}

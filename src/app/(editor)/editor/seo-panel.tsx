"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { ChevronRight, CircleAlert, CircleCheck, CircleDashed, Loader2, RotateCw, Search } from "lucide-react";
import { PageSpeedView, PositionsView } from "@/components/seo/google-views";
import { Button } from "@/components/ui/button";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { SEO_GROUPS, scoreSeo, scoreTone, type SeoCheck, type SeoFacts, type SeoStatus, type SeoTarget } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/server/action";
import { analyzeSeo, googlePositions, pageSpeedOf, saveSeoKeyword, type PageSpeedResult, type PositionsResult } from "@/server/actions/seo";

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

/** Calls a server action when `key` changes; drops answers that arrive after the next change. */
function useLoad<T>(key: string | null, load: (fresh: boolean) => Promise<ActionResult<T>>) {
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null } | null>(null);
  const [run, setRun] = useState({ n: 0, fresh: false });
  const call = useEffectEvent((fresh: boolean) => load(fresh));

  useEffect(() => {
    if (key === null) return;
    let stale = false;
    void call(run.fresh).then((r) => {
      if (!stale) setResult({ key, data: r.ok ? r.data : null, error: r.ok ? null : r.error });
    });
    return () => {
      stale = true;
    };
  }, [key, run]);

  const current = key !== null && result?.key === key ? result : null;
  const reload = () => {
    setResult(null);
    setRun((r) => ({ n: r.n + 1, fresh: true }));
  };
  return { current, reload };
}

function Loading({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="size-4 shrink-0 animate-spin" />
      {children}
    </p>
  );
}

function SectionHead({ title, note, action }: { title: string; note: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <span className="text-sm text-muted">{note}</span>
      </div>
      {action}
    </div>
  );
}

/** PageSpeed of the live page: scores and loading times as Google measures them. */
function SpeedSection({ name }: { name: string }) {
  const { current, reload } = useLoad<PageSpeedResult>(name, (fresh) => pageSpeedOf(name, fresh));
  let content: React.ReactNode;
  if (!current) content = <Loading>Google misst die Live-Seite. Das dauert bis zu 30 Sekunden…</Loading>;
  else if (current.error || !current.data) content = <p className="text-sm text-danger">{current.error ?? "Die Messung ist fehlgeschlagen."}</p>;
  else if (current.data.state === "off") content = <p className="text-sm text-muted">PageSpeed ist nicht eingerichtet. Dafür muss PAGESPEED_API_KEY auf dem Server gesetzt sein.</p>;
  else if (current.data.state === "no-url") content = <p className="text-sm text-muted">Für diese Website ist keine Live-Adresse hinterlegt.</p>;
  else content = <PageSpeedView data={current.data.data} columns={2} />;

  const measured = current?.data?.state === "ok" ? new Date(current.data.data.fetchedAt) : null;
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <SectionHead
        title="Ladezeit & Qualität"
        note={measured ? `Live-Seite, gemessen ${measured.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}` : "Live-Seite, gemessen von Google PageSpeed"}
        action={
          current?.data?.state === "ok" || current?.error ? (
            <Tooltip label="Neu messen">
              <Button variant="ghost" size="icon" className="size-9 shrink-0 rounded-lg" aria-label="Neu messen" onClick={reload}>
                <RotateCw className="size-4" />
              </Button>
            </Tooltip>
          ) : null
        }
      />
      {content}
    </section>
  );
}

/** Where the site shows up for the focus keyword: normal Google results and Google Maps. */
function PositionSection({ keyword }: { keyword: string }) {
  // Waits until typing stops, so not every keystroke becomes a (billed) search.
  const [phrase, setPhrase] = useState(keyword.trim());
  useEffect(() => {
    const t = setTimeout(() => setPhrase(keyword.replace(/\s+/g, " ").trim()), 1500);
    return () => clearTimeout(t);
  }, [keyword]);
  const active = phrase.length >= 2 ? phrase : null;
  const { current } = useLoad<PositionsResult>(active, () => googlePositions(phrase));

  let content: React.ReactNode;
  if (!active) content = <p className="text-sm text-muted">Trage oben eine Fokus-Suchphrase ein, z. B. „Friseur Kreuzberg“. Dann erscheint hier, auf welchem Platz die Website bei Google steht.</p>;
  else if (!current) content = <Loading>Suche bei Google…</Loading>;
  else if (current.error || !current.data) content = <p className="text-sm text-danger">{current.error ?? "Die Suche ist fehlgeschlagen."}</p>;
  else if (current.data.state === "no-url") content = <p className="text-sm text-muted">Für diese Website ist keine Live-Adresse hinterlegt. Ohne sie lässt sich die Position nicht ermitteln.</p>;
  else content = <PositionsView search={current.data.search} maps={current.data.maps} />;

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <SectionHead title="Position bei Google" note={active ? `Für „${active}“, Stand von heute` : "Für die Fokus-Suchphrase"} />
      {content}
    </section>
  );
}

/** The SEO tab: score, focus keyword, checks, Google position and PageSpeed. */
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

      <PositionSection keyword={seo.keyword} />
      <SpeedSection name={name} />
    </div>
  );
}

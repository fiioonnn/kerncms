import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapsPlace, MapsRank, PageSpeed, SearchRank, Vital } from "@/server/seo/google";

/* Shared by the editor's SEO tab and the statistics page. Plain components, no hooks. */

type Tone = "good" | "improve" | "problem";
const toneText: Record<Tone, string> = { good: "text-success", improve: "text-warning", problem: "text-danger" };
const toneSoft: Record<Tone, string> = { good: "bg-success-soft text-success", improve: "bg-warning-soft text-warning", problem: "bg-danger-soft text-danger" };

/** Lighthouse colours: 90+ green, 50–89 orange, below red. */
const scoreTone = (s: number): Tone => (s >= 90 ? "good" : s >= 50 ? "improve" : "problem");
const between = (value: number, good: number, ok: number): Tone => (value <= good ? "good" : value <= ok ? "improve" : "problem");
const categoryTone = (v: Vital, fallback: Tone): Tone => (v.category === "FAST" ? "good" : v.category === "AVERAGE" ? "improve" : v.category === "SLOW" ? "problem" : fallback);

const de = (value: number, digits = 0) => value.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const seconds = (ms: number) => `${de(ms / 1000, 1)} s`;

const SCORES = [
  { key: "performance", label: "Leistung", help: "Wie schnell die Seite lädt und reagiert" },
  { key: "seo", label: "SEO", help: "Technische Grundlagen für Suchmaschinen" },
  { key: "accessibility", label: "Barrierefreiheit", help: "Wie gut die Seite für alle Menschen nutzbar ist" },
  { key: "bestPractices", label: "Best Practices", help: "Sicherheit und moderne Technik" },
] as const;

function ScoreTile({ label, value, help }: { label: string; value: number | null; help: string }) {
  const tone = value === null ? null : scoreTone(value);
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl bg-subtle/60 px-2 py-3 text-center" title={help}>
      <span className={cn("flex size-11 items-center justify-center rounded-full text-base font-semibold tabular-nums", tone ? toneSoft[tone] : "bg-subtle text-muted")}>
        {value ?? "–"}
      </span>
      <span className="w-full truncate text-sm text-muted">{label}</span>
    </div>
  );
}

function VitalRow({ label, help, value, tone }: { label: string; help: string; value: string; tone: Tone }) {
  return (
    <li className="flex items-center justify-between gap-4 py-1.5 text-[15px]" title={help}>
      <span className="min-w-0 truncate">{label}</span>
      <span className={cn("shrink-0 font-medium tabular-nums", toneText[tone])}>{value}</span>
    </li>
  );
}

/** Scores and loading times of one PageSpeed run. Real-user values when Google has them, else the lab run. */
export function PageSpeedView({ data, columns = 4 }: { data: PageSpeed; columns?: 2 | 4 }) {
  const { field, lab } = data;
  const rows: { label: string; help: string; value: string; tone: Tone }[] = [];
  if (field) {
    if (field.lcp) rows.push({ label: "Ladezeit", help: "Bis der größte Inhalt sichtbar ist (LCP). Gut: unter 2,5 s", value: seconds(field.lcp.value), tone: categoryTone(field.lcp, between(field.lcp.value, 2500, 4000)) });
    if (field.inp) rows.push({ label: "Reaktion auf Klicks", help: "Wie schnell die Seite auf Eingaben reagiert (INP). Gut: unter 200 ms", value: `${de(field.inp.value)} ms`, tone: categoryTone(field.inp, between(field.inp.value, 200, 500)) });
    if (field.cls) rows.push({ label: "Verrutschen beim Laden", help: "Wie stark Inhalte beim Laden springen (CLS). Gut: unter 0,1", value: de(field.cls.value, 2), tone: categoryTone(field.cls, between(field.cls.value, 0.1, 0.25)) });
  } else {
    if (lab.lcp !== null) rows.push({ label: "Ladezeit", help: "Bis der größte Inhalt sichtbar ist (LCP). Gut: unter 2,5 s", value: seconds(lab.lcp), tone: between(lab.lcp, 2500, 4000) });
    if (lab.tbt !== null) rows.push({ label: "Blockiert", help: "Wie lange die Seite beim Laden nicht auf Eingaben reagiert (TBT). Gut: unter 200 ms", value: `${de(lab.tbt)} ms`, tone: between(lab.tbt, 200, 600) });
    if (lab.cls !== null) rows.push({ label: "Verrutschen beim Laden", help: "Wie stark Inhalte beim Laden springen (CLS). Gut: unter 0,1", value: de(lab.cls, 2), tone: between(lab.cls, 0.1, 0.25) });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={cn("grid gap-2", columns === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2")}>
        {SCORES.map((s) => (
          <ScoreTile key={s.key} label={s.label} value={data.scores[s.key]} help={s.help} />
        ))}
      </div>
      {rows.length > 0 && (
        <div className="flex flex-col">
          <span className="text-xs font-medium text-muted">
            {field ? (field.origin ? "Echte Besucher, ganze Website (28 Tage)" : "Echte Besucher dieser Seite (28 Tage)") : "Messung auf einem Smartphone"}
          </span>
          <ul className="flex flex-col">
            {rows.map((r) => (
              <VitalRow key={r.label} {...r} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Rating({ place }: { place: MapsPlace }) {
  if (place.rating === null) return <span className="text-sm text-muted">Noch keine Bewertungen</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm tabular-nums">
      <Star className="size-4 fill-warning text-warning" />
      <span className="font-medium">{de(place.rating, 1)}</span>
      <span className="text-muted">({de(place.reviews)} Bewertungen)</span>
    </span>
  );
}

/** Tone of a ranking: top 3 green, first page orange, further back red. */
export const rankTone = (position: number): Tone => (position <= 3 ? "good" : position <= 10 ? "improve" : "problem");
export const rankBadge = (position: number | null) => (position === null ? "bg-subtle text-muted" : toneSoft[rankTone(position)]);

type Outcome<T> = { state: "off" } | { state: "ok"; data: T } | { state: "error"; error: string };

function RankTile({ label, outcome, envName }: { label: string; outcome: Outcome<{ position: number | null; checked: number }>; envName: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-border px-3 py-2.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {outcome.state === "ok" ? (
        <>
          <span className={cn("text-2xl font-semibold tabular-nums", outcome.data.position !== null && toneText[rankTone(outcome.data.position)])}>
            {outcome.data.position === null ? "–" : `Platz ${outcome.data.position}`}
          </span>
          <span className="text-xs text-muted">{outcome.data.position === null ? `Nicht in den ersten ${outcome.data.checked || 20}` : `von ${outcome.data.checked} geprüften`}</span>
        </>
      ) : outcome.state === "off" ? (
        <span className="text-sm break-words text-muted">Nicht eingerichtet ({envName} fehlt)</span>
      ) : (
        <span className="text-sm break-words text-danger">{outcome.error.replace(/^(Google-Suche|Google Maps): /, "")}</span>
      )}
    </div>
  );
}

/** Position for one search phrase in the normal Google results and on Google Maps. */
export function PositionsView({ search, maps }: { search: Outcome<SearchRank>; maps: Outcome<MapsRank> }) {
  const s = search.state === "ok" ? search.data : null;
  const m = maps.state === "ok" ? maps.data : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <RankTile label="Google-Suche" outcome={search} envName="SERPER_API_KEY" />
        <RankTile label="Google Maps" outcome={maps} envName="GOOGLE_MAPS_API_KEY" />
      </div>
      {s?.hit && (
        <p className="text-sm text-muted">
          Google zeigt: <span className="text-foreground">{s.hit.title || s.hit.url}</span>
        </p>
      )}
      {s && s.position !== 1 && s.top.length > 0 && <p className="text-sm text-muted">In der Suche vorne: {s.top.join(", ")}</p>}
      {m?.place && <Rating place={m.place} />}
      {m && m.position !== 1 && m.top.length > 0 && (
        <p className="text-sm text-muted">Bei Maps vorne: {m.top.filter((n) => n !== m.place?.name).join(", ")}</p>
      )}
      {m && m.position === null && (
        <p className="text-sm text-muted">Bei Maps zählt der Eintrag, der auf diese Website verlinkt. Fehlt die Website im Google-Unternehmensprofil, wird er nicht gefunden.</p>
      )}
    </div>
  );
}

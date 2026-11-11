"use client";

import { useState } from "react";

export type DailyPoint = { date: string; value: number };

const W = 1000;
const H = 260;

function niceMax(max: number) {
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
}

function formatDay(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}.${m}.`;
}

/**
 * Single-series area chart (visitors per day) with a crosshair tooltip.
 * Purely presentational: it renders whatever points it gets.
 */
export function VisitorsChart({ data, label }: { data: DailyPoint[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);

  const max = niceMax(Math.max(...data.map((p) => p.value)));
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) => H - (v / max) * H;

  const line = data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(p.value)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const active = hover === null ? null : data.at(hover);
  const last = data.at(-1)!;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1)))));
  }

  return (
    <figure className="flex flex-col gap-3" aria-label={label}>
      <div className="flex gap-4">
        {/* Y axis */}
        <div className="relative w-12 shrink-0 text-right text-sm text-muted" style={{ height: H }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / max) * 100}%` }}>
              {t.toLocaleString("de-DE")}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div
          className="relative flex-1 touch-none"
          style={{ height: H }}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            {ticks.map((t) => (
              <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            <path d={area} fill="var(--color-accent)" fillOpacity={0.1} />
            <path
              d={line}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--color-border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
          </svg>

          {/* End label + marker (HTML so it keeps its shape) */}
          <span
            className="absolute size-3 -translate-1/2 rounded-full border-2 border-surface bg-accent"
            style={{ left: "100%", top: `${(y(last.value) / H) * 100}%` }}
          />

          {active && hover !== null && (
            <>
              <span
                className="pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2 border-surface bg-accent"
                style={{ left: `${(hover / (data.length - 1)) * 100}%`, top: `${(y(active.value) / H) * 100}%` }}
              />
              <div
                className="pointer-events-none absolute top-2 z-10 flex -translate-x-1/2 flex-col rounded-xl border border-border bg-surface px-4 py-2.5 shadow-popover"
                style={{ left: `clamp(70px, ${(hover / (data.length - 1)) * 100}%, calc(100% - 70px))` }}
              >
                <span className="text-sm text-muted">{formatDay(active.date)}</span>
                <span className="text-base font-semibold">{active.value.toLocaleString("de-DE")} Besucher</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* X axis */}
      <div className="ml-16 flex justify-between text-sm text-muted">
        {[0, 7, 14, 21, data.length - 1].map((i) => (
          <span key={i}>{formatDay(data[i].date)}</span>
        ))}
      </div>
    </figure>
  );
}

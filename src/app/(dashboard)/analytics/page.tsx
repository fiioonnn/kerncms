"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pie, PieChart, Cell, Area, AreaChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { useProjects } from "@/components/project-context";
import { format, startOfDay, endOfDay, subDays, isSameDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilePicker } from "@/components/file-picker";
import { DateRangePicker, type Range as DateRange } from "@/components/date-range-picker";
import { CountriesPanel } from "@/components/countries-globe";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ScreenshotPath = {
  path: string;
  hits: number;
  status: "missing" | "pending" | "ready" | "failed";
  capturedAt: string | null;
};

function ClickHeatmap({
  projectId,
  points,
  selectedPath,
  refreshSignal,
}: {
  projectId: string;
  points: { x: number; y: number; hits: number }[];
  selectedPath: string;
  refreshSignal: number;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasScreenshot, setHasScreenshot] = useState<boolean | null>(null);
  const [screenshotKey, setScreenshotKey] = useState(0);

  const encodedPath = encodeURIComponent(selectedPath || "/");
  const screenshotUrl = `/api/projects/${projectId}/analytics/screenshot?path=${encodedPath}&v=${screenshotKey}`;

  useEffect(() => {
    function trigger() {
      fetch(`/api/projects/${projectId}/analytics/screenshot/auto`, { method: "POST" }).catch(
        () => {},
      );
    }
    trigger();
    const autoId = setInterval(trigger, 60_000);
    return () => clearInterval(autoId);
  }, [projectId]);

  useEffect(() => {
    setHasScreenshot(null);
    setScreenshotKey((k) => k + 1);
  }, [selectedPath, refreshSignal]);

  function drawHeatmap() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!points.length) return;
    const maxHits = points.reduce((m, p) => Math.max(m, p.hits), 1);
    const radius = Math.max(18, Math.min(w, h) * 0.025);
    ctx.globalCompositeOperation = "lighter";
    for (const p of points) {
      const cx = (p.x / 1000) * w;
      const cy = (p.y / 1000) * h;
      const intensity = Math.min(1, p.hits / maxHits);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `rgba(255, 90, 70, ${0.7 * intensity + 0.15})`);
      grad.addColorStop(0.4, `rgba(255, 180, 70, ${0.45 * intensity + 0.05})`);
      grad.addColorStop(1, "rgba(255, 220, 100, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  useEffect(() => {
    if (hasScreenshot) drawHeatmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, hasScreenshot, screenshotKey]);

  useEffect(() => {
    function onResize() {
      if (hasScreenshot) drawHeatmap();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasScreenshot, points]);

  return (
    <>
      {hasScreenshot === false ? (
        <div
          className="flex items-center justify-center rounded-md bg-foreground/[0.02] text-xs text-muted-foreground"
          style={{ aspectRatio: "16 / 9" }}
        >
          Capturing screenshot…
        </div>
      ) : (
        <div className="relative max-h-[640px] overflow-y-auto rounded-md bg-foreground/[0.02]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={screenshotKey}
            ref={imgRef}
            src={screenshotUrl}
            alt="Site screenshot"
            className="block w-full"
            onLoad={() => {
              setHasScreenshot(true);
              drawHeatmap();
            }}
            onError={() => setHasScreenshot(false)}
          />
          <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0" />
          {points.length === 0 && hasScreenshot && (
            <div className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
              No clicks yet
            </div>
          )}
        </div>
      )}
    </>
  );
}

function InfoHint({ children }: { children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        tabIndex={0}
        aria-label="More info"
        className="inline-flex size-3.5 items-center justify-center rounded-full text-muted-foreground/70 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-full z-50 mb-1.5 w-max max-w-[260px] -translate-x-1/2 whitespace-normal rounded-md bg-foreground px-2 py-1 text-center text-xs font-normal normal-case tracking-normal text-background opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type WizardStep = "intro" | "options" | "installing";
type WizardPhase = "visible" | "out" | "in";

const INSTALL_TASKS = [
  { key: "read", label: "Reading target file" },
  { key: "inject", label: "Injecting script tag" },
  { key: "commit", label: "Committing to repository" },
  { key: "verify", label: "Waiting for first event" },
] as const;
const VERIFY_TASK_IDX = 3;

type MetricDelta = { dir: "up" | "down" | "flat"; value: string };

type Metric = {
  label: string;
  value: string;
  delta: MetricDelta;
  points: number[];
};

function spark(values: number[]) {
  return values.map((v, i) => ({ i, v }));
}

type DashboardMetric = { value: number; delta: number; points: number[] };
type DashboardData = {
  range: { from: string; to: string; bucket: "hour" | "day" | "week" };
  chartLabels: string[];
  metrics: {
    visitors: DashboardMetric;
    pageviews: DashboardMetric;
    bounceRate: DashboardMetric;
  };
  topPages: { path: string; views: number }[];
  sources: { name: string; share: number }[];
  devices: { name: string; share: number }[];
  heatmap: { x: number; y: number; hits: number }[];
  countries: { country: string; lat: number; lng: number; visitors: number }[];
};

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function buildDelta(n: number): MetricDelta {
  const abs = Math.abs(n);
  if (!isFinite(n) || abs < 0.5) return { dir: "flat", value: "" };
  return { dir: n > 0 ? "up" : "down", value: `${abs.toFixed(1)}%` };
}

function buildMetrics(d: DashboardData | null): Metric[] {
  if (!d) {
    return [
      { label: "Visitors", value: "—", delta: { dir: "flat", value: "" }, points: [] },
      { label: "Page views", value: "—", delta: { dir: "flat", value: "" }, points: [] },
      { label: "Bounce rate", value: "—", delta: { dir: "flat", value: "" }, points: [] },
    ];
  }
  return [
    {
      label: "Visitors",
      value: formatNumber(d.metrics.visitors.value),
      delta: buildDelta(d.metrics.visitors.delta),
      points: d.metrics.visitors.points,
    },
    {
      label: "Page views",
      value: formatNumber(d.metrics.pageviews.value),
      delta: buildDelta(d.metrics.pageviews.delta),
      points: d.metrics.pageviews.points,
    },
    {
      label: "Bounce rate",
      value: formatPercent(d.metrics.bounceRate.value),
      delta: buildDelta(-d.metrics.bounceRate.delta),
      points: d.metrics.bounceRate.points,
    },
  ];
}

function buildSources(d: DashboardData | null) {
  const list = d?.sources ?? [];
  return list.slice(0, 5).map((s, i) => ({
    name: s.name,
    key: `s${i}`,
    share: s.share,
    color: `var(--chart-${(i % 5) + 1})`,
  }));
}

function buildDevices(d: DashboardData | null) {
  const list = d?.devices ?? [];
  return list.slice(0, 5).map((s, i) => ({
    name: s.name,
    key: `d${i}`,
    share: s.share,
    color: `var(--chart-${(i % 5) + 1})`,
  }));
}

function formatMetricValue(label: string, raw: number): string {
  if (label === "Bounce rate") return formatPercent(raw);
  return formatNumber(raw);
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { current } = useProjects();
  const [installed, setInstalled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [step, setStep] = useState<WizardStep>("intro");
  const [phase, setPhase] = useState<WizardPhase>("visible");
  const [layoutFiles, setLayoutFiles] = useState<string[]>([]);
  const [layoutFilesLoading, setLayoutFilesLoading] = useState(false);
  const [layoutSelected, setLayoutSelected] = useState<string[]>([]);
  const [storedAppUrl, setStoredAppUrl] = useState<string | null>(null);
  const appUrl = storedAppUrl || process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const isValidAppUrl = !!appUrl && (() => { try { new URL(appUrl); return true; } catch { return false; } })();
  const [installTaskIdx, setInstallTaskIdx] = useState(0);
  const [verifyAttempts, setVerifyAttempts] = useState(0);
  const [selectedMetricIdx, setSelectedMetricIdx] = useState(0);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [section, setSection] = useState<"dashboard" | "heatmap" | "sessions">("dashboard");
  const [range, setRange] = useState<DateRange>(() => ({
    from: startOfDay(subDays(new Date(), 6)),
    to: endOfDay(new Date()),
  }));
  const [pagePath, setPagePath] = useState<string>("/");
  const [pageOptions, setPageOptions] = useState<{ path: string; hits: number }[]>([]);
  const [heatmapRefreshSignal, setHeatmapRefreshSignal] = useState(0);
  const [heatmapRefreshing, setHeatmapRefreshing] = useState(false);
  const installTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  async function refreshHeatmapScreenshot() {
    if (!current?.id) return;
    setHeatmapRefreshing(true);
    try {
      const res = await fetch(
        `/api/projects/${current.id}/analytics/screenshot?path=${encodeURIComponent(pagePath)}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error || "Screenshot failed");
        return;
      }
      setHeatmapRefreshSignal((n) => n + 1);
    } finally {
      setHeatmapRefreshing(false);
    }
  }

  useEffect(() => {
    if (!current?.id || !installed) return;
    let cancelled = false;
    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();
    function load() {
      const pathQs = pagePath ? `&path=${encodeURIComponent(pagePath)}` : "";
      fetch(`/api/projects/${current!.id}/analytics/dashboard?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}${pathQs}`)
        .then((r) => r.json())
        .then((data: DashboardData) => {
          if (!cancelled) setDashboardData(data);
        })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 3_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [current?.id, installed, range, section, pagePath]);

  useEffect(() => {
    if (!current?.id || !installed) return;
    let cancelled = false;
    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();
    fetch(`/api/projects/${current.id}/analytics/screenshot/list?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`)
      .then((r) => r.json())
      .then((data: { paths: { path: string; hits: number }[] }) => {
        if (cancelled) return;
        setPageOptions(data.paths ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current?.id, installed, range]);

  const [wasConfigured, setWasConfigured] = useState(false);
  const [verified, setVerified] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);

  useEffect(() => {
    function onChanged() {
      setSettingsVersion((v) => v + 1);
    }
    window.addEventListener("analytics-changed", onChanged);
    return () => window.removeEventListener("analytics-changed", onChanged);
  }, []);

  useEffect(() => {
    if (!current?.id) return;
    setSettingsLoading(true);
    fetch(`/api/projects/${current.id}/analytics`)
      .then((r) => r.json())
      .then((data) => {
        setInstalled(!!data.enabled && !!data.layoutFile);
        setVerified(!!data.verified);
        setWasConfigured(!!data.wasConfigured);
        setLayoutSelected(data.layoutFile ? [data.layoutFile] : []);
        setStoredAppUrl(data.appUrl || null);
      })
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, [current?.id, settingsVersion]);

  useEffect(() => {
    if (!current?.id || installed || settingsLoading || wasConfigured) return;
    let cancelled = false;
    fetch(`/api/projects/${current.id}/analytics/detect`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.detected) {
          if (data.files?.[0]) setLayoutSelected([data.files[0]]);
          setInstalled(true);
          toast.success("Analytics tracker found in your repo");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current?.id, installed, settingsLoading]);

  function transitionStep(next: WizardStep) {
    setPhase("out");
    setTimeout(() => {
      setStep(next);
      setPhase("in");
      setTimeout(() => setPhase("visible"), 150);
    }, 120);
  }

  useEffect(() => {
    if (step !== "options") return;
    if (!current?.id) return;
    setLayoutFilesLoading(true);
    fetch(`/api/projects/${current.id}/analytics/candidate-files`)
      .then((r) => r.json())
      .then((files: string[]) => {
        if (!Array.isArray(files)) {
          setLayoutFiles([]);
          return;
        }
        setLayoutFiles(files);
        setLayoutSelected((prev) => prev.filter((f) => files.includes(f)));
      })
      .catch(() => setLayoutFiles([]))
      .finally(() => setLayoutFilesLoading(false));
  }, [step, current?.id]);

  async function startInstall() {
    if (!current?.id || !layoutSelected[0]) return;
    setInstallTaskIdx(0);
    transitionStep("installing");
    installTimers.current.forEach(clearTimeout);
    installTimers.current = [];

    installTimers.current.push(setTimeout(() => setInstallTaskIdx(1), 600));
    installTimers.current.push(setTimeout(() => setInstallTaskIdx(2), 1100));

    try {
      const res = await fetch(`/api/projects/${current.id}/analytics/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: layoutSelected[0] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Install failed");
      }
      await new Promise((r) => setTimeout(r, 1300));
      setInstallTaskIdx(VERIFY_TASK_IDX);
    } catch (err) {
      installTimers.current.forEach(clearTimeout);
      toast.error(err instanceof Error ? err.message : "Install failed");
      transitionStep("options");
    }
  }

  useEffect(() => {
    return () => installTimers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (step !== "installing" || installTaskIdx !== VERIFY_TASK_IDX || !current?.id) return;
    let cancelled = false;
    setVerifyAttempts(0);
    function poll() {
      fetch(`/api/projects/${current!.id}/analytics/verify`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setVerifyAttempts((n) => n + 1);
          if (data.received) {
            setInstallTaskIdx(INSTALL_TASKS.length);
            setVerified(true);
            setTimeout(() => setInstalled(true), 350);
          }
        })
        .catch(() => {});
    }
    poll();
    const intervalId = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [step, installTaskIdx, current?.id]);

  if (!current) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Select a project to view analytics.</p>
      </div>
    );
  }

  if (settingsLoading) {
    return <div className="mx-auto w-full max-w-4xl px-6 py-10" aria-busy />;
  }

  if (!installed) {
    const wizardStyle = {
      opacity: phase === "out" ? 0 : 1,
      filter: phase === "out" ? "blur(6px)" : "blur(0px)",
      transition:
        phase === "out"
          ? "opacity 120ms ease-out, filter 120ms ease-out"
          : phase === "in"
            ? "opacity 150ms ease-out, filter 150ms ease-out"
            : "none",
    } as const;

    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center">
          <div className="w-full max-w-md" style={wizardStyle}>
            {step === "intro" && (
              <div className="flex flex-col items-center gap-4 text-center">
                <span className="text-[9px] font-medium uppercase tracking-wider rounded-full bg-foreground/10 px-2 py-0.5 text-muted-foreground">Beta</span>
                <h2 className="text-2xl font-bold font-[family-name:var(--font-averia)] tracking-tight -mt-2">Analytics not installed</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Track visitors, page views and engagement on your site. Pick what to track and where to inject the tracker.
                </p>
                <Button size="sm" className="mt-2 gap-2" onClick={() => transitionStep("options")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="M12 5v14" />
                  </svg>
                  Install analytics
                </Button>
              </div>
            )}

            {step === "options" && (
              <div className="flex flex-col items-center gap-5 w-full">
                <div className="flex flex-col items-center gap-2 text-center">
                  <h2 className="text-2xl font-bold font-[family-name:var(--font-averia)] tracking-tight">Install tracker</h2>
                  <p className="text-sm text-muted-foreground">
                    Choose where to inject the tracker and which URL it loads from.
                  </p>
                </div>

                <div className="w-full flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        Target file
                      </span>
                      <InfoHint>The script tag will be added at the end of this file.</InfoHint>
                    </div>
                    <FilePicker
                      label=""
                      files={layoutFiles}
                      selected={layoutSelected}
                      onChange={setLayoutSelected}
                      loading={layoutFilesLoading}
                      single
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <label
                        className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider"
                        htmlFor="analytics-app-url"
                      >
                        App URL
                      </label>
                      <InfoHint>
                        Used as the script src. Change it in project settings.
                      </InfoHint>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id="analytics-app-url"
                        type="url"
                        value={appUrl}
                        readOnly
                        tabIndex={-1}
                        className="cursor-default text-muted-foreground"
                      />
                      <Button
                        variant="secondary"
                        onClick={() => router.push("/settings")}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <Button variant="secondary" size="sm" onClick={() => transitionStep("intro")}>Back</Button>
                  <Button
                    size="sm"
                    disabled={layoutSelected.length === 0 || !isValidAppUrl}
                    onClick={startInstall}
                  >
                    Install
                  </Button>
                </div>
              </div>
            )}

            {step === "installing" && (
              <div className="flex flex-col gap-5 w-full">
                <h2 className="text-2xl font-bold font-[family-name:var(--font-averia)] tracking-tight">Installing</h2>
                <div className="flex flex-col gap-1.5">
                  {INSTALL_TASKS.map((task, idx) => {
                    const isDone = idx < installTaskIdx;
                    const isActive = idx === installTaskIdx;
                    const isPending = idx > installTaskIdx;
                    const isVerifyTask = idx === VERIFY_TASK_IDX;
                    return (
                      <div key={task.key} className="rounded-lg border border-input">
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          {isDone ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-foreground">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : isActive ? (
                            <svg className="size-4 shrink-0 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                          ) : (
                            <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input" />
                          )}
                          <span className={`text-sm font-medium flex-1 ${isPending ? "text-muted-foreground" : "text-foreground"}`}>
                            {task.label}
                          </span>
                          {isActive && isVerifyTask && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {verifyAttempts} {verifyAttempts === 1 ? "check" : "checks"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  className={`min-h-[4.5rem] flex flex-col items-center gap-2 transition-opacity duration-200 ${
                    installTaskIdx === VERIFY_TASK_IDX ? "opacity-100" : "pointer-events-none opacity-0"
                  }`}
                >
                  <p className="text-xs text-muted-foreground text-center">
                    Visit your site to confirm the tracker is firing.
                  </p>
                  <div className="flex items-center gap-2">
                    {current.url && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => window.open(current.url, "_blank", "noopener,noreferrer")}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 3h6v6" />
                          <path d="M10 14 21 3" />
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        </svg>
                        Open site
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => { setVerified(true); setInstalled(true); }}>
                      Skip
                    </Button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center">
          <div className="w-full max-w-md">
            <AwaitingVerification
              projectId={current.id}
              siteUrl={current.url}
              onVerified={() => setVerified(true)}
            />
          </div>
        </div>
      </div>
    );
  }

  const metrics = buildMetrics(dashboardData);
  const sources = buildSources(dashboardData);
  const sourcesChartConfig: ChartConfig = Object.fromEntries(
    sources.map((s) => [s.key, { label: s.name, color: s.color }])
  );
  const devices = buildDevices(dashboardData);
  const devicesChartConfig: ChartConfig = Object.fromEntries(
    devices.map((s) => [s.key, { label: s.name, color: s.color }])
  );
  const topPages = dashboardData?.topPages ?? [];

  const rangeSubtitle = isSameDay(range.from, range.to)
    ? format(range.from, "MMM d, yyyy")
    : `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight font-[family-name:var(--font-averia)]">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {rangeSubtitle} · {current.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {section === "heatmap" && (
            <button
              type="button"
              onClick={refreshHeatmapScreenshot}
              disabled={heatmapRefreshing}
              aria-label="Refresh screenshot"
              title="Refresh screenshot"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-input bg-transparent px-3 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={heatmapRefreshing ? "animate-spin" : ""}
              >
                <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
          )}
          <Select value={pagePath} onValueChange={(v) => v && setPagePath(v)}>
            <SelectTrigger className="max-w-[220px]">
              <SelectValue placeholder="Default">
                {(value: string | null) =>
                  !value || value === "/" ? "Default" : value
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end" className="w-auto min-w-(--anchor-width) max-w-sm p-1">
              {pageOptions.map((p) => (
                <SelectItem key={p.path} value={p.path}>
                  <span className="flex items-center gap-2">
                    <span className={p.path === "/" ? "" : "font-mono text-xs truncate"}>
                      {p.path === "/" ? "Default" : p.path}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {p.hits} {p.hits === 1 ? "hit" : "hits"}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <div className="flex gap-10">
        <aside className="w-44 shrink-0">
          <nav className="sticky top-20 flex flex-col gap-0.5">
            <button
              onClick={() => setSection("dashboard")}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                section === "dashboard"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
              Dashboard
            </button>
            <button
              onClick={() => setSection("heatmap")}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                section === "heatmap"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
              Heatmap
            </button>
            <button
              onClick={() => setSection("sessions")}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                section === "sessions"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Sessions
            </button>
          </nav>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col gap-6">
          {section === "dashboard" && (
            <>
        <div className="flex divide-x divide-border rounded-md border border-border overflow-hidden">
          {metrics.map((m, i) => (
            <button
              key={m.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                setSelectedMetricIdx(i);
                e.currentTarget.blur();
              }}
              className={`flex-1 min-w-0 px-5 py-4 flex flex-col gap-2 text-left transition-colors hover:bg-foreground/[0.02] focus:outline-none focus-visible:outline-none ${
                selectedMetricIdx === i ? "bg-foreground/[0.04]" : ""
              }`}
              style={{ outline: "none" }}>
              <span className="text-xs text-muted-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 self-start">
                {m.label}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl font-semibold tracking-tight tabular-nums leading-none whitespace-nowrap">
                  {m.value}
                </span>
                {m.delta.dir === "flat" ? (
                  <span className="text-xs text-muted-foreground leading-none">—</span>
                ) : (
                  <span
                    className={`flex items-center gap-0.5 text-xs font-medium tabular-nums leading-none whitespace-nowrap ${
                      m.delta.dir === "up" ? "text-emerald-500" : "text-red-500"
                    }`}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={m.delta.dir === "down" ? "rotate-180" : ""}
                    >
                      <polyline points="6 15 12 9 18 15" />
                    </svg>
                    {m.delta.value}
                  </span>
                )}
              </div>
              <div className="h-9 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={spark(m.points)} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id={`spark-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f5f5f7" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#f5f5f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="#f5f5f7"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill={`url(#spark-${i})`}
                      isAnimationActive
                      animationDuration={700}
                      animationEasing="ease-out"
                      dot={false}
                      activeDot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-border p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{metrics[selectedMetricIdx].label}</span>
          <ChartContainer
            config={{ value: { label: metrics[selectedMetricIdx].label, color: "#f5f5f7" } } satisfies ChartConfig}
            className="h-56 w-full"
          >
            <AreaChart
              data={metrics[selectedMetricIdx].points.map((v, i) => ({ day: dashboardData?.chartLabels[i] ?? "", value: v }))}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="metric-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f5f5f7" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#f5f5f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickMargin={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickMargin={8}
                width={40}
                allowDecimals={false}
              />
              <ChartTooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(value, _name, item) => (
                      <div className="flex w-full flex-col gap-1">
                        <span className="text-[11px] text-muted-foreground">
                          {(item?.payload as { day?: string } | undefined)?.day ?? ""}
                        </span>
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">
                            {metrics[selectedMetricIdx].label}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatMetricValue(metrics[selectedMetricIdx].label, Number(value))}
                          </span>
                        </div>
                      </div>
                    )}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#f5f5f7"
                strokeWidth={1.5}
                fill="url(#metric-fill)"
                isAnimationActive
                animationDuration={900}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ChartContainer>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-3 rounded-md border border-border p-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sources</span>
            {sources.length === 0 ? (
              <div className="flex flex-1 items-center justify-center min-h-[144px] text-xs text-muted-foreground">
                No data yet
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <ChartContainer config={sourcesChartConfig} className="aspect-square h-32">
                  <PieChart>
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          hideLabel
                          formatter={(value, name) => (
                            <div className="flex w-full items-center justify-between gap-4">
                              <span className="text-muted-foreground">
                                {sourcesChartConfig[name as string]?.label ?? name}
                              </span>
                              <span className="font-medium tabular-nums">{value}%</span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Pie
                      data={sources}
                      dataKey="share"
                      nameKey="key"
                      innerRadius={36}
                      outerRadius={56}
                      strokeWidth={2}
                      paddingAngle={2}
                      isAnimationActive
                      animationDuration={800}
                      animationEasing="ease-out"
                    >
                      {sources.map((s) => (
                        <Cell key={s.key} fill={s.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex w-full flex-col gap-1.5">
                  {sources.map((s) => (
                    <div key={s.key} className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} />
                        <span className="truncate">{s.name}</span>
                      </div>
                      <span className="font-medium tabular-nums">{s.share}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-border p-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Devices</span>
            {devices.length === 0 ? (
              <div className="flex flex-1 items-center justify-center min-h-[144px] text-xs text-muted-foreground">
                No data yet
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <ChartContainer config={devicesChartConfig} className="aspect-square h-32">
                  <PieChart>
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          hideLabel
                          formatter={(value, name) => (
                            <div className="flex w-full items-center justify-between gap-4">
                              <span className="text-muted-foreground">
                                {devicesChartConfig[name as string]?.label ?? name}
                              </span>
                              <span className="font-medium tabular-nums">{value}%</span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Pie
                      data={devices}
                      dataKey="share"
                      nameKey="key"
                      innerRadius={36}
                      outerRadius={56}
                      strokeWidth={2}
                      paddingAngle={2}
                      isAnimationActive
                      animationDuration={800}
                      animationEasing="ease-out"
                    >
                      {devices.map((s) => (
                        <Cell key={s.key} fill={s.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex w-full flex-col gap-1.5">
                  {devices.map((s) => (
                    <div key={s.key} className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} />
                        <span className="truncate">{s.name}</span>
                      </div>
                      <span className="font-medium tabular-nums">{s.share}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-border p-4">
            <CountriesPanel countries={dashboardData?.countries ?? []} />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-border p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Top pages</span>
          <div className="flex flex-col">
            {topPages.length === 0 ? (
              <span className="text-xs text-muted-foreground py-2">No data yet</span>
            ) : (
              topPages.map((p, i) => (
                <div
                  key={p.path}
                  className={`flex items-center justify-between py-2 text-sm ${
                    i !== topPages.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <span className="font-mono text-xs text-foreground truncate">{p.path}</span>
                  <span className="text-muted-foreground tabular-nums">{p.views.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
            </>
          )}

          {section === "heatmap" && (
            <ClickHeatmap
              projectId={current.id}
              points={dashboardData?.heatmap ?? []}
              selectedPath={pagePath}
              refreshSignal={heatmapRefreshSignal}
            />
          )}

          {section === "sessions" && (
            <SessionsList projectId={current.id} range={range} />
          )}
        </div>
      </div>
    </div>
  );
}

type SessionRow = {
  sessionHash: string;
  visitorHash: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  pageviews: number;
  clicks: number;
  events: number;
  device: string;
  browser: string;
  os: string;
  country: string;
  referrer: string;
  entryPath: string;
  exitPath: string;
  paths: string[];
};

function fmtSessionDuration(s: number): string {
  if (!s || s < 1) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

function fmtSessionTime(iso: string): string {
  if (!iso) return "—";
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(safe);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtCountry(code: string): string {
  if (!code || code.length !== 2) return code || "—";
  const base = 0x1f1e6;
  return (
    code.toUpperCase().split("").map((c) => String.fromCodePoint(base + (c.charCodeAt(0) - 65))).join("") +
    " " + code.toUpperCase()
  );
}

function fmtDevice(d: string): string {
  if (!d) return "Desktop";
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function fmtSource(referrer: string): string {
  if (!referrer) return "Direct";
  try {
    const u = new URL(referrer);
    return u.hostname || "Direct";
  } catch {
    return referrer.slice(0, 40);
  }
}

function SessionsList({
  projectId,
  range,
}: {
  projectId: string;
  range: { from: Date; to: Date };
}) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  useEffect(() => {
    let cancelled = false;
    const qs = `from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&limit=200`;
    function load() {
      fetch(`/api/projects/${projectId}/analytics/sessions?${qs}`)
        .then((r) => r.json())
        .then((data: { sessions: SessionRow[] }) => {
          if (cancelled) return;
          setSessions(data.sessions ?? []);
        })
        .catch(() => {
          if (!cancelled && sessions === null) setSessions([]);
        });
    }
    load();
    const id = setInterval(load, 3_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, fromIso, toIso]);

  if (sessions === null) {
    return (
      <div className="flex items-center justify-center p-12 text-xs text-muted-foreground">
        Loading sessions…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 text-xs text-muted-foreground">
        No sessions in this range yet
      </div>
    );
  }

  const activeSession = sessions.find((s) => s.sessionHash === expanded) ?? null;

  return (
    <>
      <div className="flex flex-col gap-1">
        {sessions.map((s) => (
          <button
            key={s.sessionHash}
            type="button"
            onClick={() => setExpanded(s.sessionHash)}
            className="flex items-center gap-4 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.04]"
          >
            <span className="w-32 shrink-0 text-sm tabular-nums">{fmtSessionTime(s.startedAt)}</span>
            <span className="w-24 shrink-0 text-sm text-muted-foreground">{fmtCountry(s.country)}</span>
            <span className="w-20 shrink-0 text-sm">{fmtDevice(s.device)}</span>
            <span className="flex-1 min-w-0 truncate font-mono text-xs text-muted-foreground" title={s.entryPath}>
              {s.entryPath || "—"}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-muted-foreground"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ))}
      </div>
      <SessionDialog
        session={activeSession}
        onClose={() => setExpanded(null)}
      />
    </>
  );
}

function SessionDialog({
  session,
  onClose,
}: {
  session: SessionRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        {session && (
          <>
            <DialogHeader>
              <DialogTitle className="font-[family-name:var(--font-averia)]">
                Session details
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 text-xs">
                <span className="tabular-nums">{fmtSessionTime(session.startedAt)}</span>
                <span>·</span>
                <span>{fmtSessionDuration(session.durationSeconds)}</span>
                <span>·</span>
                <span>{fmtCountry(session.country)}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
              <Field label="Device" value={fmtDevice(session.device)} />
              <Field label="OS" value={session.os || "—"} />
              <Field label="Browser" value={session.browser || "—"} />
              <Field label="Source" value={fmtSource(session.referrer)} />
              <Field label="Pageviews" value={String(session.pageviews)} />
              <Field label="Clicks" value={String(session.clicks)} />
              <Field label="Total events" value={String(session.events)} />
              <Field label="Visitor" value={session.visitorHash.slice(0, 12) || "—"} mono />
              <Field label="Started" value={fmtSessionTime(session.startedAt)} />
              <Field label="Ended" value={fmtSessionTime(session.endedAt)} />
              <Field label="Entry page" value={session.entryPath || "—"} mono />
              <Field label="Exit page" value={session.exitPath || "—"} mono />
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Pages visited ({session.paths.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {session.paths.map((p) => (
                  <span
                    key={p}
                    className="inline-flex max-w-[300px] items-center rounded-md border border-border bg-background px-2 py-0.5 font-mono text-xs truncate"
                    title={p}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`min-w-0 truncate ${mono ? "font-mono text-xs" : ""}`} title={value}>
        {value}
      </span>
    </div>
  );
}

function AwaitingVerification({
  projectId,
  siteUrl,
  onVerified,
}: {
  projectId: string;
  siteUrl?: string;
  onVerified: () => void;
}) {
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      fetch(`/api/projects/${projectId}/analytics/verify`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setAttempts((n) => n + 1);
          if (data.received) onVerified();
        })
        .catch(() => {});
    }
    poll();
    const id = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId, onVerified]);

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <h2 className="text-2xl font-bold font-[family-name:var(--font-averia)] tracking-tight text-center">
        Waiting for first event
      </h2>
      <div className="rounded-lg border border-input">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <svg className="size-4 shrink-0 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span className="text-sm font-medium flex-1">Waiting for first event</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {attempts} {attempts === 1 ? "check" : "checks"}
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Visit your site to confirm the tracker is firing.
      </p>
      <div className="flex items-center justify-center gap-2">
        {siteUrl && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => window.open(siteUrl, "_blank", "noopener,noreferrer")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
            Open site
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onVerified}>
          Skip
        </Button>
      </div>
    </div>
  );
}

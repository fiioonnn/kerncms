"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Monitor, RotateCw, Smartphone, Tablet } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { restartPreview, startPreview } from "@/server/actions/site";
import { EditorLoader } from "./editor-loader";

/** Mirrors PreviewState in src/server/preview.ts (as returned by /api/status). */
export type PreviewState = {
  status: "installing" | "starting" | "ready" | "error" | "stopped";
  port: number | null;
  url: string | null;
  lanUrl: string | null;
  error: string | null;
  log: string[];
  startedAt: number;
};

export const devices = [
  { value: "desktop", label: "Desktop", icon: Monitor, width: undefined },
  { value: "tablet", label: "Tablet", icon: Tablet, width: 820 },
  { value: "mobile", label: "Smartphone", icon: Smartphone, width: 390 },
];

/** Starts the site's dev server and polls /api/status: every second until it is ready, then every 10 s. */
export function usePreview() {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let status: PreviewState["status"] = "starting";

    async function poll() {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { preview?: PreviewState };
          if (!stopped && json.preview) {
            status = json.preview.status;
            setPreview(json.preview);
          }
        }
      } catch {
        // Network hiccup: try again on the next tick.
      }
      if (!stopped) timer = setTimeout(poll, status === "ready" ? 10_000 : 1000);
    }

    void startPreview().then((result) => {
      if (stopped) return;
      if (result.ok) {
        status = result.data.status;
        setPreview(result.data);
        setStartError(null);
      } else {
        setStartError(result.error);
      }
      void poll();
    });

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [run]);

  const restart = async () => {
    setStartError(null);
    setPreview((p) => (p ? { ...p, status: "starting", error: null } : p));
    const result = await restartPreview();
    if (!result.ok) {
      toast.error("Vorschau konnte nicht neu gestartet werden", { description: result.error });
      return;
    }
    setPreview(result.data);
    setRun((n) => n + 1);
  };

  return { preview, startError, restart };
}

function LogTail({ lines }: { lines: string[] }) {
  const tail = lines.filter((l) => l.trim()).slice(-8);
  if (tail.length === 0) return null;
  return (
    <pre className="max-h-48 w-[min(40rem,100%)] overflow-auto rounded-xl border border-border bg-surface p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted">
      {tail.join("\n")}
    </pre>
  );
}

/** Full-page loader while the preview server starts, or its error with a restart button. */
export function PreviewLoader({
  preview,
  startError,
  visible,
  title,
  onRestart,
  canRestart,
}: {
  preview: PreviewState | null;
  startError: string | null;
  visible: boolean;
  /** Overrides the title, e.g. while switching pages. */
  title?: string;
  onRestart: () => void;
  canRestart: boolean;
}) {
  const failed = Boolean(startError) || preview?.status === "error";
  if (failed) {
    return (
      <EditorLoader visible title="Vorschau konnte nicht starten" detail={startError ?? preview?.error ?? "Unbekannter Fehler"} hideBar>
        <LogTail lines={preview?.log ?? []} />
        <div className="flex gap-3">
          <Link href="/pages" className={buttonStyles({ variant: "secondary" })}>
            Zurück zu den Seiten
          </Link>
          {canRestart && (
            <Button onClick={onRestart}>
              <RotateCw />
              Neu starten
            </Button>
          )}
        </div>
      </EditorLoader>
    );
  }

  const status = preview?.status;
  const ready = status === "ready";
  return (
    <EditorLoader
      visible={visible}
      title={title ?? (ready ? "Visueller Editor wird geladen" : status === "installing" ? "Abhängigkeiten werden installiert" : "Vorschau wird gestartet")}
      detail={ready || title ? "Einen Moment…" : "Die Website wird im Entwurf gestartet. Das dauert beim ersten Mal etwas länger."}
    >
      {!ready && !title && <LogTail lines={preview?.log ?? []} />}
    </EditorLoader>
  );
}

/** The site preview in an iframe, full width on desktop or framed at the device width. */
export function PreviewFrame({
  src,
  device,
  fluid,
  frameRef,
  onLoad,
  children,
}: {
  src: string | null;
  device: string;
  /** Small screens: always full width. */
  fluid: boolean;
  frameRef: React.Ref<HTMLIFrameElement>;
  onLoad: () => void;
  children?: React.ReactNode;
}) {
  const width = fluid ? undefined : devices.find((d) => d.value === device)?.width;
  return (
    <main className={cn("relative flex min-w-0 flex-1 justify-center overflow-hidden bg-subtle", width && "p-6")}>
      <div
        className={cn(
          "h-full w-full overflow-hidden bg-surface",
          width && "rounded-[1.75rem] border-[6px] border-foreground/90 shadow-popover",
        )}
        style={width ? { maxWidth: width + 12 } : undefined}
      >
        {src && <iframe ref={frameRef} src={src} title="Vorschau der Seite" onLoad={onLoad} className="block size-full border-0" />}
      </div>
      {children}
    </main>
  );
}

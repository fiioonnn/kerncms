import { cn } from "@/lib/utils";

/**
 * Full-page loader shown while the visual editor and the site preview are
 * starting: logo, title, one status line, progress bar. `children` (e.g. the error log) goes below. The bar fills once over `duration`; the overlay fades
 * out when `visible` turns false. Without a duration (route-level loading
 * state) the bar fills slowly and stops just short of the end.
 */
export function EditorLoader({
  visible,
  duration,
  title = "Visueller Editor wird geladen",
  detail = "Vorschau der Website wird vorbereitet…",
  hideBar,
  children,
}: {
  visible: boolean;
  duration?: number;
  title?: string;
  detail?: string;
  /** E.g. for an error state. */
  hideBar?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-background px-4 transition-opacity duration-300",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
      <img src="/logo-mark.svg" alt="" width={64} height={64} className="size-16 animate-pulse drop-shadow-md dark:invert" />
      {/* Fixed line heights, single lines: changing texts must not move the logo or the bar. */}
      <div className="flex w-[min(28rem,100%)] flex-col items-center gap-2 text-center">
        <span className="h-7 max-w-full truncate text-xl font-semibold tracking-tight">{title}</span>
        <span className={cn("max-w-full text-[15px] text-muted", hideBar ? "[overflow-wrap:anywhere]" : "h-6 truncate")}>{detail}</span>
      </div>
      <div className={cn("h-1.5 w-64 overflow-hidden rounded-full bg-subtle", hideBar && "hidden")}>
        <div
          className="h-full origin-left rounded-full bg-accent"
          style={{
            // Re-applied each time the loader becomes visible, which restarts the animation.
            animation: visible
              ? duration
                ? `kern-loader-fill ${duration}ms cubic-bezier(0.25, 0.6, 0.35, 1) forwards`
                : "kern-loader-fill 8s cubic-bezier(0.1, 0.7, 0.2, 0.92) forwards"
              : undefined,
          }}
        />
      </div>
      {children}
    </div>
  );
}

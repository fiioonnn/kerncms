import { cn } from "@/lib/utils";

/**
 * Full-page loader shown while the visual editor (and later the site preview
 * iframe) is starting. The bar fills once over `duration`; the overlay fades
 * out when `visible` turns false. Without a duration (route-level loading
 * state) the bar fills slowly and stops just short of the end.
 */
export function EditorLoader({
  visible,
  duration,
  title = "Visueller Editor wird geladen",
  detail = "Vorschau der Website wird vorbereitet…",
}: {
  visible: boolean;
  duration?: number;
  title?: string;
  detail?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-background transition-opacity duration-300",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <span className="flex size-16 animate-pulse items-center justify-center rounded-2xl bg-foreground text-2xl font-bold text-white shadow-popover">
        k
      </span>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-xl font-semibold tracking-tight">{title}</span>
        <span className="text-[15px] text-muted">{detail}</span>
      </div>
      <div className="h-1.5 w-64 overflow-hidden rounded-full bg-subtle">
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
    </div>
  );
}

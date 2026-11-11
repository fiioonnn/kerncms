"use client";

import { Slider as BaseSlider } from "@base-ui/react/slider";
import { cn } from "@/lib/utils";

/** Labelled slider. Bipolar ranges (min < 0) get a centre mark and show a sign. */
export function Slider({
  label,
  value,
  onValueChange,
  onValueCommitted,
  min = 0,
  max = 100,
  step = 1,
  format,
  className,
}: {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  onValueCommitted?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const bipolar = min < 0;
  const shown = format ? format(value) : bipolar && value > 0 ? `+${value}` : String(value);

  return (
    <BaseSlider.Root
      value={value}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onValueChange(v as number)}
      onValueCommitted={(v) => onValueCommitted?.(v as number)}
      className={cn("flex flex-col gap-1.5", className)}
    >
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium">{label}</span>
        <button
          type="button"
          onDoubleClick={() => {
            const reset = bipolar ? 0 : min;
            onValueChange(reset);
            onValueCommitted?.(reset);
          }}
          title="Doppelklick zum Zurücksetzen"
          className={cn("text-sm tabular-nums", value !== (bipolar ? 0 : min) ? "text-foreground" : "text-muted")}
        >
          {shown}
        </button>
      </div>
      <BaseSlider.Control className="flex h-7 w-full touch-none items-center select-none">
        <BaseSlider.Track className="relative h-1.5 w-full rounded-full bg-subtle">
          {bipolar && <span className="absolute top-1/2 left-1/2 h-3 w-0.5 -translate-1/2 rounded-full bg-border-strong" />}
          <BaseSlider.Indicator className={cn("rounded-full", bipolar ? "bg-transparent" : "bg-accent")} />
          <BaseSlider.Thumb
            aria-label={label}
            className="size-5 rounded-full border-2 border-accent bg-surface shadow-card outline-none has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent/25"
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}

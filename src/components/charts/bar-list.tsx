import { cn } from "@/lib/utils";

export type BarListItem = { label: string; value: number; hint?: string };

/**
 * Ranked horizontal bars with the label inside the track and the value at the end.
 * One series, one colour: the accent at a soft tint so the text stays readable.
 */
export function BarList({
  items,
  valueLabel,
  format = (v) => v.toLocaleString("de-DE"),
  className,
}: {
  items: BarListItem[];
  valueLabel: string;
  format?: (value: number) => string;
  className?: string;
}) {
  const max = Math.max(...items.map((item) => item.value));
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex justify-between px-1 pb-2 text-sm font-medium text-muted">
        <span>Name</span>
        <span>{valueLabel}</span>
      </div>
      {items.map((item) => (
        <div
          key={item.label}
          title={`${item.label}: ${format(item.value)}`}
          className="group flex items-center gap-4 rounded-lg"
        >
          <div className="relative h-10 min-w-0 flex-1">
            <div
              className="absolute inset-y-0 left-0 rounded-r-[4px] bg-accent/12 transition-colors group-hover:bg-accent/20"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
            <span className="relative flex h-full items-center gap-2 truncate px-3 text-[15px]">
              <span className="truncate">{item.label}</span>
              {item.hint && <span className="text-sm text-muted">{item.hint}</span>}
            </span>
          </div>
          <span className="w-16 shrink-0 text-right text-[15px] font-medium tabular-nums">{format(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

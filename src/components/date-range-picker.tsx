"use client";

import { useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import {
  format,
  startOfDay,
  endOfDay,
  subDays,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  isSameDay,
} from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export type Range = { from: Date; to: Date };

type Preset = { id: string; label: string; build: () => Range };

const PRESETS: Preset[] = [
  {
    id: "today",
    label: "Today",
    build: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }),
  },
  {
    id: "yesterday",
    label: "Yesterday",
    build: () => {
      const d = subDays(new Date(), 1);
      return { from: startOfDay(d), to: endOfDay(d) };
    },
  },
  {
    id: "this-week",
    label: "This week",
    build: () => ({
      from: startOfWeek(new Date(), { weekStartsOn: 1 }),
      to: endOfDay(new Date()),
    }),
  },
  {
    id: "7d",
    label: "Last 7 days",
    build: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }),
  },
  {
    id: "14d",
    label: "Last 14 days",
    build: () => ({ from: startOfDay(subDays(new Date(), 13)), to: endOfDay(new Date()) }),
  },
  {
    id: "this-month",
    label: "This month",
    build: () => ({ from: startOfMonth(new Date()), to: endOfDay(new Date()) }),
  },
  {
    id: "last-month",
    label: "Last month",
    build: () => {
      const prev = subMonths(new Date(), 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    },
  },
  {
    id: "30d",
    label: "Last 30 days",
    build: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }),
  },
  {
    id: "90d",
    label: "Last 90 days",
    build: () => ({ from: startOfDay(subDays(new Date(), 89)), to: endOfDay(new Date()) }),
  },
  {
    id: "all",
    label: "All time",
    build: () => ({ from: startOfDay(new Date(2020, 0, 1)), to: endOfDay(new Date()) }),
  },
];

function rangeMatchesPreset(r: Range, p: Preset): boolean {
  const target = p.build();
  return isSameDay(r.from, target.from) && isSameDay(r.to, target.to);
}

function formatRange(r: Range): string {
  if (isSameDay(r.from, r.to)) return format(r.from, "MMM d, yyyy");
  if (r.from.getFullYear() === r.to.getFullYear()) {
    return `${format(r.from, "MMM d")} – ${format(r.to, "MMM d, yyyy")}`;
  }
  return `${format(r.from, "MMM d, yyyy")} – ${format(r.to, "MMM d, yyyy")}`;
}

export function DateRangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DateRange | undefined>({ from: value.from, to: value.to });

  function handleOpenChange(next: boolean) {
    if (next) setPending({ from: value.from, to: value.to });
    setOpen(next);
  }

  function applyPreset(p: Preset) {
    const r = p.build();
    setPending({ from: r.from, to: r.to });
    onChange(r);
    setOpen(false);
  }

  function applyPending() {
    if (!pending?.from) return;
    const fromDay = startOfDay(pending.from);
    const toDay = endOfDay(pending.to ?? pending.from);
    onChange({ from: fromDay, to: toDay });
    setOpen(false);
  }

  const activePreset = PRESETS.find((p) => rangeMatchesPreset(value, p));
  const triggerLabel = activePreset ? activePreset.label : formatRange(value);
  const canApply =
    !!pending?.from &&
    (!isSameDay(pending.from, value.from) ||
      !isSameDay(pending.to ?? pending.from, value.to));

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger className="flex h-8 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-input/50 dark:bg-input/30">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
          <line x1="16" x2="16" y1="2" y2="6" />
          <line x1="8" x2="8" y1="2" y2="6" />
          <line x1="3" x2="21" y1="10" y2="10" />
        </svg>
        <span>{triggerLabel}</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex w-auto flex-row items-stretch gap-0 overflow-hidden p-0 data-open:blur-in-8 data-closed:blur-out-8"
      >
        <div className="flex max-h-80 min-w-[150px] flex-col gap-1.5 overflow-y-auto border-r border-border bg-foreground/[0.02] p-2">
          {PRESETS.map((p) => {
            const active = rangeMatchesPreset(value, p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={`shrink-0 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex min-h-0 flex-col">
          <DayPicker
            mode="range"
            numberOfMonths={2}
            selected={pending}
            onSelect={setPending}
            defaultMonth={pending?.from ?? value.from}
            disabled={{ after: new Date() }}
            weekStartsOn={1}
            showOutsideDays
            className="p-3 text-sm"
            classNames={{
              months: "relative flex gap-6",
              month: "space-y-3",
              nav: "absolute inset-x-0 top-0 flex items-center justify-between px-0.5 z-10",
              button_previous:
                "size-7 rounded-md hover:bg-muted/60 inline-flex items-center justify-center transition-colors [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:fill-muted-foreground [&>svg]:stroke-muted-foreground hover:[&>svg]:fill-foreground hover:[&>svg]:stroke-foreground disabled:opacity-30 disabled:pointer-events-none",
              button_next:
                "size-7 rounded-md hover:bg-muted/60 inline-flex items-center justify-center transition-colors [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:fill-muted-foreground [&>svg]:stroke-muted-foreground hover:[&>svg]:fill-foreground hover:[&>svg]:stroke-foreground disabled:opacity-30 disabled:pointer-events-none",
              month_caption: "flex items-center justify-center h-7",
              caption_label: "text-sm font-medium",
              month_grid: "w-full border-collapse",
              weekdays: "flex",
              weekday: "text-muted-foreground w-8 font-normal text-[0.75rem] text-center",
              week: "flex w-full mt-1",
              day: "text-center text-sm p-0 relative w-8",
              day_button:
                "h-8 w-8 p-0 font-normal rounded-md hover:bg-muted/60 inline-flex items-center justify-center transition-colors",
              range_start:
                "bg-muted rounded-l-md [&_button]:bg-foreground [&_button]:text-background [&_button]:hover:bg-foreground",
              range_end:
                "bg-muted rounded-r-md [&_button]:bg-foreground [&_button]:text-background [&_button]:hover:bg-foreground",
              range_middle: "bg-muted rounded-none [&_button]:hover:bg-muted/80",
              today: "[&_button]:border [&_button]:border-foreground/20",
              outside: "text-muted-foreground/30",
              disabled: "text-muted-foreground/30 pointer-events-none",
            }}
          />
          <div className="flex items-center justify-between gap-2 border-t border-border p-2">
            <span className="text-xs text-muted-foreground">
              {pending?.from ? formatRange({ from: pending.from, to: pending.to ?? pending.from }) : "Pick a date"}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!canApply} onClick={applyPending}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

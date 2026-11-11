"use client";

import { useId, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

const monthNames = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
const weekdayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Mi., 12. November 2026" */
export function formatDate(date: Date) {
  return date.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

/** Month grid, Monday first. Only rendered while the popover is open, so "today" is always client time. */
function Calendar({ selected, onSelect }: { selected?: Date; onSelect: (date: Date) => void }) {
  const [today] = useState(() => new Date());
  const [view, setView] = useState(() => {
    const base = selected ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = view.getFullYear();
  const month = view.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label="Vorheriger Monat"
          onClick={() => setView(new Date(year, month - 1, 1))}
        >
          <ChevronLeft strokeWidth={1.75} />
        </Button>
        <span className="text-[15px] font-semibold" aria-live="polite">
          {monthNames[month]} {year}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label="Nächster Monat"
          onClick={() => setView(new Date(year, month + 1, 1))}
        >
          <ChevronRight strokeWidth={1.75} />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdayNames.map((name) => (
          <span key={name} className="flex h-8 items-center justify-center text-xs font-semibold text-muted">
            {name}
          </span>
        ))}
        {cells.map((date, index) =>
          date ? (
            <button
              key={date.getDate()}
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={selected ? sameDay(date, selected) : false}
              aria-label={formatDate(date)}
              className={cn(
                "relative flex size-10 items-center justify-center rounded-lg text-[15px] transition-colors outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
                sameDay(date, today) && "font-semibold text-accent",
                selected && sameDay(date, selected) && "bg-accent font-semibold text-accent-foreground hover:bg-accent-hover",
              )}
            >
              {date.getDate()}
              {sameDay(date, today) && !(selected && sameDay(date, selected)) && (
                <span className="absolute bottom-1.5 size-1 rounded-full bg-accent" />
              )}
            </button>
          ) : (
            <span key={`empty-${index}`} />
          ),
        )}
      </div>
      <div className="mt-3 flex justify-end border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={() => onSelect(today)}>
          Heute
        </Button>
      </div>
    </div>
  );
}

export function DatePicker({
  label,
  value,
  defaultValue,
  onValueChange,
  className,
}: {
  label?: string;
  value?: Date;
  defaultValue?: Date;
  onValueChange?: (date: Date) => void;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState<Date | undefined>(defaultValue);
  const selected = value ?? internal;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <span id={`${id}-label`} className="text-[15px] font-medium">
          {label}
        </span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-labelledby={label ? `${id}-label ${id}-value` : undefined}
          className="flex h-11 w-full items-center gap-3 rounded-xl border border-border-strong bg-surface px-4 text-left text-[15px] text-foreground transition-colors outline-none select-none hover:border-muted/60 focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 data-popup-open:border-accent"
        >
          <CalendarDays className="size-[18px] shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
          <span id={`${id}-value`} className={cn("truncate", !selected && "text-muted")}>
            {selected ? formatDate(selected) : "Datum wählen"}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto">
          <Calendar
            selected={selected}
            onSelect={(date) => {
              setInternal(date);
              onValueChange?.(date);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** "00:00" … "23:30" in 30-minute steps, for the Select component. */
export const timeOptions = Array.from({ length: 48 }, (_, i) => {
  const value = `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
  return { label: `${value} Uhr`, value };
});

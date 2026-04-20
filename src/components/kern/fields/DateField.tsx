"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { format, parse } from "date-fns";

interface FieldProps {
  value: string;
  onChange: (value: string) => void;
  schema?: { format?: string };
  label?: string;
  disabled?: boolean;
}

const FORMAT_MAP: Record<string, string> = {
  "YYYY-MM-DD": "yyyy-MM-dd",
  "DD.MM.YYYY": "dd.MM.yyyy",
  "MM/DD/YYYY": "MM/dd/yyyy",
};

export function DateField({ value, onChange, schema, label, disabled }: FieldProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const displayFormat = FORMAT_MAP[schema?.format ?? "YYYY-MM-DD"] ?? "yyyy-MM-dd";

  const date = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const displayValue = date && !isNaN(date.getTime()) ? format(date, displayFormat) : "";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <div ref={ref} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!open)}
          className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-input/50 disabled:opacity-50 dark:bg-input/30"
        >
          <span className={displayValue ? "text-foreground" : "text-muted-foreground"}>
            {displayValue || "Select date..."}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
          </svg>
        </button>
        {open && (
          <div className="absolute top-[calc(100%+4px)] left-0 z-50 rounded-lg bg-popover shadow-md ring-1 ring-foreground/10 p-3">
            <DayPicker
              mode="single"
              selected={date}
              onSelect={(d) => {
                if (d) onChange(format(d, "yyyy-MM-dd"));
                setOpen(false);
              }}
              className="text-sm"
              classNames={{
                months: "flex flex-col",
                month: "space-y-3",
                month_caption: "flex justify-center items-center h-7",
                caption_label: "text-sm font-medium",
                nav: "flex items-center gap-1",
                button_previous: "absolute left-1 h-7 w-7 rounded-md bg-muted/50 p-0 text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center justify-center transition-colors [&>svg]:h-3.5 [&>svg]:w-3.5",
                button_next: "absolute right-1 h-7 w-7 rounded-md bg-muted/50 p-0 text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center justify-center transition-colors [&>svg]:h-3.5 [&>svg]:w-3.5",
                month_grid: "w-full border-collapse",
                weekdays: "flex",
                weekday: "text-muted-foreground w-8 font-normal text-[0.8rem] text-center",
                week: "flex w-full mt-1",
                day: "text-center text-sm p-0 relative",
                day_button: "h-8 w-8 p-0 font-normal rounded-md hover:bg-muted/50 inline-flex items-center justify-center transition-colors",
                selected: "[&_.rdp-day_button]:bg-foreground [&_.rdp-day_button]:text-background [&_.rdp-day_button]:hover:bg-foreground",
                today: "[&_.rdp-day_button]:border [&_.rdp-day_button]:border-foreground/20",
                outside: "text-muted-foreground/30",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

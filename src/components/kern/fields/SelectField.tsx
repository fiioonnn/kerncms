"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface FieldProps {
  value: string;
  onChange: (value: string) => void;
  schema?: { options?: string[] };
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function SelectField({ value, onChange, schema, label, placeholder, disabled }: FieldProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const options = schema?.options ?? [];

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleScroll() { updatePos(); }
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, updatePos]);

  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <div>
        <button
          ref={btnRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!open)}
          className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-input/50 disabled:opacity-50 dark:bg-input/30"
        >
          <span className={value ? "text-foreground" : "text-muted-foreground"}>
            {value || placeholder || "Select..."}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {open && pos && createPortal(
          <div
            ref={ref}
            className="fixed z-[200] rounded-lg bg-popover shadow-md ring-1 ring-foreground/10 py-1 max-h-60 overflow-y-auto"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/50"
              >
                <span>{opt}</span>
                {opt === value && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}

"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/** Six single-digit boxes for one-time codes: auto-advance, backspace, arrow keys and paste. */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  invalid,
  disabled,
  label = "Anmeldecode",
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  invalid?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function set(next: string, focus?: number) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (focus !== undefined) refs.current[Math.min(focus, length - 1)]?.focus();
    if (clean.length === length) onComplete?.(clean);
  }

  return (
    <div role="group" aria-label={label} className="flex justify-between gap-2 sm:gap-3">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={digit}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={i === 0}
          aria-label={`Ziffer ${i + 1} von ${length}`}
          aria-invalid={invalid || undefined}
          maxLength={length}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, "");
            if (!typed) return;
            // Typing or pasting several digits fills the following boxes.
            const next = (value.slice(0, i) + typed + value.slice(i + typed.length)).slice(0, length);
            set(next, i + typed.length);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (digit) set(value.slice(0, i) + value.slice(i + 1), i);
              else if (i > 0) set(value.slice(0, i - 1) + value.slice(i), i - 1);
            } else if (e.key === "ArrowLeft" && i > 0) {
              e.preventDefault();
              refs.current[i - 1]?.focus();
            } else if (e.key === "ArrowRight" && i < length - 1) {
              e.preventDefault();
              refs.current[i + 1]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            set(e.clipboardData.getData("text"), length - 1);
          }}
          className={cn(
            "h-14 w-full min-w-0 rounded-xl border bg-surface text-center font-mono text-2xl font-semibold text-foreground transition-colors outline-none sm:h-16",
            "focus:border-accent focus:ring-4 focus:ring-accent/15 disabled:opacity-50",
            invalid ? "border-danger" : digit ? "border-foreground/40" : "border-border-strong",
          )}
        />
      ))}
    </div>
  );
}

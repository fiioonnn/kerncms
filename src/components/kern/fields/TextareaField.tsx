"use client";

import { useRef, useEffect } from "react";

interface FieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function TextareaField({ value, onChange, label, placeholder, disabled }: FieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <textarea
        ref={ref}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        disabled={disabled}
        rows={3}
        className="w-full min-h-[80px] rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 resize-none dark:bg-input/30"
      />
    </div>
  );
}

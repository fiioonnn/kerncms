"use client";

interface FieldProps {
  value: number;
  onChange: (value: number) => void;
  schema?: { min?: number; max?: number };
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function NumberField({ value, onChange, schema, label, placeholder, disabled }: FieldProps) {
  const min = schema?.min;
  const max = schema?.max;

  function clamp(n: number) {
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  }

  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <div className="flex h-8 rounded-lg border border-input overflow-hidden dark:bg-input/30">
        <input
          type="number"
          value={value ?? 0}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          placeholder={placeholder ?? label}
          disabled={disabled}
          min={min}
          max={max}
          className="flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
        />
        <div className="flex flex-col border-l border-input">
          <button
            type="button"
            disabled={disabled || (max !== undefined && (value ?? 0) >= max)}
            onClick={() => onChange(clamp((value ?? 0) + 1))}
            className="flex-1 px-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
          </button>
          <div className="h-px bg-input" />
          <button
            type="button"
            disabled={disabled || (min !== undefined && (value ?? 0) <= min)}
            onClick={() => onChange(clamp((value ?? 0) - 1))}
            className="flex-1 px-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

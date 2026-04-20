"use client";

interface FieldProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function BooleanField({ value, onChange, label, disabled }: FieldProps) {
  return (
    <div className="flex items-center justify-between">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <button
        type="button"
        role="switch"
        aria-checked={!!value}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
          value ? "bg-foreground" : "bg-input"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform duration-200 ${
            value ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

"use client";

import { Input } from "@/components/ui/input";

interface FieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function TextField({ value, onChange, label, placeholder, disabled }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        disabled={disabled}
      />
    </div>
  );
}

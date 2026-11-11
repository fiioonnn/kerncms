"use client";

import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Switch({
  label,
  description,
  defaultChecked,
}: {
  label: string;
  description?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6">
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-medium">{label}</span>
        {description && <span className="text-sm text-muted">{description}</span>}
      </span>
      <BaseSwitch.Root
        defaultChecked={defaultChecked}
        className="relative mt-0.5 flex h-7 w-12 shrink-0 rounded-full bg-border-strong p-0.5 transition-colors outline-none focus-visible:ring-4 focus-visible:ring-accent/20 data-checked:bg-accent"
      >
        <BaseSwitch.Thumb className="size-6 rounded-full bg-white shadow-card transition-transform data-checked:translate-x-5" />
      </BaseSwitch.Root>
    </label>
  );
}

export function Checkbox({
  label,
  hideLabel,
  defaultChecked,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  label: string;
  /** Keep the label for screen readers only (e.g. inside a table cell). */
  hideLabel?: boolean;
  defaultChecked?: boolean;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 text-[15px]",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className,
      )}
    >
      <BaseCheckbox.Root
        defaultChecked={defaultChecked}
        checked={checked}
        onCheckedChange={onCheckedChange ? (next) => onCheckedChange(next) : undefined}
        disabled={disabled}
        className="flex size-6 items-center justify-center rounded-md border border-border-strong bg-surface transition-colors outline-none focus-visible:ring-4 focus-visible:ring-accent/20 data-checked:border-accent data-checked:bg-accent data-disabled:opacity-50"
      >
        <BaseCheckbox.Indicator className="text-white data-unchecked:hidden">
          <Check className="size-4" strokeWidth={3} />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      {hideLabel ? <span className="sr-only">{label}</span> : label}
    </label>
  );
}

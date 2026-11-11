"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectItem = { label: string; value: string };

/**
 * Labelled select. A visible `label` is wired to the trigger via aria-labelledby;
 * without one, pass `aria-label` so the control still has an accessible name.
 * Use `defaultValue` (uncontrolled) or `value` + `onValueChange` (controlled).
 */
export function Select({
  items,
  label,
  "aria-label": ariaLabel,
  value,
  defaultValue,
  onValueChange,
  disabled,
  className,
}: {
  items: SelectItem[];
  label?: string;
  /** Accessible name when no visible `label` is shown. */
  "aria-label"?: string;
  /** Controlled value (`null` = nothing selected). */
  value?: string | null;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <BaseSelect.Root
      items={items}
      {...(value !== undefined ? { value } : { defaultValue })}
      disabled={disabled}
      onValueChange={(next) => onValueChange?.(next as string)}
    >
      <div className={cn("flex flex-col gap-2", className)}>
        {label && (
          <BaseSelect.Label className="text-[15px] font-medium text-foreground">
            {label}
          </BaseSelect.Label>
        )}
        <BaseSelect.Trigger
          aria-label={label ? undefined : ariaLabel}
          className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-border-strong bg-surface px-4 text-left text-[15px] text-foreground transition-colors outline-none select-none hover:border-muted/60 focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 data-disabled:opacity-50 data-popup-open:border-accent"
        >
          <BaseSelect.Value className="truncate data-placeholder:text-muted" />
          <BaseSelect.Icon className="text-muted" aria-hidden>
            <ChevronsUpDown className="size-4" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
      </div>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className="z-50 outline-none select-none"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          <BaseSelect.Popup className="min-w-(--anchor-width) origin-(--transform-origin) rounded-xl border border-border bg-surface p-1.5 shadow-popover transition-[scale,opacity] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <BaseSelect.List className="max-h-(--available-height) overflow-y-auto outline-none">
              {items.map((item) => (
                <BaseSelect.Item
                  key={item.value}
                  value={item.value}
                  className="flex h-10 cursor-default items-center justify-between gap-6 rounded-lg px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset data-highlighted:bg-subtle"
                >
                  <BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="text-accent">
                    <Check className="size-4" />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

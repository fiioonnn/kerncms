"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Tooltip ---------- */

export const TooltipProvider = BaseTooltip.Provider;

/** Wraps a single element (e.g. an icon button) and shows `label` on hover/focus. */
export function Tooltip({
  label,
  side = "bottom",
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactElement;
}) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={8} side={side} className="z-[70]">
          <BaseTooltip.Popup className="origin-(--transform-origin) rounded-lg bg-foreground px-2.5 py-1.5 text-sm font-medium text-white transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-instant:transition-none data-starting-style:scale-95 data-starting-style:opacity-0">
            {label}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

/* ---------- Popover ---------- */

export const Popover = BasePopover.Root;

export function PopoverTrigger({
  className,
  ...props
}: Omit<BasePopover.Trigger.Props, "className"> & { className?: string }) {
  return <BasePopover.Trigger className={className} {...props} />;
}

export function PopoverContent({
  children,
  align = "end",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner sideOffset={8} align={align} className="z-50">
        <BasePopover.Popup
          className={cn(
            "w-96 origin-(--transform-origin) rounded-2xl border border-border bg-surface shadow-popover outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            className,
          )}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

/* ---------- Segmented control (single choice) ---------- */

export type SegmentItem = { value: string; label?: string; icon?: LucideIcon };

export function SegmentedControl({
  items,
  value,
  onValueChange,
  label,
  className,
}: {
  items: SegmentItem[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        if (next.length > 0) onValueChange(next.at(-1) as string);
      }}
      className={cn("flex rounded-xl border border-border bg-surface p-1", className)}
    >
      {items.map((item) => {
        const control = (
          <Toggle
            key={item.value}
            value={item.value}
            aria-label={item.label ?? item.value}
            className={cn(
              "flex h-9 items-center justify-center gap-2 rounded-lg text-[15px] font-medium text-muted transition-colors outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent data-pressed:bg-subtle data-pressed:text-foreground",
              item.icon && !item.label ? "w-10" : "px-4",
            )}
          >
            {item.icon && <item.icon className="size-[18px]" strokeWidth={1.75} />}
            {item.label && !item.icon && item.label}
          </Toggle>
        );
        return item.icon && item.label ? (
          <Tooltip key={item.value} label={item.label}>
            {control}
          </Tooltip>
        ) : (
          control
        );
      })}
    </ToggleGroup>
  );
}

"use client";

import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const Menu = BaseMenu.Root;

export function MenuTrigger({
  className,
  ...props
}: Omit<BaseMenu.Trigger.Props, "className"> & { className?: string }) {
  return <BaseMenu.Trigger className={className} {...props} />;
}

export function MenuContent({
  children,
  align = "end",
  side = "bottom",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner className="z-50 outline-none" sideOffset={8} align={align} side={side}>
        <BaseMenu.Popup
          className={cn(
            "min-w-56 origin-(--transform-origin) rounded-xl border border-border bg-surface p-1.5 shadow-popover outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
            className,
          )}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export function MenuItem({
  icon: Icon,
  danger,
  className,
  children,
  ...props
}: Omit<BaseMenu.Item.Props, "className"> & {
  icon?: LucideIcon;
  danger?: boolean;
  className?: string;
}) {
  return (
    <BaseMenu.Item
      className={cn(
        "flex h-10 cursor-default items-center gap-3 rounded-lg px-3 text-[15px] outline-none select-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset data-highlighted:bg-subtle",
        danger && "text-danger data-highlighted:bg-danger-soft",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className={cn("size-[18px] shrink-0", !danger && "text-muted")} strokeWidth={1.75} />}
      {children}
    </BaseMenu.Item>
  );
}

export function MenuSeparator() {
  return <BaseMenu.Separator className="mx-1.5 my-1.5 h-px bg-border" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">{children}</div>;
}

/** A menu row with an on/off switch, e.g. dark mode. The menu stays open when toggled. */
export function MenuSwitchItem({
  icon: Icon,
  checked,
  onCheckedChange,
  children,
}: {
  icon?: LucideIcon;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <BaseMenu.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      closeOnClick={false}
      className="flex h-10 cursor-default items-center gap-3 rounded-lg px-3 text-[15px] outline-none select-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset data-highlighted:bg-subtle"
    >
      {Icon && <Icon className="size-[18px] shrink-0 text-muted" strokeWidth={1.75} />}
      <span className="flex-1">{children}</span>
      <span
        aria-hidden
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-border-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-card transition-transform",
            checked && "translate-x-4",
          )}
        />
      </span>
    </BaseMenu.CheckboxItem>
  );
}

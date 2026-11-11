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
        "flex h-10 cursor-default items-center gap-3 rounded-lg px-3 text-[15px] outline-none select-none data-highlighted:bg-subtle",
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

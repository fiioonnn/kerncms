"use client";

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

export const Tabs = BaseTabs.Root;

export function TabsList({
  className,
  children,
  ...props
}: Omit<BaseTabs.List.Props, "className"> & { className?: string }) {
  return (
    <BaseTabs.List
      className={cn("relative z-0 flex gap-1 border-b border-border", className)}
      {...props}
    >
      {children}
      <BaseTabs.Indicator className="absolute bottom-[-1px] left-0 h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-full bg-accent transition-[translate,width] duration-200 ease-out" />
    </BaseTabs.List>
  );
}

export function Tab({
  className,
  ...props
}: Omit<BaseTabs.Tab.Props, "className"> & { className?: string }) {
  return (
    <BaseTabs.Tab
      className={cn(
        "flex h-12 items-center gap-2 px-4 text-[15px] font-medium whitespace-nowrap text-muted outline-none select-none hover:text-foreground focus-visible:text-foreground data-active:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TabPanel({
  className,
  ...props
}: Omit<BaseTabs.Panel.Props, "className"> & { className?: string }) {
  return <BaseTabs.Panel className={cn("pt-8 outline-none", className)} {...props} />;
}

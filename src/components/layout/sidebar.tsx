"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";
import { Avatar } from "@/components/ui/display";
import { cn } from "@/lib/utils";
import { findNavItem, navigation } from "./nav";

export function Sidebar() {
  const pathname = usePathname();
  const active = findNavItem(pathname);

  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 px-6">
        <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-base font-bold text-white">
          k
        </span>
        <span className="text-lg font-semibold tracking-tight">kerncms</span>
      </div>

      {/* Site switcher (visual only) */}
      <div className="px-4 pb-2">
        <button
          type="button"
          className="flex h-14 w-full items-center gap-3 rounded-xl border border-border px-3 text-left transition-colors hover:bg-subtle"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-sm font-semibold text-accent">
            BM
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[15px] font-medium">Bäckerei Müller</span>
            <span className="truncate text-sm text-muted">baeckerei-mueller.de</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-7 overflow-y-auto px-4 py-5">
        {navigation.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <span className="px-3 pb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
              {group.label}
            </span>
            {group.items.map((item) => {
              const isActive = active?.href === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
                    isActive
                      ? "bg-accent-soft text-accent"
                      : "text-foreground/80 hover:bg-subtle hover:text-foreground",
                  )}
                >
                  <item.icon className="size-5 shrink-0" strokeWidth={1.75} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
          <Avatar name="Anna Schmidt" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[15px] font-medium">Anna Schmidt</span>
            <span className="truncate text-sm text-muted">Redakteurin</span>
          </span>
        </div>
      </div>
    </aside>
  );
}

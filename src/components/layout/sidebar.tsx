"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Check, ChevronsUpDown, LogOut, Plus, Settings, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { findNavItem, navigation } from "./nav";

const sites = [
  { name: "Bäckerei Müller", domain: "baeckerei-mueller.de", initials: "BM" },
  { name: "Café Sonnenschein", domain: "cafe-sonnenschein.de", initials: "CS" },
  { name: "Weingut Berger", domain: "weingut-berger.at", initials: "WB" },
];

export function Sidebar() {
  const pathname = usePathname();
  const active = findNavItem(pathname);
  const [site, setSite] = useState(sites[0]);

  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 px-6">
        <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-base font-bold text-white">
          k
        </span>
        <span className="text-lg font-semibold tracking-tight">kerncms</span>
      </div>

      {/* Site switcher */}
      <div className="px-4 pb-2">
        <Menu>
          <MenuTrigger className="flex h-14 w-full items-center gap-3 rounded-xl border border-border px-3 text-left transition-colors outline-none hover:bg-subtle focus-visible:ring-4 focus-visible:ring-accent/15 data-popup-open:bg-subtle">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-sm font-semibold text-accent">
              {site.initials}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[15px] font-medium">{site.name}</span>
              <span className="truncate text-sm text-muted">{site.domain}</span>
            </span>
            <ChevronsUpDown className="size-4 text-muted" />
          </MenuTrigger>
          <MenuContent align="start" className="w-64">
            <MenuLabel>Websites</MenuLabel>
            {sites.map((s) => (
              <MenuItem
                key={s.domain}
                onClick={() => {
                  setSite(s);
                  toast.info(`Gewechselt zu ${s.name}`);
                }}
                className="h-12"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-xs font-semibold text-accent">
                  {s.initials}
                </span>
                <span className="flex flex-1 flex-col leading-tight">
                  <span>{s.name}</span>
                  <span className="text-sm text-muted">{s.domain}</span>
                </span>
                {s.domain === site.domain && <Check className="size-4 text-accent" />}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem icon={Plus} onClick={() => toast.info("Website verbinden", { description: "Kommt mit der GitHub-Anbindung." })}>
              Website verbinden
            </MenuItem>
          </MenuContent>
        </Menu>
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

      {/* User menu */}
      <div className="border-t border-border p-3">
        <Menu>
          <MenuTrigger className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors outline-none hover:bg-subtle data-popup-open:bg-subtle">
            <Avatar name="Anna Schmidt" />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[15px] font-medium">Anna Schmidt</span>
              <span className="truncate text-sm text-muted">Redakteurin</span>
            </span>
            <ChevronsUpDown className="size-4 text-muted" />
          </MenuTrigger>
          <MenuContent side="top" align="start" className="w-64">
            <MenuItem icon={UserRound} onClick={() => toast.info("Profil", { description: "Kommt bald." })}>
              Profil
            </MenuItem>
            <MenuItem icon={Settings} render={<Link href="/settings" />}>
              Einstellungen
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={LogOut} render={<Link href="/login" />}>
              Abmelden
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </aside>
  );
}

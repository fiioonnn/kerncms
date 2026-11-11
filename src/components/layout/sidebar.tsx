"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Check, ChevronsUpDown, LayoutGrid, LogOut, Menu as MenuIcon, MousePointerClick, Palette, Plus, Settings, Trash2, UserRound, Users, X } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
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

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = findNavItem(pathname);
  const [site, setSite] = useState(sites[0]);

  return (
    <>
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
          <MenuTrigger className="flex h-14 w-full items-center gap-3 rounded-xl border border-border px-3 text-left transition-colors outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent data-popup-open:bg-subtle">
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
            <MenuItem icon={LayoutGrid} render={<Link href="/sites" onClick={onNavigate} />}>
              Alle Websites
            </MenuItem>
            <MenuItem icon={Plus} render={<Link href="/onboarding" onClick={onNavigate} />}>
              Website verbinden
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      {/* Primary action: open the visual editor */}
      <div className="px-4 pt-2">
        <Link href="/editor" onClick={onNavigate} className={buttonStyles({ className: "w-full" })}>
          <MousePointerClick />
          Website bearbeiten
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-3">
        {navigation.map((group) => (
          <div key={group.label ?? "main"} className="flex flex-col gap-1">
            {group.label && (
              <span className="px-3 pb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
                {group.label}
              </span>
            )}
            {group.items.map((item) => {
              const isActive = (active?.parent ?? active?.href) === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
                    isActive
                      ? "bg-accent-soft text-accent"
                      : "text-foreground/80 hover:bg-subtle hover:text-foreground",
                  )}
                >
                  <item.icon className="size-5 shrink-0" strokeWidth={1.75} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge ? (
                    <span
                      aria-label={`${item.badge} offen`}
                      className={cn(
                        "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
                        isActive ? "bg-accent text-white" : "bg-subtle text-foreground",
                      )}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User menu */}
      <div className="border-t border-border p-3">
        <Menu>
          <MenuTrigger className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent data-popup-open:bg-subtle">
            <Avatar name="Anna Schmidt" />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[15px] font-medium">Anna Schmidt</span>
              <span className="truncate text-sm text-muted">Redakteurin</span>
            </span>
            <ChevronsUpDown className="size-4 text-muted" />
          </MenuTrigger>
          <MenuContent side="top" align="start" className="w-64">
            <MenuItem icon={UserRound} render={<Link href="/profile" onClick={onNavigate} />}>
              Profil
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>Website verwalten</MenuLabel>
            <MenuItem icon={Settings} render={<Link href="/settings" onClick={onNavigate} />}>
              Einstellungen
            </MenuItem>
            <MenuItem icon={Users} render={<Link href="/team" onClick={onNavigate} />}>
              Team
            </MenuItem>
            <MenuItem icon={Trash2} render={<Link href="/trash" onClick={onNavigate} />}>
              Papierkorb
            </MenuItem>
            <MenuItem icon={Palette} render={<Link href="/styleguide" onClick={onNavigate} />}>
              Styleguide
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={LogOut} render={<Link href="/login" />}>
              Abmelden
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </>
  );
}

/** Desktop sidebar (from 1024 px). */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <SidebarContent />
    </aside>
  );
}

/** Hamburger button + slide-in navigation for narrow screens. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <BaseDialog.Root open={open} onOpenChange={setOpen}>
      <BaseDialog.Trigger aria-label="Menü öffnen" className={buttonStyles({ variant: "ghost", size: "icon", className: "-ml-2 lg:hidden" })}>
        <MenuIcon strokeWidth={1.75} />
      </BaseDialog.Trigger>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 lg:hidden" />
        <BaseDialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-3rem))] flex-col bg-surface shadow-popover outline-none transition-transform duration-200 ease-out data-ending-style:-translate-x-full data-starting-style:-translate-x-full lg:hidden">
          <BaseDialog.Title className="sr-only">Navigation</BaseDialog.Title>
          <BaseDialog.Close aria-label="Menü schließen" className={buttonStyles({ variant: "ghost", size: "icon", className: "absolute top-2.5 right-2.5 size-10" })}>
            <X strokeWidth={1.75} />
          </BaseDialog.Close>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

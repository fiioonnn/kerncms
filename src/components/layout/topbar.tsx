"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, GitBranch, Search } from "lucide-react";
import { PublishButton } from "@/components/actions/publish";
import { buttonStyles } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/overlay";
import { CommandPalette } from "./command-palette";
import { findNavItem } from "./nav";

const changes = [
  { file: "Startseite", detail: "Hero-Überschrift geändert", who: "Anna", when: "vor 12 Min." },
  { file: "Neue Sauerteigbrote ab Mai", detail: "Neuer Beitrag", who: "Anna", when: "vor 2 Std." },
  { file: "Navigation", detail: "Menüpunkt hinzugefügt", who: "Jonas", when: "gestern" },
];

const notifications = [
  { title: "Jonas hat „Navigation“ geändert", when: "gestern, 16:20", unread: true },
  { title: "Veröffentlichung abgeschlossen", when: "8. Nov., 09:14", unread: true },
  { title: "Lena wurde zum Team eingeladen", when: "5. Nov., 11:02", unread: false },
];

export function Topbar() {
  const pathname = usePathname();
  const current = findNavItem(pathname);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-6 border-b border-border bg-surface/85 px-8 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2 text-[15px]">
        <span className="text-muted">Bäckerei Müller</span>
        <span className="text-border-strong">/</span>
        <span className="truncate font-medium">{current?.label ?? "Übersicht"}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden h-11 w-72 items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 text-[15px] text-muted transition-colors hover:border-border-strong md:flex"
        >
          <Search className="size-5 shrink-0" strokeWidth={1.75} />
          <span className="flex-1 text-left">Suchen…</span>
          <kbd className="rounded-md border border-border bg-surface px-1.5 text-xs font-medium">⌘K</kbd>
        </button>
        <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />

        {/* Draft changes */}
        <Popover>
          <PopoverTrigger className="hidden h-9 items-center gap-2 rounded-full bg-warning-soft px-3.5 text-sm font-medium text-warning transition-colors hover:bg-warning/15 sm:inline-flex">
            <GitBranch className="size-4" />
            {changes.length} Änderungen im Entwurf
          </PopoverTrigger>
          <PopoverContent>
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold">Offene Änderungen</h3>
              <p className="text-sm text-muted">Noch nicht auf der Website sichtbar</p>
            </div>
            <ul className="flex flex-col gap-1 p-2">
              {changes.map((change) => (
                <li key={change.file} className="flex gap-3 rounded-xl px-3 py-2.5">
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-warning" />
                  <span className="flex flex-col">
                    <span className="text-[15px] font-medium">{change.file}</span>
                    <span className="text-sm text-muted">
                      {change.detail} · {change.who}, {change.when}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-border p-4">
              <PublishButton className="w-full" changes={changes.length} />
            </div>
          </PopoverContent>
        </Popover>

        {/* Notifications */}
        <Popover>
          <Tooltip label="Benachrichtigungen">
            <PopoverTrigger
              aria-label="Benachrichtigungen"
              className={buttonStyles({ variant: "ghost", size: "icon", className: "relative" })}
            >
              <Bell strokeWidth={1.75} />
              <span className="absolute top-2.5 right-2.5 size-2 rounded-full border-2 border-surface bg-danger" />
            </PopoverTrigger>
          </Tooltip>
          <PopoverContent>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold">Benachrichtigungen</h3>
              <button type="button" className="text-sm font-medium text-accent hover:underline">
                Alle gelesen
              </button>
            </div>
            <ul className="flex flex-col p-2">
              {notifications.map((n) => (
                <li key={n.title} className="flex gap-3 rounded-xl px-3 py-3 hover:bg-subtle">
                  <span className={`mt-2 size-2 shrink-0 rounded-full ${n.unread ? "bg-accent" : "bg-transparent"}`} />
                  <span className="flex flex-col">
                    <span className="text-[15px]">{n.title}</span>
                    <span className="text-sm text-muted">{n.when}</span>
                  </span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

        <PublishButton changes={changes.length} />
      </div>
    </header>
  );
}

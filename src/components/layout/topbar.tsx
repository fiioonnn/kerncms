"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { DeployStatus } from "@/components/history/deploy-status";
import { refreshStatus, useStatus } from "@/components/history/use-status";
import { PublishButton } from "@/components/actions/publish";
import { useKern } from "@/components/kern/kern-provider";
import { buttonStyles } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/overlay";
import { formatWhen } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { markNotificationsRead } from "@/server/actions/site";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./sidebar";
import { findNavItem } from "./nav";

type Notification = { id: string; kind: string; title: string; href: string | null; createdAt: string; read: boolean };

function Notifications() {
  const status = useStatus();
  const unread = status?.unread ?? 0;
  const [items, setItems] = useState<Notification[] | null>(null);
  const [pending, startTransition] = useTransition();

  async function load() {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    if (res.ok) setItems(await res.json());
  }

  function markAll() {
    startTransition(async () => {
      const result = await markNotificationsRead();
      if (result.ok) {
        setItems((list) => list?.map((n) => ({ ...n, read: true })) ?? null);
        void refreshStatus();
      }
    });
  }

  return (
    <Popover onOpenChange={(open) => open && void load()}>
      <Tooltip label="Benachrichtigungen">
        <PopoverTrigger
          aria-label={unread ? `Benachrichtigungen, ${unread} ungelesen` : "Benachrichtigungen"}
          className={buttonStyles({ variant: "ghost", size: "icon", className: "relative" })}
        >
          <Bell strokeWidth={1.75} />
          {unread > 0 && <span className="absolute top-2.5 right-2.5 size-2 rounded-full border-2 border-surface bg-danger" />}
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">Benachrichtigungen</h3>
          {items?.some((n) => !n.read) && (
            <button type="button" onClick={markAll} disabled={pending} className="text-sm font-medium text-accent hover:underline disabled:opacity-50">
              Alle gelesen
            </button>
          )}
        </div>
        {items === null ? (
          <p className="px-5 py-8 text-center text-[15px] text-muted">Wird geladen…</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-8 text-center text-[15px] text-muted">Keine Benachrichtigungen</p>
        ) : (
          <ul className="flex max-h-96 flex-col overflow-y-auto p-2">
            {items.map((n) => {
              const body = (
                <>
                  <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-accent")} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px]">{n.title}</span>
                    <span suppressHydrationWarning className="text-sm text-muted">{formatWhen(n.createdAt)}</span>
                  </span>
                </>
              );
              return (
                <li key={n.id}>
                  {n.href ? (
                    <Link href={n.href} className="flex gap-3 rounded-xl px-3 py-3 hover:bg-subtle">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex gap-3 rounded-xl px-3 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function Topbar() {
  const pathname = usePathname();
  const kern = useKern();
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
    <header className="@container sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur sm:gap-6 sm:px-8">
      <MobileNav />
      <div className="flex min-w-0 items-center gap-2 text-[15px] whitespace-nowrap">
        <span className="hidden text-muted @5xl:inline">{kern.site.name}</span>
        <span className="hidden text-border-strong @5xl:inline">/</span>
        <span className="truncate font-medium">{current?.label ?? "Übersicht"}</span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
        <Tooltip label="Suchen (⌘K)">
          <button
            type="button"
            aria-label="Suchen"
            onClick={() => setSearchOpen(true)}
            className={buttonStyles({ variant: "ghost", size: "icon", className: "@3xl:hidden" })}
          >
            <Search strokeWidth={1.75} />
          </button>
        </Tooltip>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden h-11 w-52 items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 text-[15px] text-muted transition-colors hover:border-border-strong @3xl:flex @6xl:w-72"
        >
          <Search className="size-5 shrink-0" strokeWidth={1.75} />
          <span className="flex-1 text-left">Suchen…</span>
          <kbd className="rounded-md border border-border bg-surface px-1.5 text-xs font-medium">⌘K</kbd>
        </button>
        <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />

        <DeployStatus />

        <Notifications />

        <PublishButton className="max-sm:px-3.5" />
      </div>
    </header>
  );
}

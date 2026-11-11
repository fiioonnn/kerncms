"use client";

import { usePathname } from "next/navigation";
import { Bell, GitBranch, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { findNavItem } from "./nav";

export function Topbar() {
  const pathname = usePathname();
  const current = findNavItem(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-6 border-b border-border bg-surface/85 px-8 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2 text-[15px]">
        <span className="text-muted">Bäckerei Müller</span>
        <span className="text-border-strong">/</span>
        <span className="truncate font-medium">{current?.label ?? "Übersicht"}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <label className="hidden h-11 w-72 items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 text-muted transition-colors focus-within:border-accent focus-within:bg-surface md:flex">
          <Search className="size-5 shrink-0" strokeWidth={1.75} />
          <input
            type="search"
            aria-label="Suchen"
            placeholder="Suchen…"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted"
          />
          <kbd className="rounded-md border border-border bg-surface px-1.5 text-xs font-medium">⌘K</kbd>
        </label>

        <Badge tone="warning" className="hidden h-9 gap-2 px-3.5 sm:inline-flex">
          <GitBranch className="size-4" />3 Änderungen im Entwurf
        </Badge>

        <Button variant="ghost" size="icon" aria-label="Benachrichtigungen">
          <Bell strokeWidth={1.75} />
        </Button>
        <Button>Veröffentlichen</Button>
      </div>
    </header>
  );
}

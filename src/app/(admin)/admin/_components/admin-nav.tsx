"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { ArrowLeft, Building2, Globe, LayoutDashboard, Menu as MenuIcon, Sparkles, Users, X, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/auth/auth-shell";
import { buttonStyles } from "@/components/ui/button";
import { Avatar, Badge } from "@/components/ui/display";
import { cn } from "@/lib/utils";
import { GithubIcon } from "./github-icon";

type Item = { label: string; href: string; icon: LucideIcon | typeof GithubIcon };

const items: Item[] = [
  { label: "Übersicht", href: "/admin", icon: LayoutDashboard },
  { label: "Kunden", href: "/admin/customers", icon: Building2 },
  { label: "Websites", href: "/admin/sites", icon: Globe },
  { label: "Nutzer", href: "/admin/users", icon: Users },
  { label: "GitHub", href: "/admin/github", icon: GithubIcon },
  { label: "KI-Skill", href: "/admin/skill", icon: Sparkles },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Me = { name: string; email: string };

function NavContent({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <div className="flex h-16 items-center gap-3 px-6">
        <Link href="/admin" onClick={onNavigate} aria-label="kerncms Admin, zur Übersicht" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <Logo />
        </Link>
        <Badge tone="accent" className="h-6 px-2.5 text-xs">
          Admin
        </Badge>
      </div>

      <nav aria-label="Admin" className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-3">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent",
                active ? "bg-accent-soft text-accent" : "text-foreground/80 hover:bg-subtle hover:text-foreground",
              )}
            >
              <item.icon className="size-5 shrink-0" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3 border-t border-border p-4">
        <div className="flex items-center gap-3 px-1">
          <Avatar name={me.name} size="sm" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[15px] font-medium">{me.name}</span>
            <span className="truncate text-sm text-muted">{me.email}</span>
          </span>
        </div>
        <Link href="/" onClick={onNavigate} className={buttonStyles({ variant: "secondary", className: "w-full" })}>
          <ArrowLeft />
          Zurück zum CMS
        </Link>
      </div>
    </>
  );
}

/** Desktop sidebar of the admin area (from 1024 px). */
export function AdminSidebar({ me }: { me: Me }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <NavContent me={me} />
    </aside>
  );
}

/** Top bar with a slide-in drawer for narrow screens. */
export function AdminMobileBar({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
      <BaseDialog.Root open={open} onOpenChange={setOpen}>
        <BaseDialog.Trigger aria-label="Menü öffnen" className={buttonStyles({ variant: "ghost", size: "icon" })}>
          <MenuIcon strokeWidth={1.75} />
        </BaseDialog.Trigger>
        <BaseDialog.Portal>
          <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-backdrop/30 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 lg:hidden" />
          <BaseDialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-3rem))] flex-col bg-surface shadow-popover outline-none transition-transform duration-200 ease-out data-ending-style:-translate-x-full data-starting-style:-translate-x-full lg:hidden">
            <BaseDialog.Title className="sr-only">Admin-Navigation</BaseDialog.Title>
            <BaseDialog.Close aria-label="Menü schließen" className={buttonStyles({ variant: "ghost", size: "icon", className: "absolute top-2.5 right-2.5 size-10" })}>
              <X strokeWidth={1.75} />
            </BaseDialog.Close>
            <NavContent me={me} onNavigate={() => setOpen(false)} />
          </BaseDialog.Popup>
        </BaseDialog.Portal>
      </BaseDialog.Root>
      <Link href="/admin" aria-label="kerncms Admin" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Logo size={28} />
      </Link>
      <Badge tone="accent" className="h-6 px-2.5 text-xs">
        Admin
      </Badge>
    </header>
  );
}

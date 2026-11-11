"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CircleAlert, FolderGit2, Loader2, MousePointerClick, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { formatWhen } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { switchSite } from "@/server/actions/site";
import { GithubIcon } from "./github-icon";

export type CustomerStatus = "active" | "paused" | "archived";

export const customerStatusLabels: Record<CustomerStatus, string> = {
  active: "Aktiv",
  paused: "Pausiert",
  archived: "Archiviert",
};

export const customerStatusItems = (Object.keys(customerStatusLabels) as CustomerStatus[]).map((value) => ({
  value,
  label: customerStatusLabels[value],
}));

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const tone = status === "active" ? "success" : status === "paused" ? "warning" : "neutral";
  return (
    <Badge tone={tone} dot>
      {customerStatusLabels[status]}
    </Badge>
  );
}

type Deploy = { status: string; createdAt: string } | null;

/** Status of the last publish, with its time. */
export function DeployBadge({ deploy }: { deploy: Deploy }) {
  if (!deploy) return <span className="text-[15px] text-muted">Noch nie</span>;
  const tone = deploy.status === "failed" ? "danger" : deploy.status === "running" ? "accent" : "success";
  const label = deploy.status === "failed" ? "Fehlgeschlagen" : deploy.status === "running" ? "Läuft" : "Live";
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone={tone} dot>
        {label}
      </Badge>
      <span suppressHydrationWarning className="text-sm text-muted">{formatWhen(deploy.createdAt)}</span>
    </span>
  );
}

/** Icon plus repository or folder for a site. */
export function SiteSource({ source, githubRepo, repoPath, className }: { source: string; githubRepo: string | null; repoPath: string | null; className?: string }) {
  const github = source === "github";
  return (
    <span className={cn("flex min-w-0 items-center gap-2 text-[15px]", className)}>
      {github ? <GithubIcon className="size-[18px] shrink-0" /> : <FolderGit2 className="size-[18px] shrink-0 text-muted" strokeWidth={1.75} />}
      <span className={cn("truncate", !github && "font-mono text-sm")} title={(github ? githubRepo : repoPath) ?? undefined}>
        {(github ? githubRepo : repoPath) ?? "Unbekannt"}
      </span>
    </span>
  );
}

/** Makes `siteId` the current site of the CMS and goes to its dashboard. */
export function useOpenSite() {
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function open(siteId: string) {
    setOpening(siteId);
    startTransition(async () => {
      const result = await switchSite(siteId);
      if (!result.ok) {
        setOpening(null);
        toast.error("Öffnen fehlgeschlagen", { description: result.error });
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return { open, opening };
}

export function OpenSiteButton({ siteId, variant = "secondary", size = "sm", className }: { siteId: string; variant?: "primary" | "secondary"; size?: "sm" | "md"; className?: string }) {
  const { open, opening } = useOpenSite();
  return (
    <Button variant={variant} size={size} className={className} disabled={opening !== null} onClick={() => open(siteId)}>
      {opening ? <Loader2 className="animate-spin" /> : <MousePointerClick />}
      Im CMS öffnen
    </Button>
  );
}

export function SearchInput({ value, onChange, label, className }: { value: string; onChange: (value: string) => void; label: string; className?: string }) {
  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" strokeWidth={1.75} />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder={label} className="pl-11" />
    </div>
  );
}

export function ErrorNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn("flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-[15px] text-danger", className)}>
      <CircleAlert className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.75} />
      <span>{children}</span>
    </p>
  );
}

export function hostOf(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

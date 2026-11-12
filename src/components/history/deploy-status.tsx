"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, CircleCheck, GitBranch, Loader2, X } from "lucide-react";
import { PendingList, PublishButton } from "@/components/actions/publish";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import type { DeployStep } from "@/db/schema";
import { formatWhen } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { pendingFiles, useStatus } from "./use-status";

function Steps({ steps }: { steps: DeployStep[] }) {
  return (
    <ol className="flex flex-col gap-3 p-5">
      {steps.map((step) => {
        const done = step.status === "done";
        const active = step.status === "running";
        const failed = step.status === "failed";
        return (
          <li key={step.label} className="flex flex-col gap-2">
            <span className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                  done && "border-success bg-success text-white",
                  active && "border-accent text-accent",
                  failed && "border-danger bg-danger text-white",
                  step.status === "pending" && "border-border text-muted",
                )}
              >
                {done ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : active ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : failed ? (
                  <X className="size-4" strokeWidth={3} />
                ) : null}
              </span>
              <span className={cn("text-[15px]", step.status === "pending" && "text-muted", active && "font-medium", failed && "font-medium text-danger")}>
                {step.label}
              </span>
            </span>
            {failed && step.log && (
              <pre className="ml-10 max-h-40 overflow-auto rounded-lg bg-subtle p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {step.log.slice(-1500)}
              </pre>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Topbar pill: open draft changes, or the running / just finished publish. Polls /api/status. */
export function DeployStatus() {
  const status = useStatus();
  const router = useRouter();
  const deploy = status?.deploy ?? null;
  const files = pendingFiles(status);
  const lastStatus = useRef<string | null>(null);

  // Toast once when a running publish finishes.
  useEffect(() => {
    if (!deploy) return;
    const key = `${deploy.id}:${deploy.status}`;
    const before = lastStatus.current;
    lastStatus.current = key;
    if (before === `${deploy.id}:running` && deploy.status !== "running") {
      if (deploy.status === "done") toast.success("Website ist live", { description: deploy.message });
      else toast.error("Veröffentlichen fehlgeschlagen", { description: "Details im Verlauf." });
      router.refresh();
    }
  }, [deploy, router]);

  if (!status) return null;

  const recent = Boolean(deploy?.finishedAt && status.fetchedAt - new Date(deploy.finishedAt).getTime() < 60_000);
  if (deploy && (deploy.status === "running" || recent)) {
    const running = deploy.status === "running";
    const failed = deploy.status === "failed";
    const doneCount = deploy.steps.filter((s) => s.status === "done").length;
    const progress = running ? Math.round(((doneCount + 0.5) / deploy.steps.length) * 100) : 100;
    return (
      <Popover>
        <PopoverTrigger
          className={cn(
            "hidden h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors sm:inline-flex",
            failed ? "bg-danger-soft text-danger" : running ? "bg-accent-soft text-accent" : "bg-success-soft text-success",
          )}
        >
          {failed ? <CircleAlert className="size-4" /> : running ? <Loader2 className="size-4 animate-spin" /> : <CircleCheck className="size-4" />}
          {failed ? "Fehlgeschlagen" : running ? `Wird veröffentlicht · ${progress} %` : "Live"}
        </PopoverTrigger>
        <PopoverContent>
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-base font-semibold">
              {failed ? "Veröffentlichen fehlgeschlagen" : running ? "Veröffentlichung läuft" : "Veröffentlicht"}
            </h3>
            <p suppressHydrationWarning className="truncate text-sm text-muted">
              {deploy.message} · {formatWhen(deploy.createdAt)}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle">
              <div
                className={cn("h-full rounded-full transition-[width] duration-700", failed ? "bg-danger" : running ? "bg-accent" : "bg-success")}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <Steps steps={deploy.steps} />
          <div className="border-t border-border px-5 py-3">
            <Link href="/history" className="text-sm font-medium text-accent hover:underline">
              Alle Veröffentlichungen ansehen
            </Link>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  if (files.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        aria-label={files.length === 1 ? "1 Änderung im Entwurf" : `${files.length} Änderungen im Entwurf`}
        className="hidden h-9 shrink-0 items-center gap-2 rounded-full bg-warning-soft px-3.5 text-sm font-medium whitespace-nowrap text-warning transition-colors hover:bg-warning/15 sm:inline-flex"
      >
        <GitBranch className="size-4" />
        {files.length === 1 ? "1 Änderung" : `${files.length} Änderungen`}
        <span className="hidden @5xl:inline">im Entwurf</span>
      </PopoverTrigger>
      <PopoverContent>
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">Offene Änderungen</h3>
          <p className="text-sm text-muted">Noch nicht auf der Website sichtbar</p>
        </div>
        <div className="p-3">
          <PendingList files={files} max={6} />
        </div>
        <div className="border-t border-border p-4">
          <PublishButton className="w-full" />
        </div>
      </PopoverContent>
    </Popover>
  );
}

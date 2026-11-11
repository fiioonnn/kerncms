"use client";

import Link from "next/link";
import { Check, CircleCheck, GitBranch, Loader2 } from "lucide-react";
import { PublishButton } from "@/components/actions/publish";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { deploySteps, useDeploy } from "@/lib/deploy-store";
import { cn } from "@/lib/utils";

const changes = [
  { file: "Startseite", detail: "Hero-Überschrift geändert", who: "Anna", when: "vor 12 Min." },
  { file: "Neue Sauerteigbrote ab Mai", detail: "Neuer Beitrag", who: "Anna", when: "vor 2 Std." },
  { file: "Navigation", detail: "Menüpunkt hinzugefügt", who: "Jonas", when: "gestern" },
];

function Steps({ current, done }: { current: number; done: boolean }) {
  return (
    <ol className="flex flex-col gap-3 p-5">
      {deploySteps.map((label, i) => {
        const finished = done || i < current;
        const active = !done && i === current;
        return (
          <li key={label} className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                finished && "border-success bg-success text-white",
                active && "border-accent text-accent",
                !finished && !active && "border-border text-muted",
              )}
            >
              {finished ? <Check className="size-4" strokeWidth={3} /> : active ? <Loader2 className="size-4 animate-spin" /> : null}
            </span>
            <span className={cn("text-[15px]", !finished && !active && "text-muted", active && "font-medium")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Topbar pill: open draft changes, or the running/finished publish. */
export function DeployStatus() {
  const deploy = useDeploy();

  if (deploy.status === "running" || deploy.status === "success") {
    const done = deploy.status === "success";
    const progress = done ? 100 : Math.round(((deploy.step + 0.5) / deploySteps.length) * 100);
    return (
      <Popover>
        <PopoverTrigger
          className={cn(
            "hidden h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors sm:inline-flex",
            done ? "bg-success-soft text-success" : "bg-accent-soft text-accent",
          )}
        >
          {done ? <CircleCheck className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
          {done ? "Live" : `Wird veröffentlicht · ${progress} %`}
        </PopoverTrigger>
        <PopoverContent>
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-base font-semibold">{done ? "Veröffentlicht" : "Veröffentlichung läuft"}</h3>
            <p className="text-sm text-muted">
              {deploy.changes} {deploy.changes === 1 ? "Änderung" : "Änderungen"} · gestartet von Anna
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle">
              <div
                className={cn("h-full rounded-full transition-[width] duration-700", done ? "bg-success" : "bg-accent")}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <Steps current={deploy.step} done={done} />
          <div className="border-t border-border px-5 py-3">
            <Link href="/history" className="text-sm font-medium text-accent hover:underline">
              Alle Veröffentlichungen ansehen
            </Link>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
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
  );
}

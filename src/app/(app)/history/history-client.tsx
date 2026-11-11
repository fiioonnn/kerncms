"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Eye, FileTerminal, Filter, Loader2, Undo2 } from "lucide-react";
import { DiffDialog, useFileLabel, type DiffQuery } from "@/components/history/version-history";
import { useCan } from "@/components/kern/kern-provider";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/display";
import { Tooltip } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import type { DeployStep } from "@/db/schema";
import { cn } from "@/lib/utils";
import { discardUnsaved } from "@/server/actions/site";

function FileName({ file, className }: { file: string; className?: string }) {
  const label = useFileLabel()(file);
  return (
    <span className={cn("flex min-w-0 flex-col", className)}>
      <span className="truncate text-[15px] font-medium">{label}</span>
      {label !== file && <span className="truncate font-mono text-sm text-muted">{file}</span>}
    </span>
  );
}

export function FileFilterLabel({ file }: { file: string }) {
  const label = useFileLabel()(file);
  return (
    <span className="flex items-center gap-3">
      <Badge tone="accent">
        <Filter className="size-3.5" />
        {label}
      </Badge>
      <Link href="/history" className="text-sm font-medium text-accent hover:underline">
        Filter entfernen
      </Link>
    </span>
  );
}

/* ---------- Pending changes ---------- */

const statusLabel = { A: "Neu", M: "Geändert", D: "Gelöscht", R: "Umbenannt" } as const;

export function PendingChanges({
  unsaved,
  unpublished,
}: {
  unsaved: string[];
  unpublished: { file: string; status: keyof typeof statusLabel }[];
}) {
  const canEdit = useCan("editor");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [diff, setDiff] = useState<{ file: string; query: DiffQuery; title: string } | null>(null);
  const label = useFileLabel();

  function discard(files: string[]) {
    startTransition(async () => {
      const result = await discardUnsaved(files);
      if (!result.ok) return void toast.error("Verwerfen fehlgeschlagen", { description: result.error });
      toast.success(files.length === 1 ? "Änderung verworfen" : `${files.length} Änderungen verworfen`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col">
      {unsaved.length > 0 && (
        <section className="flex flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-subtle/60 px-6 py-2.5">
            <span className="text-sm font-medium text-muted">Nicht gespeichert</span>
            {canEdit && unsaved.length > 1 && (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm(unsaved)}>
                Alle verwerfen
              </Button>
            )}
          </div>
          {unsaved.map((file) => (
            <div key={file} className="flex items-center gap-4 border-b border-border px-6 py-3 last:border-0">
              <FileName file={file} className="flex-1" />
              <Badge tone="danger" dot>
                Ungespeichert
              </Badge>
              <Tooltip label="Unterschiede ansehen">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Unterschiede in ${file} ansehen`}
                  onClick={() => setDiff({ file, query: { compare: "unsaved" }, title: "Ungespeicherte Änderungen" })}
                >
                  <Eye strokeWidth={1.75} />
                </Button>
              </Tooltip>
              {canEdit && (
                <Button variant="secondary" size="sm" disabled={pending} onClick={() => setConfirm([file])}>
                  <Undo2 strokeWidth={1.75} />
                  Verwerfen
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
      {unpublished.length > 0 && (
        <section className="flex flex-col">
          <div className="border-b border-border bg-subtle/60 px-6 py-2.5 text-sm font-medium text-muted">
            Gespeichert, noch nicht veröffentlicht
          </div>
          {unpublished.map(({ file, status }) => (
            <div key={file} className="flex items-center gap-4 border-b border-border px-6 py-3 last:border-0">
              <FileName file={file} className="flex-1" />
              <Badge tone={status === "D" ? "danger" : status === "A" ? "accent" : "warning"} dot>
                {statusLabel[status] ?? status}
              </Badge>
              <Tooltip label="Unterschied zur Live-Version">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Unterschied von ${file} zur Live-Version ansehen`}
                  onClick={() => setDiff({ file, query: { compare: "live" }, title: "Unterschied zur Live-Version" })}
                >
                  <Eye strokeWidth={1.75} />
                </Button>
              </Tooltip>
            </div>
          ))}
        </section>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.length === 1 ? "Änderung verwerfen?" : `${confirm?.length ?? 0} Änderungen verwerfen?`}
        description={
          confirm?.length === 1
            ? `Alle ungespeicherten Änderungen an ${label(confirm[0])} gehen verloren.`
            : "Alle ungespeicherten Änderungen gehen verloren. Gespeicherte Versionen bleiben erhalten."
        }
        confirmLabel="Verwerfen"
        danger
        onConfirm={() => confirm && discard(confirm)}
      />
      <DiffDialog
        open={diff !== null}
        onOpenChange={(open) => !open && setDiff(null)}
        title={diff?.title ?? ""}
        description={diff ? label(diff.file) : undefined}
        files={diff ? [diff.file] : []}
        query={diff?.query ?? { compare: "unsaved" }}
      />
    </div>
  );
}

/* ---------- One commit ---------- */

export function CommitFiles({ sha, message, files }: { sha: string; message: string; files: string[] }) {
  const [open, setOpen] = useState<string[] | null>(null);
  const label = useFileLabel();
  const shown = files.slice(0, 6);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((file) => (
          <button
            key={file}
            type="button"
            title={file}
            onClick={() => setOpen([file])}
            className="max-w-full truncate rounded-lg bg-subtle px-2.5 py-1 text-left text-sm transition-colors hover:bg-accent-soft hover:text-accent"
          >
            {label(file)}
          </button>
        ))}
        {files.length > shown.length && <span className="text-sm text-muted">+{files.length - shown.length} weitere</span>}
        {files.length > 1 && (
          <button type="button" onClick={() => setOpen(files)} className="px-1 text-sm font-medium text-accent hover:underline">
            Alle Änderungen
          </button>
        )}
      </div>
      <DiffDialog
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
        title={message}
        description={`Version ${sha.slice(0, 7)}`}
        files={open ?? []}
        query={{ sha }}
        restoreSha={sha}
      />
    </>
  );
}

/* ---------- Deploys ---------- */

export function DeployStatusBadge({ status }: { status: "running" | "done" | "failed" }) {
  if (status === "running")
    return (
      <Badge tone="accent">
        <Loader2 className="size-3.5 animate-spin" />
        Läuft
      </Badge>
    );
  return status === "done" ? (
    <Badge tone="success">
      <CircleCheck className="size-3.5" />
      Live
    </Badge>
  ) : (
    <Badge tone="danger">
      <CircleAlert className="size-3.5" />
      Fehlgeschlagen
    </Badge>
  );
}

export function DeployLog({ title, description, steps }: { title: string; description: string; steps: DeployStep[] }) {
  const failed = steps.find((s) => s.status === "failed");
  return (
    <Dialog>
      <DialogTrigger className={buttonStyles({ variant: "secondary", size: "sm" })}>
        <FileTerminal />
        Protokoll
      </DialogTrigger>
      <DialogContent title={title} description={description} size="lg">
        {failed && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-[15px] text-danger">
            Schritt „{failed.label}“ ist fehlgeschlagen. Die Website wurde nicht geändert, die letzte Version bleibt online.
          </div>
        )}
        <ol className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <li key={i} className="flex flex-col gap-2">
              <span className="flex items-center gap-2 text-[15px] font-medium">
                {step.status === "done" && <CircleCheck className="size-4 text-success" />}
                {step.status === "failed" && <CircleAlert className="size-4 text-danger" />}
                {step.status === "running" && <Loader2 className="size-4 animate-spin text-accent" />}
                {step.status === "pending" && <span className="size-4 rounded-full border border-border-strong" />}
                {step.label}
              </span>
              {step.log && (
                <pre className="max-h-80 overflow-auto rounded-xl bg-[#1c1c1f] p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap text-white/85">
                  {step.log}
                </pre>
              )}
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

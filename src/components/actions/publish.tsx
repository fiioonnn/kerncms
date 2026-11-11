"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { useKern, useOptionalKern } from "@/components/kern/kern-provider";
import { pendingFiles, refreshStatus, useStatus } from "@/components/history/use-status";
import { Button, buttonStyles, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import type { KernClientData } from "@/components/kern/kern-provider";
import { discardAllChanges, publish, requestApproval } from "@/server/actions/site";
import { cn } from "@/lib/utils";

const kindLabels = { A: "Neu", M: "Geändert", D: "Gelöscht", R: "Umbenannt", U: "Nicht gespeichert" } as const;

/** Plain-language name for a changed repository file. */
export function describeFile(file: string, kern: Pick<KernClientData, "config" | "pages"> | null) {
  const base = file.split("/").pop() ?? file;
  if (!kern) return { label: base, kind: "Datei" };
  const { config, pages } = kern;
  const under = (dir: string) => file.startsWith(dir.replace(/\/$/, "") + "/");
  if (under(config.pages.path)) {
    const name = base.replace(/\.json$/, "");
    return { label: pages.find((p) => p.name === name)?.title ?? name, kind: "Seite" };
  }
  for (const c of config.collections) {
    if (under(c.path)) return { label: base.replace(/\.(md|json)$/, ""), kind: c.singular };
  }
  const global = config.globals.find((g) => g.path === file);
  if (global) return { label: global.label, kind: "Global" };
  if (under(config.media.dir)) return { label: base, kind: "Medien" };
  if (config.redirects === file) return { label: "Weiterleitungen", kind: "Einstellungen" };
  if (base === "kern.config.yaml") return { label: "Konfiguration", kind: "Einstellungen" };
  return { label: base, kind: "Datei" };
}

/**
 * "Veröffentlichen": lists the pending files and asks for a message, then publishes.
 * When the site requires approval and the user is an editor, it sends a request instead.
 */
export function PublishButton({
  label,
  variant = "primary",
  size = "md",
  className,
  showDone,
}: {
  label?: string;
  /** With nothing to publish, show a quiet "Veröffentlicht ✓" instead of a disabled button. */
  showDone?: boolean;
  /** @deprecated The count now comes from /api/status. */
  changes?: number;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const kern = useKern();
  const router = useRouter();
  const status = useStatus();
  const files = pendingFiles(status);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needsApproval = kern.site.requireApproval && kern.role === "editor";
  const canPublish = kern.role !== "viewer";
  const running = status?.deploy?.status === "running";
  const buttonLabel = label ?? (needsApproval ? "Zur Freigabe senden" : "Veröffentlichen");

  if (!canPublish) return null;

  if (running) {
    return (
      <button type="button" disabled className={buttonStyles({ variant, size, className: cn(className, "disabled:opacity-70") })}>
        <Loader2 className="animate-spin" />
        Wird veröffentlicht…
      </button>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = needsApproval
        ? await requestApproval({ title: message, note })
        : await publish(message);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setMessage("");
      setNote("");
      toast.success(needsApproval ? "Zur Freigabe gesendet" : "Veröffentlichung gestartet", {
        description: needsApproval ? "Ein Admin prüft deine Änderungen." : "Die Website wird jetzt gebaut.",
      });
      void refreshStatus();
      router.refresh();
    });
  }

  const count = files.length;

  if (showDone && status !== null && count === 0) {
    return (
      <span
        role="status"
        className={buttonStyles({
          variant: "secondary",
          size,
          className: cn(className, "pointer-events-none border-success/30 bg-success-soft text-success"),
        })}
      >
        <Check />
        Veröffentlicht
      </span>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) void refreshStatus();
        else setError(null);
      }}
    >
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={status !== null && count === 0}
        onClick={() => setOpen(true)}
        title={status !== null && count === 0 ? "Keine offenen Änderungen" : undefined}
      >
        {needsApproval && <Send />}
        {buttonLabel}
      </Button>
      <DialogContent
        title={needsApproval ? "Zur Freigabe senden" : count === 1 ? "1 Änderung veröffentlichen" : `${count} Änderungen veröffentlichen`}
        description={
          needsApproval
            ? "Ein Admin prüft die Änderungen und stellt sie live."
            : "Die Änderungen werden in den Live-Branch übernommen und die Website wird neu gebaut."
        }
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={pending}>
              Abbrechen
            </DialogClose>
            <Button onClick={submit} disabled={pending || count === 0}>
              {pending && <Loader2 className="animate-spin" />}
              {needsApproval ? "Senden" : "Jetzt veröffentlichen"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <PendingList files={files} />
          <Field>
            <Label>{needsApproval ? "Titel" : "Beschreibung der Änderungen"}</Label>
            <Input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={120} />
            <Description>Erscheint im Verlauf. Optional.</Description>
          </Field>
          {needsApproval && (
            <Field>
              <Label>Hinweis für die Prüfung</Label>
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Compact list of pending files with what kind of content they are. */
export function PendingList({ files, max = 8 }: { files: { file: string; kind: keyof typeof kindLabels }[]; max?: number }) {
  const kern = useOptionalKern();
  if (files.length === 0) return <p className="text-[15px] text-muted">Keine offenen Änderungen.</p>;
  return (
    <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-1.5">
      {files.slice(0, max).map(({ file, kind }) => {
        const d = describeFile(file, kern);
        return (
          <li key={file} className="flex items-center gap-3 rounded-lg px-3 py-2" title={file}>
            <span className={cn("size-2 shrink-0 rounded-full", kind === "D" ? "bg-danger" : kind === "A" ? "bg-success" : "bg-warning")} />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[15px] font-medium">{d.label}</span>
              <span className="truncate text-sm text-muted">{d.kind}</span>
            </span>
            <span className="shrink-0 text-sm text-muted">{kindLabels[kind]}</span>
          </li>
        );
      })}
      {files.length > max && <li className="px-3 py-2 text-sm text-muted">und {files.length - max} weitere</li>}
    </ul>
  );
}

/** Resets the draft to the live site (admins only). */
export function DiscardButton({ className }: { className?: string }) {
  const kern = useKern();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (kern.role !== "admin" && kern.role !== "owner") return null;
  return (
    <ConfirmDialog
      trigger={pending ? "Wird verworfen…" : "Verwerfen"}
      triggerClassName={buttonStyles({ variant: "secondary", className })}
      title="Alle Änderungen verwerfen?"
      description="Der Entwurf wird auf den veröffentlichten Stand zurückgesetzt. Das lässt sich nicht rückgängig machen."
      confirmLabel="Verwerfen"
      danger
      onConfirm={() =>
        startTransition(async () => {
          const result = await discardAllChanges();
          if (!result.ok) toast.error("Verwerfen fehlgeschlagen", { description: result.error });
          else {
            toast.success("Änderungen verworfen");
            void refreshStatus();
            router.refresh();
          }
        })
      }
    />
  );
}

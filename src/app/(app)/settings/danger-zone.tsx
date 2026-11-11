"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { refreshStatus } from "@/components/history/use-status";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/display";
import { Field, Input, Label } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import type { RoleName } from "@/lib/kern-types";
import { disconnectSite, discardAllChanges, leaveSite } from "@/server/actions/site";

function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 py-5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">{title}</span>
        <span className="text-sm text-muted">{description}</span>
      </div>
      {children}
    </div>
  );
}

export function DangerZone({ siteName, role, platformAdmin }: { siteName: string; role: RoleName; platformAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isAdmin = role === "admin" || role === "owner";

  return (
    <Card className="border-danger/30">
      <CardHeader title="Gefahrenzone" description="Diese Aktionen lassen sich nicht rückgängig machen." />
      <CardContent className="flex flex-col divide-y divide-border">
        {isAdmin && (
          <Row title="Alle Änderungen verwerfen" description="Setzt den Entwurf auf den veröffentlichten Stand zurück. Gespeicherte, aber unveröffentlichte Änderungen gehen verloren.">
            <ConfirmDialog
              trigger={pending ? "Wird verworfen…" : "Verwerfen"}
              triggerClassName={buttonStyles({ variant: "secondary" })}
              title="Alle unveröffentlichten Änderungen verwerfen?"
              description="Der Entwurf wird auf den Live-Stand zurückgesetzt. Das lässt sich nicht rückgängig machen."
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
          </Row>
        )}
        <Row title="Website verlassen" description="Du verlierst den Zugriff. Ein Admin kann dich wieder einladen.">
          <ConfirmDialog
            trigger="Verlassen"
            triggerClassName={buttonStyles({ variant: "secondary" })}
            title={`${siteName} verlassen?`}
            description="Du verlierst sofort den Zugriff auf diese Website."
            confirmLabel="Verlassen"
            danger
            onConfirm={() =>
              startTransition(async () => {
                const result = await leaveSite();
                if (result && !result.ok) toast.error("Verlassen fehlgeschlagen", { description: result.error });
              })
            }
          />
        </Row>
        {/* Only the agency (platform admins) can remove a site; customers can't, even as owners. */}
        {platformAdmin && (
          <Row title="Website trennen" description="Entfernt die Website aus kerncms, mit Team, Statistik und Nachrichten. Das Repository selbst bleibt unverändert.">
            <DisconnectDialog siteName={siteName} />
          </Row>
        )}
      </CardContent>
    </Card>
  );
}

function DisconnectDialog({ siteName }: { siteName: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) {
          setValue("");
          setError(null);
        }
      }}
    >
      <Button variant="danger" onClick={() => setOpen(true)}>
        Website trennen
      </Button>
      <DialogContent
        title="Website endgültig trennen?"
        description="Team, Einladungen, Statistik, Formular-Nachrichten und der Entwurf im CMS werden gelöscht. Das Repository bleibt erhalten."
        size="sm"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={pending}>
              Abbrechen
            </DialogClose>
            <Button
              variant="danger"
              disabled={value.trim() !== siteName || pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await disconnectSite(value);
                  if (result && !result.ok) setError(result.error);
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              Trennen
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field>
            <Label>Zur Bestätigung den Namen der Website eingeben</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
          </Field>
          <p className="text-sm text-muted">
            Name: <span className="font-medium text-foreground">{siteName}</span>
          </p>
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

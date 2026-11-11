"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Loader2, RotateCcw, Unplug } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { disconnectGithubApp } from "@/server/actions/admin";
import { GithubIcon } from "../_components/github-icon";

/** Starts GitHub's manifest flow in the same tab (GET /api/github-app/setup). */
export function AppSetupForm({ submitLabel = "App auf GitHub anlegen" }: { submitLabel?: string }) {
  const [name, setName] = useState("kerncms");
  const [org, setOrg] = useState("");
  const [sending, setSending] = useState(false);

  // Coming back from GitHub with the back button restores the page from cache: re-enable the form.
  useEffect(() => {
    const reset = () => setSending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <form method="get" action="/api/github-app/setup" onSubmit={() => setSending(true)} className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field>
          <Label>Name der App</Label>
          <Input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={34} required autoComplete="off" />
          <Description>Muss auf GitHub eindeutig sein, zum Beispiel mit dem Namen der Agentur.</Description>
        </Field>
        <Field>
          <Label>Organisation (optional)</Label>
          <Input name="org" value={org} onChange={(e) => setOrg(e.target.value)} autoComplete="off" spellCheck={false} />
          <Description>Leer lassen, um die App unter deinem persönlichen Konto anzulegen.</Description>
        </Field>
      </div>
      <Button type="submit" className="self-start" disabled={sending || !name.trim()}>
        {sending ? <Loader2 className="animate-spin" /> : <GithubIcon />}
        {submitLabel}
        {!sending && <ArrowRight />}
      </Button>
    </form>
  );
}

export function ResetupButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <RotateCcw />
        Neu einrichten
      </Button>
      <DialogContent
        title="GitHub-App neu einrichten"
        description="Legt eine neue App an und ersetzt die bisherige in kerncms. Verbundene Websites brauchen danach eine Installation der neuen App."
        size="lg"
      >
        <AppSetupForm submitLabel="Neue App auf GitHub anlegen" />
      </DialogContent>
    </Dialog>
  );
}

export function DisconnectButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <ConfirmDialog
      title="GitHub-App trennen?"
      description="kerncms vergisst die Zugangsdaten der App. Die App selbst bleibt auf GitHub bestehen und lässt sich dort löschen. Geht nur, wenn keine GitHub-Website mehr verbunden ist."
      confirmLabel="Trennen"
      danger
      triggerClassName={buttonStyles({ variant: "secondary", className: "text-danger" })}
      trigger={
        <>
          {pending ? <Loader2 className="animate-spin" /> : <Unplug />}
          Trennen
        </>
      }
      onConfirm={() =>
        startTransition(async () => {
          const result = await disconnectGithubApp();
          if (!result.ok) {
            toast.error("Trennen fehlgeschlagen", { description: result.error });
            return;
          }
          toast.success("GitHub-App getrennt");
          router.replace("/admin/github");
        })
      }
    />
  );
}

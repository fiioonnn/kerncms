"use client";

import { useState, useTransition } from "react";
import { Bell, Loader2, Reply } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { TagInput } from "@/components/ui/tag-input";
import { toast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/toggles";
import type { FormDef } from "@/lib/kern-types";
import { saveFormSettings, type FormSettingsInput } from "@/server/actions/forms";

/** E-mail notification for one form: on/off, recipients, subject. */
export function FormSettingsDialog({
  form,
  initial,
  sender,
  open,
  onOpenChange,
  onSaved,
}: {
  form: FormDef;
  initial: FormSettingsInput;
  sender: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (settings: FormSettingsInput) => void;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const placeholders = form.fields.filter((f) => ["text", "email", "select"].includes(f.type));

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveFormSettings(form.key, values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(values.notify ? "Benachrichtigung eingerichtet" : "Benachrichtigung ausgeschaltet");
      onSaved(values);
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
        if (next) {
          setValues(initial);
          setError(null);
        }
      }}
    >
      <DialogContent
        title={`Benachrichtigung · ${form.label}`}
        description="Bei jeder neuen Nachricht kommt eine E-Mail. Die Nachricht steht außerdem immer hier im CMS."
        size="lg"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={pending}>
              Abbrechen
            </DialogClose>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Speichern
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <Switch
            label="Per E-Mail benachrichtigen"
            description="Schickt jede neue Nachricht an die Empfänger unten."
            checked={values.notify}
            onCheckedChange={(notify) => setValues((v) => ({ ...v, notify }))}
          />

          <div className={values.notify ? "flex flex-col gap-6" : "pointer-events-none flex flex-col gap-6 opacity-50"} aria-disabled={!values.notify}>
            <TagInput
              key={open ? "open" : "closed"}
              label="Empfänger"
              description="E-Mail-Adressen, mit Enter bestätigen. Zum Beispiel die Adresse des Kunden."
              defaultValue={values.recipients}
              onValueChange={(recipients) => setValues((v) => ({ ...v, recipients }))}
            />

            <Field>
              <Label>Betreff</Label>
              <Input value={values.subject} onChange={(e) => setValues((v) => ({ ...v, subject: e.target.value }))} />
              <Description>
                Leer lassen für „Anfrage über das {form.label}“. Platzhalter setzen Feldinhalte ein:
              </Description>
              {placeholders.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {placeholders.map((f) => (
                    <button
                      key={f.name}
                      type="button"
                      onClick={() => setValues((v) => ({ ...v, subject: `${v.subject}${v.subject && !v.subject.endsWith(" ") ? " " : ""}{${f.name}}` }))}
                      className="rounded-md bg-subtle px-2 py-1 font-mono text-xs text-foreground transition-colors outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-accent"
                      title={f.label}
                    >
                      {`{${f.name}}`}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <div className="flex flex-col gap-3 rounded-xl border border-border bg-subtle/50 p-4 text-sm">
              <p className="flex items-start gap-2.5">
                <Bell className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.75} />
                <span>
                  <span className="text-muted">Absender: </span>
                  <span className="font-medium break-all">{sender.replace(/"/g, "")}</span>
                </span>
              </p>
              <p className="flex items-start gap-2.5">
                <Reply className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.75} />
                <span className="text-muted">
                  Die Mail enthält einen Button „Antworten an …“. Er öffnet eine neue Mail an den Besucher im eigenen Mailprogramm, ohne die Benachrichtigung zu zitieren.
                </span>
              </p>
            </div>
          </div>

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

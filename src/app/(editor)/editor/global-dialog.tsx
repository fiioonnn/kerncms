"use client";

import { useEffect, useState, useTransition } from "react";
import { Globe, Loader2 } from "lucide-react";
import { Fields } from "@/components/kern/field-renderer";
import { useKern } from "@/components/kern/kern-provider";
import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { EntryValues } from "@/lib/kern-types";
import { loadGlobal, saveGlobal } from "@/server/actions/content";

/**
 * Edits a global (logo, navigation, footer, …) right from the preview.
 * `target` is the marker from the page, e.g. "site#logoText".
 */
export function GlobalDialog({ target, onClose, canEdit }: { target: string | null; onClose: () => void; canEdit: boolean }) {
  const { config } = useKern();
  const [key, path] = (target ?? "").split("#");
  const global = config.globals.find((g) => g.key === key);
  const fieldName = path?.split(".")[0];
  const [values, setValues] = useState<EntryValues | null>(null);
  const [initial, setInitial] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = values !== null && JSON.stringify(values) !== initial;

  useEffect(() => {
    if (!target || !global) return;
    let cancelled = false;
    void loadGlobal(global.key).then((result) => {
      if (cancelled) return;
      if (!result.ok) return setLoadError(result.error);
      setValues(result.data.values);
      setInitial(JSON.stringify(result.data.values));
    });
    return () => {
      cancelled = true;
      setValues(null);
      setErrors({});
      setLoadError(null);
    };
  }, [target, global]);

  // Scroll the clicked field into view once the form is there.
  useEffect(() => {
    if (!values || !fieldName) return;
    const el = document.querySelector(`[data-global-field="${CSS.escape(fieldName)}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [values, fieldName]);

  function save() {
    if (!global || !values) return;
    startTransition(async () => {
      const result = await saveGlobal(global.key, values);
      if (!result.ok) {
        setErrors(result.errors ?? {});
        toast.error("Speichern fehlgeschlagen", { description: result.error });
        return;
      }
      toast.success(`${global.label} gespeichert`, { description: "Die Änderung gilt auf allen Seiten." });
      onClose();
    });
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent
        title={global ? global.label : "Globaler Inhalt"}
        description={
          global
            ? `${global.description ? `${global.description}. ` : ""}Gilt auf allen Seiten der Website.`
            : "Dieser Bereich ist in der Konfiguration nicht beschrieben."
        }
        size="lg"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={pending}>
              {canEdit ? "Abbrechen" : "Schließen"}
            </DialogClose>
            {canEdit && global && (
              <Button onClick={save} disabled={!dirty || pending}>
                {pending && <Loader2 className="animate-spin" />}
                Speichern
              </Button>
            )}
          </>
        }
      >
        {!global ? (
          <p className="flex items-center gap-2 text-[15px] text-muted">
            <Globe className="size-5" strokeWidth={1.75} />
            Für „{key}“ gibt es keinen Eintrag unter globals in kern.config.yaml.
          </p>
        ) : loadError ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
            {loadError}
          </p>
        ) : values === null ? (
          <div className="flex flex-col gap-5">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <fieldset disabled={!canEdit} className="flex flex-col gap-6">
            {global.fields.map((field) => (
              <div
                key={field.name}
                data-global-field={field.name}
                className={field.name === fieldName ? "-mx-3 rounded-xl bg-accent-soft/50 p-3 ring-1 ring-accent/30" : undefined}
              >
                <Fields
                  fields={[field]}
                  values={values}
                  errors={errors}
                  onChange={(name, value) => setValues((v) => ({ ...(v ?? {}), [name]: value }))}
                />
              </div>
            ))}
          </fieldset>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { BarChart3, ExternalLink, Globe, Loader2, ShieldCheck, Type, UserSearch, type LucideIcon } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/toggles";
import { updateSiteSettings } from "@/server/actions/site";
import { cn } from "@/lib/utils";
import { SettingsRow, SettingsSection } from "./settings-ui";

type Values = { name: string; liveUrl: string; requireApproval: boolean; analyticsEnabled: boolean; analyticsPersonal: boolean };

function ToggleRow({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-6 py-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </div>
  );
}

export function GeneralSettings({ initial, canEdit }: { initial: Values; canEdit: boolean }) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameId = useId();
  const urlId = useId();
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));
  const urlInvalid = Boolean(error && /Adresse/.test(error));
  const validUrl = /^https?:\/\/\S+\.\S+/.test(values.liveUrl);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateSiteSettings(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(values);
      toast.success("Einstellungen gespeichert");
    });
  }

  return (
    <form
      className="flex flex-col gap-6 pb-24"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {!canEdit && (
        <p className="rounded-xl border border-border bg-subtle/60 px-4 py-3 text-[15px] text-muted">
          Nur Admins und Inhaber können diese Einstellungen ändern.
        </p>
      )}

      <SettingsSection title="Website" description="Wie die Website im CMS heißt und wo sie live erreichbar ist.">
        <SettingsRow icon={Type} label="Name" htmlFor={nameId} description="Erscheint in der Seitenleiste, in Mails und im Website-Wechsler.">
          <Input id={nameId} value={values.name} onChange={(e) => set({ name: e.target.value })} disabled={!canEdit} />
        </SettingsRow>
        <SettingsRow
          icon={Globe}
          label="Live-Adresse"
          htmlFor={urlId}
          description="Die öffentliche Adresse, beginnend mit https://. Für „Live ansehen“ und die Statistik."
        >
          <div className="flex gap-2">
            <Input
              id={urlId}
              type="url"
              value={values.liveUrl}
              onChange={(e) => set({ liveUrl: e.target.value })}
              disabled={!canEdit}
              aria-invalid={urlInvalid || undefined}
              className={cn("min-w-0 flex-1", urlInvalid && "border-danger")}
            />
            <a
              href={validUrl ? values.liveUrl : undefined}
              target="_blank"
              rel="noreferrer"
              aria-label="Live-Adresse öffnen"
              aria-disabled={!validUrl}
              className={buttonStyles({ variant: "secondary", size: "icon", className: cn("size-11 shrink-0", !validUrl && "pointer-events-none opacity-40") })}
            >
              <ExternalLink />
            </a>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Veröffentlichung und Statistik" description="Wer Änderungen live schalten darf und was die Website misst.">
        <ToggleRow icon={ShieldCheck}>
          <Switch
            label="Freigabe erforderlich"
            description="Änderungen von Redakteuren muss ein Admin freigeben, bevor sie live gehen."
            checked={values.requireApproval}
            onCheckedChange={(checked) => set({ requireApproval: checked })}
            disabled={!canEdit}
          />
        </ToggleRow>
        <ToggleRow icon={BarChart3}>
          <Switch
            label="Besucherstatistik erfassen"
            description="Zählt Besucher, Seitenaufrufe, Herkunft, Verweildauer und Klicks. Ohne Cookies."
            checked={values.analyticsEnabled}
            onCheckedChange={(checked) => set({ analyticsEnabled: checked })}
            disabled={!canEdit}
          />
        </ToggleRow>
        <ToggleRow icon={UserSearch}>
          <Switch
            label="Personenbezogene Statistik"
            description="Speichert zusätzlich IP-Adresse und Browser-Kennung und erkennt wiederkehrende Besucher. Nur einschalten, wenn die Besucher schriftlich eingewilligt haben."
            checked={values.analyticsEnabled && values.analyticsPersonal}
            onCheckedChange={(checked) => set({ analyticsPersonal: checked })}
            disabled={!canEdit || !values.analyticsEnabled}
          />
        </ToggleRow>
      </SettingsSection>

      {error && !urlInvalid && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
          {error}
        </p>
      )}

      {/* Floating save bar, only while there are changes. */}
      {canEdit && (dirty || pending) && (
        <div
          role="region"
          aria-label="Ungespeicherte Änderungen"
          className="fixed bottom-6 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-2 pl-5 shadow-popover lg:left-[calc(50%+9rem)]"
        >
          <span className="mr-2 flex items-center gap-2 text-[15px] font-medium whitespace-nowrap">
            <span className="size-2 rounded-full bg-warning" />
            {urlInvalid ? <span className="text-danger">{error}</span> : "Ungespeicherte Änderungen"}
          </span>
          <Button variant="ghost" size="sm" type="button" onClick={() => (setValues(saved), setError(null))} disabled={pending}>
            Zurücksetzen
          </Button>
          <Button size="sm" type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Speichern
          </Button>
        </div>
      )}
    </form>
  );
}

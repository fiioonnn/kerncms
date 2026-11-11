"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/display";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/toggles";
import { updateSiteSettings } from "@/server/actions/site";

type Values = { name: string; liveUrl: string; requireApproval: boolean; analyticsEnabled: boolean };

export function GeneralSettings({ initial, canEdit }: { initial: Values; canEdit: boolean }) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

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
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Card>
        <CardHeader title="Website" description="So erscheint die Website im CMS." />
        <CardContent className="flex flex-col gap-6">
          <Field>
            <Label>Name</Label>
            <Input value={values.name} onChange={(e) => set({ name: e.target.value })} disabled={!canEdit} />
          </Field>
          <Field invalid={Boolean(error && /Adresse/.test(error))}>
            <Label>Live-Adresse</Label>
            <Input type="url" value={values.liveUrl} onChange={(e) => set({ liveUrl: e.target.value })} disabled={!canEdit} />
            <Description>Die öffentliche Adresse der Website, beginnend mit https://.</Description>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Veröffentlichung und Statistik" />
        <CardContent className="flex flex-col gap-7">
          <Switch
            label="Freigabe erforderlich"
            description="Änderungen von Redakteuren muss ein Admin freigeben, bevor sie live gehen."
            checked={values.requireApproval}
            onCheckedChange={(checked) => set({ requireApproval: checked })}
            disabled={!canEdit}
          />
          <Switch
            label="Besucherstatistik erfassen"
            description="Zählt Besucher und Seitenaufrufe ohne Cookies und ohne IP-Adressen zu speichern."
            checked={values.analyticsEnabled}
            onCheckedChange={(checked) => set({ analyticsEnabled: checked })}
            disabled={!canEdit}
          />
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
          {error}
        </p>
      )}
      {canEdit ? (
        <div className="flex justify-end gap-3">
          {dirty && (
            <Button variant="secondary" type="button" onClick={() => setValues(saved)} disabled={pending}>
              Zurücksetzen
            </Button>
          )}
          <Button type="submit" disabled={!dirty || pending}>
            {pending && <Loader2 className="animate-spin" />}
            Speichern
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">Nur Admins und Inhaber können diese Einstellungen ändern.</p>
      )}
    </form>
  );
}

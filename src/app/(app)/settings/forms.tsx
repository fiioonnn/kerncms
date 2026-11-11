"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, Inbox, Loader2, Mail, Reply, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/field";
import { TagInput } from "@/components/ui/tag-input";
import { toast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/toggles";
import { builtinVariables, fillTemplate, notificationSubject, replyMailto } from "@/lib/form-template";
import type { FormDef } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { saveFormSettings, type FormSettingsInput } from "@/server/actions/forms";
import { SettingsRow, SettingsSection } from "./settings-ui";

/** Per form: e-mail notification and the prefilled "Per Mail antworten" mail. */
export function FormsSettings({
  forms,
  settings,
  sender,
  siteName,
  canEdit,
}: {
  forms: FormDef[];
  settings: Record<string, FormSettingsInput>;
  sender: string;
  siteName: string;
  canEdit: boolean;
}) {
  // Jump to the form the user came from (/settings?tab=forms#form-kontakt).
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  if (forms.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Inbox}
          title="Keine Formulare eingerichtet"
          description="Formulare werden in der kern.config.yaml der Website unter „forms“ beschrieben."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {forms.map((form) => (
        <FormSection
          key={form.key}
          form={form}
          initial={settings[form.key] ?? { notify: false, recipients: [], subject: "", replySubject: "", replyBody: "" }}
          sender={sender}
          siteName={siteName}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

/** Example values so the preview reads like a real request. */
function sampleData(form: FormDef) {
  const data: Record<string, string> = {};
  for (const f of form.fields) {
    if (f.type === "email") data[f.name] = "erika@example.com";
    else if (f.type === "boolean") data[f.name] = "true";
    else if (f.type === "select") data[f.name] = f.options?.[0]?.value ?? "";
    else if (/name/i.test(f.name)) data[f.name] = "Erika Muster";
    else if (f.type === "textarea") data[f.name] = "Wir brauchen ein Frühstücksbuffet für 20 Personen.";
    else data[f.name] = f.label.replace(/[.:]\s*$/, "");
  }
  return data;
}

function FormSection({
  form,
  initial,
  sender,
  siteName,
  canEdit,
}: {
  form: FormDef;
  initial: FormSettingsInput;
  sender: string;
  siteName: string;
  canEdit: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [tagKey, setTagKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const set = (patch: Partial<FormSettingsInput>) => setValues((v) => ({ ...v, ...patch }));

  const fieldVariables = form.fields.filter((f) => f.type !== "boolean").map((f) => ({ name: f.name, label: f.label.replace(/[.:]\s*$/, "") }));
  const variables = [...fieldVariables, ...builtinVariables];
  const sample = { form, data: sampleData(form), siteName };
  const hasEmailField = form.fields.some((f) => f.type === "email");

  function save() {
    startTransition(async () => {
      const result = await saveFormSettings(form.key, values);
      if (!result.ok) {
        toast.error("Nicht gespeichert", { description: result.error });
        return;
      }
      setSaved(values);
      toast.success(`${form.label} gespeichert`);
    });
  }

  function reset() {
    setValues(saved);
    setTagKey((k) => k + 1);
  }

  const previewHref = replyMailto(sample, values);

  return (
    <div id={`form-${form.key}`} className="scroll-mt-28">
      <SettingsSection
        title={form.label}
        description={`${form.fields.length} Felder · Schlüssel „${form.key}“`}
        action={
          canEdit && dirty ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={reset} disabled={pending}>
                Verwerfen
              </Button>
              <Button size="sm" onClick={save} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Speichern
              </Button>
            </div>
          ) : null
        }
      >
        <fieldset disabled={!canEdit} className="contents">
          {/* Notification */}
          <SettingsRow icon={Bell} label="Benachrichtigung" description={`Jede neue Nachricht per E-Mail. Absender: ${sender.replace(/"/g, "")}`} compact>
            <Switch label="Per E-Mail benachrichtigen" checked={values.notify} onCheckedChange={(notify) => set({ notify })} disabled={!canEdit} className="[&>span:first-child]:sr-only" />
          </SettingsRow>
          <div className={cn("divide-y divide-border", !values.notify && "pointer-events-none opacity-50")} aria-disabled={!values.notify}>
            <SettingsRow icon={Mail} label="Empfänger" description="Mit Enter bestätigen, höchstens 10 Adressen.">
              <TagInput key={tagKey} defaultValue={values.recipients} onValueChange={(recipients) => set({ recipients })} />
            </SettingsRow>
            <SettingsRow label="Betreff der Benachrichtigung" description={`Leer lassen für „Anfrage über das ${form.label}“.`} stacked>
              <TemplateField value={values.subject} onChange={(subject) => set({ subject })} variables={fieldVariables} preview={notificationSubject(values.subject, sample)} />
            </SettingsRow>
          </div>

          {/* Reply template */}
          <SettingsRow
            icon={Reply}
            label="Vorlage für „Per Mail antworten“"
            description={
              hasEmailField
                ? "So öffnet sich die Antwort im Mailprogramm, im CMS und in der Benachrichtigung. Platzhalter werden mit den Angaben aus dem Formular gefüllt."
                : "Dieses Formular hat kein E-Mail-Feld. Ohne Adresse des Besuchers gibt es keinen Antworten-Button."
            }
            stacked
          >
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Betreff</span>
                <TemplateField
                  value={values.replySubject}
                  onChange={(replySubject) => set({ replySubject })}
                  variables={variables}
                  preview={fillTemplate(values.replySubject, sample, { singleLine: true }) || `Re: ${notificationSubject(values.subject, sample)}`}
                  hint="Leer lassen für „Re:“ und den Betreff der Benachrichtigung."
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Text</span>
                <TemplateField
                  multiline
                  value={values.replyBody}
                  onChange={(replyBody) => set({ replyBody })}
                  variables={variables}
                  placeholderHint
                />
              </div>
              <ReplyPreview
                to="erika@example.com"
                subject={fillTemplate(values.replySubject, sample, { singleLine: true }) || `Re: ${notificationSubject(values.subject, sample)}`}
                body={fillTemplate(values.replyBody, sample)}
                href={previewHref}
              />
            </div>
          </SettingsRow>
        </fieldset>
      </SettingsSection>
    </div>
  );
}

/** Input or textarea with clickable {platzhalter} chips that insert at the cursor. */
function TemplateField({
  value,
  onChange,
  variables,
  preview,
  hint,
  multiline,
  placeholderHint,
}: {
  value: string;
  onChange: (value: string) => void;
  variables: { name: string; label: string }[];
  preview?: string;
  hint?: string;
  multiline?: boolean;
  placeholderHint?: boolean;
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  function insert(name: string) {
    const el = ref.current;
    const token = `{${name}}`;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {multiline ? (
        <Textarea ref={ref} rows={7} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Text der Antwort" />
      ) : (
        <Input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Betreff" />
      )}
      {placeholderHint && !value && (
        <p className="text-sm text-muted">Leer lassen, dann öffnet sich eine leere Mail. Zum Beispiel: „Hallo {"{name}"}, vielen Dank für Ihre Anfrage …“</p>
      )}
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm text-muted">Einfügen:</span>
        {variables.map((v) => (
          <button
            key={v.name}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(v.name)}
            title={v.label}
            className="rounded-md bg-subtle px-2 py-1 font-mono text-xs text-foreground transition-colors outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            {`{${v.name}}`}
          </button>
        ))}
      </div>
      {preview !== undefined && value && (
        <p className="text-sm text-muted">
          Beispiel: <span className="text-foreground">{preview}</span>
        </p>
      )}
    </div>
  );
}

function ReplyPreview({ to, subject, body, href }: { to: string; subject: string; body: string; href: string | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-subtle/60 px-4 py-2.5">
        <span className="text-sm font-medium text-muted">Vorschau mit Beispieldaten</span>
        {href && (
          <a href={href} className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
            <Send className="size-3.5" />
            Im Mailprogramm testen
          </a>
        )}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
        <dt className="text-muted">An</dt>
        <dd>{to}</dd>
        <dt className="text-muted">Betreff</dt>
        <dd className="font-medium">{subject}</dd>
      </dl>
      <div className={cn("border-t border-border px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap", !body && "text-muted italic")}>
        {body || "Leere Nachricht"}
      </div>
    </div>
  );
}

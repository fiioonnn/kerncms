"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Braces, ChevronDown, Inbox, Loader2, Mail, Reply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { TagInput } from "@/components/ui/tag-input";
import { toast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/toggles";
import { builtinVariables, cleanLabel, fillTemplate, notificationSubject } from "@/lib/form-template";
import type { FormDef } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { saveFormSettings, type FormSettingsInput } from "@/server/actions/forms";

type Variable = { name: string; label: string };

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
        <FormCard
          key={form.key}
          form={form}
          initial={settings[form.key] ?? { notify: false, recipients: [], subject: "", replySubject: "", replyBody: "" }}
          sender={sender.replace(/"/g, "")}
          siteName={siteName}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

/** Example values so previews read like a real request. */
function sampleData(form: FormDef) {
  const data: Record<string, string> = {};
  for (const f of form.fields) {
    if (f.type === "email") data[f.name] = "erika@example.com";
    else if (f.type === "boolean") data[f.name] = "true";
    else if (f.type === "select") data[f.name] = f.options?.[0]?.value ?? "";
    else if (/name/i.test(f.name)) data[f.name] = "Erika Muster";
    else if (f.type === "textarea") data[f.name] = "Wir brauchen ein Frühstücksbuffet für 20 Personen.";
    else data[f.name] = cleanLabel(f.label);
  }
  return data;
}

function FormCard({
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
  const [replyOpen, setReplyOpen] = useState(Boolean(initial.replySubject || initial.replyBody));
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const set = (patch: Partial<FormSettingsInput>) => setValues((v) => ({ ...v, ...patch }));

  const fieldVariables: Variable[] = form.fields.filter((f) => f.type !== "boolean").map((f) => ({ name: f.name, label: cleanLabel(f.label) }));
  const sample = { form, data: sampleData(form), siteName };
  const hasEmailField = form.fields.some((f) => f.type === "email");
  const notifySubject = notificationSubject(values.subject, sample);
  const replySubject = fillTemplate(values.replySubject, sample, { singleLine: true }) || `Re: ${notifySubject}`;
  const replyBody = fillTemplate(values.replyBody, sample);

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

  return (
    <section id={`form-${form.key}`} className="scroll-mt-28 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <fieldset disabled={!canEdit || pending} className="contents">
        {/* Header: name and the main switch */}
        <header className="flex items-center gap-4 px-6 py-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Mail className="size-5" strokeWidth={1.75} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="truncate text-lg font-semibold tracking-tight">{form.label}</h2>
            <p className="text-sm text-muted">{values.notify ? "Neue Nachrichten kommen per E-Mail" : "Nachrichten nur im CMS"}</p>
          </div>
          <Switch
            label="Per E-Mail benachrichtigen"
            checked={values.notify}
            onCheckedChange={(notify) => set({ notify })}
            disabled={!canEdit}
            className="[&>span:first-child]:sr-only"
          />
        </header>

        {/* Notification */}
        {values.notify && (
          <div className="flex flex-col gap-6 border-t border-border px-6 py-5">
            <TagInput
              key={tagKey}
              label="Empfänger"
              description="Jede neue Nachricht geht an diese Adressen. Adresse eintippen und Enter drücken."
              defaultValue={values.recipients}
              onValueChange={(recipients) => set({ recipients })}
            />
            <TemplateInput
              label="Betreff der Benachrichtigung"
              value={values.subject}
              onChange={(subject) => set({ subject })}
              variables={fieldVariables}
              example={notifySubject}
              hint={`Leer lassen für „${notifySubject}“. Über „Platzhalter“ kommen Angaben aus dem Formular in den Betreff, z. B. der Name.`}
            />
            <div className="flex flex-col gap-1 rounded-xl bg-subtle px-4 py-3 text-sm">
              <span className="text-muted">
                Absender: <span className="text-foreground">{sender}</span>
              </span>
              <span className="text-muted">
                {hasEmailField
                  ? "Nicht auf die Benachrichtigung antworten, sie kommt von kerncms. Jede Mail hat einen Knopf „Antworten an …“, der eine neue Mail an den Besucher öffnet."
                  : "Die Mail kommt von kerncms. Das Formular hat kein E-Mail-Feld, deshalb gibt es keinen Knopf zum Antworten."}
              </span>
            </div>
          </div>
        )}

        {/* Reply template, collapsed until needed */}
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setReplyOpen((o) => !o)}
            aria-expanded={replyOpen}
            className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors outline-none hover:bg-subtle/50 focus-visible:bg-subtle/50"
          >
            <Reply className="size-4 shrink-0 text-muted" strokeWidth={2} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-medium">Antwort-Vorlage</span>
              <span className="truncate text-sm text-muted">
                {!hasEmailField
                  ? "Ohne E-Mail-Feld im Formular gibt es keinen Antworten-Button."
                  : values.replySubject || values.replyBody
                    ? `„${replySubject}“`
                    : "Optional: Text, der beim Klick auf „Antworten an …“ schon in der neuen Mail steht"}
              </span>
            </span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", replyOpen && "rotate-180")} />
          </button>

          {replyOpen && (
            <div className="grid gap-6 px-6 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
              <div className="flex min-w-0 flex-col gap-5">
                <TemplateInput
                  label="Betreff"
                  value={values.replySubject}
                  onChange={(replySubject) => set({ replySubject })}
                  variables={[...fieldVariables, ...builtinVariables]}
                  hint="Leer: „Re:“ + Betreff der Benachrichtigung"
                />
                <TemplateInput
                  multiline
                  label="Text"
                  value={values.replyBody}
                  onChange={(replyBody) => set({ replyBody })}
                  variables={[...fieldVariables, ...builtinVariables]}
                  hint="Leer: die Mail öffnet sich ohne Text"
                />
              </div>
              <MailPreview subject={replySubject} body={replyBody} />
            </div>
          )}
        </div>

        {/* Save bar, only when something changed */}
        {canEdit && dirty && (
          <div className="flex items-center justify-end gap-3 border-t border-border bg-subtle/50 px-6 py-3">
            <span className="mr-auto text-sm text-muted">Ungespeicherte Änderungen</span>
            <Button variant="ghost" size="sm" onClick={reset}>
              Verwerfen
            </Button>
            <Button size="sm" onClick={save}>
              {pending && <Loader2 className="animate-spin" />}
              Speichern
            </Button>
          </div>
        )}
      </fieldset>
    </section>
  );
}

/** Input or textarea with a "Platzhalter" menu that inserts {feld} at the cursor. */
function TemplateInput({
  label,
  value,
  onChange,
  variables,
  example,
  hint,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  variables: readonly Variable[];
  example?: string;
  hint?: string;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const fields = variables.filter((v) => !builtinVariables.some((b) => b.name === v.name));
  const builtins = variables.filter((v) => builtinVariables.some((b) => b.name === v.name));

  function insert(name: string) {
    const el = ref.current;
    const token = `{${name}}`;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-medium">{label}</span>
        <Menu>
          <MenuTrigger className="-my-1 flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-muted transition-colors outline-none hover:bg-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent data-popup-open:bg-subtle">
            <Braces className="size-3.5" />
            Platzhalter
          </MenuTrigger>
          <MenuContent className="w-72">
            <MenuLabel>Aus dem Formular</MenuLabel>
            {fields.map((v) => (
              <MenuItem key={v.name} onClick={() => insert(v.name)}>
                <span className="flex-1 truncate">{v.label}</span>
                <span className="font-mono text-xs text-muted">{`{${v.name}}`}</span>
              </MenuItem>
            ))}
            {builtins.length > 0 && (
              <>
                <MenuSeparator />
                <MenuLabel>Allgemein</MenuLabel>
                {builtins.map((v) => (
                  <MenuItem key={v.name} onClick={() => insert(v.name)}>
                    <span className="flex-1 truncate">{v.label}</span>
                    <span className="font-mono text-xs text-muted">{`{${v.name}}`}</span>
                  </MenuItem>
                ))}
              </>
            )}
          </MenuContent>
        </Menu>
      </div>
      {multiline ? (
        <Textarea ref={ref} rows={6} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      ) : (
        <Input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      )}
      {value && example ? (
        <p className="truncate text-sm text-muted">
          Wird zu: <span className="text-foreground">{example}</span>
        </p>
      ) : !value && hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function MailPreview({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-medium">Vorschau</span>
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-subtle/40">
        <div className="flex flex-col gap-0.5 border-b border-border px-4 py-3 text-sm">
          <span className="text-muted">An: erika@example.com</span>
          <span className="truncate font-medium">{subject}</span>
        </div>
        <p className={cn("flex-1 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap", !body && "text-muted italic")}>{body || "Leere Nachricht"}</p>
      </div>
    </div>
  );
}

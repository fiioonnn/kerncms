"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { KeyRound, Loader2, Save, Trash2 } from "lucide-react";
import type { AiAccess, AiProvider } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/display";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/toggles";
import { availableModels, removeAiKey, saveAiSettings, setAssistantEnabled } from "@/server/actions/assistant";

const providerItems = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI" },
];

const accessItems = [
  { value: "app_admin", label: "Nur App-Admins" },
  { value: "owner", label: "Ab Inhaber der Website" },
  { value: "admin", label: "Ab Admin der Website" },
  { value: "editor", label: "Ab Redakteur" },
];

export function AiSettingsForm({
  initial,
  keyHints,
  defaults,
  enabled: initialEnabled,
}: {
  initial: { provider: AiProvider; model: string; access: AiAccess };
  enabled: boolean;
  keyHints: Record<AiProvider, string | null>;
  defaults: Record<AiProvider, string>;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [toggling, startToggle] = useTransition();
  const [provider, setProvider] = useState<AiProvider>(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [access, setAccess] = useState<AiAccess>(initial.access);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(Boolean(keyHints[initial.provider]));
  const [saving, startSave] = useTransition();
  const [removing, startRemove] = useTransition();
  const hint = keyHints[provider];

  const showModels = (result: Awaited<ReturnType<typeof availableModels>>) => {
    setLoadingModels(false);
    setModels(result.ok ? result.data : null);
    setModelsError(result.ok ? null : result.error);
  };

  /** Models of the stored key (empty `typed`) or of a key typed in but not saved yet. */
  const loadModels = (target: AiProvider, typed: string) => {
    if (!typed.trim() && !keyHints[target]) {
      setModels(null);
      setModelsError(null);
      return;
    }
    setLoadingModels(true);
    void availableModels(target, typed).then(showModels);
  };

  // Models of the stored key when the page opens.
  const initialProvider = initial.provider;
  const initialHint = keyHints[initialProvider];
  useEffect(() => {
    if (initialHint) void availableModels(initialProvider, "").then(showModels);
  }, [initialProvider, initialHint]);

  const modelItems = (models ?? []).map((id) => ({ value: id, label: id }));
  if (!modelItems.some((m) => m.value === model)) modelItems.unshift({ value: model, label: model });

  const save = () =>
    startSave(async () => {
      const result = await saveAiSettings({ provider, model, access, apiKey });
      if (!result.ok) {
        toast.error("Nicht gespeichert", { description: result.error });
        return;
      }
      setApiKey("");
      toast.success("Einstellungen gespeichert");
      router.refresh();
    });

  const remove = () =>
    startRemove(async () => {
      const result = await removeAiKey(provider);
      if (!result.ok) {
        toast.error("Schlüssel nicht entfernt", { description: result.error });
        return;
      }
      toast.success("Schlüssel entfernt");
      router.refresh();
    });

  const toggle = (next: boolean) => {
    setEnabled(next);
    startToggle(async () => {
      const result = await setAssistantEnabled(next);
      if (!result.ok) {
        setEnabled(!next);
        toast.error("Nicht gespeichert", { description: result.error });
        return;
      }
      toast.success(next ? "KI-Assistent eingeschaltet" : "KI-Assistent ausgeschaltet");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="py-5">
          <Switch
            label="KI-Assistent anbieten"
            description={
              enabled
                ? hint
                  ? "Erscheint in der Seitenleiste, oben rechts und im Editor, für alle mit Zugriff."
                  : "Eingeschaltet, erscheint aber erst, wenn unten ein API-Schlüssel hinterlegt ist."
                : "Ausgeschaltet: Der Assistent ist überall ausgeblendet. Schlüssel und Einstellungen bleiben gespeichert."
            }
            checked={enabled}
            onCheckedChange={toggle}
            disabled={toggling}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Anbieter und Modell" description="Der Schlüssel wird verschlüsselt gespeichert und nie wieder angezeigt." />
        <CardContent className="flex flex-col gap-5 pt-5">
          <Select
            label="Anbieter"
            items={providerItems}
            value={provider}
            onValueChange={(value) => {
              const next = value as AiProvider;
              setProvider(next);
              setApiKey("");
              setModel(next === initial.provider ? initial.model : defaults[next]);
              loadModels(next, "");
            }}
          />
          <Field>
            <Label>API-Schlüssel</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onBlur={() => apiKey.trim() && loadModels(provider, apiKey)}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              {hint && (
                <Button variant="secondary" size="icon" aria-label="Schlüssel entfernen" disabled={removing} onClick={remove}>
                  {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              )}
            </div>
            <Description>
              {hint ? (
                <span className="inline-flex items-center gap-1.5">
                  <KeyRound className="size-4" strokeWidth={1.75} />
                  Hinterlegt, endet auf <span className="font-mono">{hint}</span>. Leer lassen, um ihn zu behalten.
                </span>
              ) : provider === "anthropic" ? (
                "Aus der Claude Console (platform.claude.com) unter API Keys."
              ) : (
                "Aus dem OpenAI-Dashboard (platform.openai.com) unter API Keys."
              )}
            </Description>
          </Field>
          <div className="flex flex-col gap-2">
            <Select label="Modell" items={modelItems} value={model} onValueChange={setModel} disabled={loadingModels} />
            <p className="text-sm text-muted">
              {loadingModels
                ? "Modelle werden geladen…"
                : modelsError
                  ? modelsError
                  : models
                    ? `${models.length} Modelle mit diesem Schlüssel verfügbar.`
                    : "Nach dem Eintragen des Schlüssels erscheinen hier alle verfügbaren Modelle."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Zugriff" description="Wer den Assistenten im Editor sieht. App-Admins haben immer Zugriff." />
        <CardContent className="pt-5">
          <Select label="Verfügbar für" items={accessItems} value={access} onValueChange={(value) => setAccess(value as AiAccess)} />
          <p className="mt-2 text-sm text-muted">
            Der Assistent kann den gesamten Code der Website ändern, also auch Aufbau und Design. Gib ihn nur Personen, denen du das zutraust.
          </p>
        </CardContent>
      </Card>

      <Button className="self-start" disabled={saving} onClick={save}>
        {saving ? <Loader2 className="animate-spin" /> : <Save />}
        Speichern
      </Button>
    </div>
  );
}

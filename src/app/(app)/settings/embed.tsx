"use client";

import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck, FileCode2, Globe, KeyRound, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { CopyButton } from "@/components/actions/common";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { TagInput } from "@/components/ui/tag-input";
import { toast } from "@/components/ui/toast";
import { rotatePublicKey, saveAllowedOrigins, writeConnectionFile } from "@/server/actions/forms";
import { SettingsRow, SettingsSection } from "./settings-ui";

/** How the website talks to kerncms: public key for forms/analytics and the domains allowed to use it. */
export function EmbedSettings({
  publicKey: initialKey,
  allowedOrigins,
  liveUrl,
  cmsUrl,
  connection: initialConnection,
  canEdit,
}: {
  publicKey: string;
  allowedOrigins: string[];
  liveUrl: string | null;
  cmsUrl: string;
  /** kern.public.json in the draft, and what it should say. */
  connection: { file: { url: string; site: string } | null; expected: { url: string; site: string } };
  canEdit: boolean;
}) {
  const [publicKey, setPublicKey] = useState(initialKey);
  const [origins, setOrigins] = useState(allowedOrigins);
  const [saved, setSaved] = useState(allowedOrigins);
  const [file, setFile] = useState(initialConnection.file);
  const [writing, startWrite] = useTransition();
  const expected = { ...initialConnection.expected, site: publicKey };
  const fileState = !file ? "missing" : file.url === expected.url && file.site === expected.site ? "current" : "outdated";
  const [rotating, startRotate] = useTransition();
  const [saving, startSave] = useTransition();
  const env = `PUBLIC_KERN_URL=${cmsUrl}\nPUBLIC_KERN_SITE=${publicKey}`;
  const dirty = JSON.stringify(origins) !== JSON.stringify(saved);

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title="Einbindung in die Website"
        description="Formulare und Statistik der Website senden an kerncms. Dafür braucht die Website diese Adresse und den Schlüssel."
      >
        <SettingsRow
          icon={FileCode2}
          label="In der Website"
          description="kerncms schreibt Adresse und Schlüssel in die Datei kern.public.json im Repository. Die Website liest sie beim Bauen, ohne .env oder Build-Variablen."
        >
          <div className="flex flex-col items-start gap-3">
            {fileState === "current" ? (
              <span className="flex items-center gap-2 text-[15px]">
                <CircleCheck className="size-4 text-success" strokeWidth={2} />
                Eingetragen
              </span>
            ) : (
              <span className="flex items-center gap-2 text-[15px] text-muted">
                <CircleAlert className={fileState === "outdated" ? "size-4 text-warning" : "size-4"} strokeWidth={2} />
                {fileState === "outdated" ? "Veraltet, Schlüssel oder Adresse haben sich geändert" : "Noch nicht eingetragen"}
              </span>
            )}
            {canEdit && fileState !== "current" && (
              <Button
                size="sm"
                disabled={writing}
                onClick={() =>
                  startWrite(async () => {
                    const result = await writeConnectionFile();
                    if (!result.ok) return void toast.error("Nicht eingetragen", { description: result.error });
                    setFile(result.data);
                    toast.success("In die Website eingetragen", { description: "Live nach dem nächsten Veröffentlichen." });
                  })
                }
              >
                {writing && <Loader2 className="animate-spin" />}
                {fileState === "outdated" ? "Aktualisieren" : "In die Website eintragen"}
              </Button>
            )}
          </div>
        </SettingsRow>
        <SettingsRow
          icon={KeyRound}
          label="Öffentlicher Schlüssel"
          description="Steht im HTML der Website und ist nicht geheim, aber nicht erratbar. Bei Spam einfach neu erzeugen."
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-subtle/60 py-1.5 pr-1.5 pl-4">
              <code className="min-w-0 flex-1 truncate font-mono text-[15px]">{publicKey}</code>
              <CopyButton value={publicKey} />
            </div>
            {canEdit && (
              <ConfirmDialog
                trigger={
                  <>
                    {rotating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    Neu erzeugen
                  </>
                }
                triggerClassName={buttonStyles({ variant: "ghost", size: "sm", className: "self-start" })}
                title="Neuen Schlüssel erzeugen?"
                description="Der alte Schlüssel funktioniert sofort nicht mehr. Steht er in kern.public.json, wird die Datei mit aktualisiert; Formulare und Statistik laufen wieder, sobald du veröffentlichst."
                confirmLabel="Neu erzeugen"
                danger
                onConfirm={() =>
                  startRotate(async () => {
                    const result = await rotatePublicKey();
                    if (!result.ok) return void toast.error("Das hat nicht geklappt", { description: result.error });
                    setPublicKey(result.data.publicKey);
                    if (result.data.fileUpdated) setFile({ url: expected.url, site: result.data.publicKey });
                    toast.success("Neuer Schlüssel erzeugt", {
                      description: result.data.fileUpdated ? "kern.public.json ist aktualisiert. Jetzt veröffentlichen." : "Jetzt in der Website eintragen.",
                    });
                  })
                }
              />
            )}
          </div>
        </SettingsRow>
        <SettingsRow label="Alternativ als Umgebungsvariablen" description="Für Websites, die nicht kern.public.json lesen: als .env oder Build-Variablen. Gesetzte Variablen haben Vorrang vor der Datei." stacked>
          <div className="flex items-start gap-2 rounded-xl border border-border bg-code p-4 text-white">
            <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-sm leading-relaxed">{env}</pre>
            <CopyButton value={env} />
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Erlaubte Domains" description="Formulare werden nur angenommen, wenn sie von diesen Adressen abgeschickt werden.">
        <SettingsRow icon={ShieldCheck} label="Immer erlaubt" description="Die Live-Adresse der Website, mit und ohne www. Lokal zusätzlich localhost.">
          <span className="flex items-center gap-2 text-[15px]">
            <Globe className="size-4 text-muted" strokeWidth={1.75} />
            {liveUrl ? <span className="font-mono">{new URL(liveUrl).host}</span> : <span className="text-muted">Keine Live-Adresse eingetragen</span>}
          </span>
        </SettingsRow>
        <SettingsRow icon={Globe} label="Weitere Domains" description="Zum Beispiel eine Staging-Adresse. Mit Enter bestätigen.">
          <div className="flex flex-col gap-3">
            <TagInput key={saved.join(",")} defaultValue={origins} onValueChange={setOrigins} />
            {canEdit && dirty && (
              <Button
                size="sm"
                className="self-start"
                disabled={saving}
                onClick={() =>
                  startSave(async () => {
                    const result = await saveAllowedOrigins(origins);
                    if (!result.ok) return void toast.error("Nicht gespeichert", { description: result.error });
                    setOrigins(result.data);
                    setSaved(result.data);
                    toast.success("Domains gespeichert");
                  })
                }
              >
                {saving && <Loader2 className="animate-spin" />}
                Speichern
              </Button>
            )}
          </div>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

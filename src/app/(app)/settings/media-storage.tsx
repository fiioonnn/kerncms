"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft, CircleAlert, CircleCheck, Cloud, FolderGit2, Loader2, PlugZap, Server, Trash2, type LucideIcon } from "lucide-react";
import { refreshStatus } from "@/components/history/use-status";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/toggles";
import { cn } from "@/lib/utils";
import { moveMedia, removeSiteStorage, saveMediaStorage, saveSiteStorage, testSiteStorage, type StorageInput, type StorageTestResult } from "@/server/actions/storage";
import type { MediaStorageInfo } from "@/server/queries";
import { SettingsRow, SettingsSection } from "./settings-ui";

type Location = "repo" | "cms" | "s3";

/** "nach …"-Form for messages: "ins Repository", "in den kerncms-Speicher". */
const INTO: Record<Location, string> = { repo: "ins Repository", cms: "in den kerncms-Speicher", s3: "in den eigenen S3-Speicher" };

const OPTIONS: { id: Location; label: string; icon: LucideIcon; text: string }[] = [
  {
    id: "repo",
    label: "Im Repository",
    icon: FolderGit2,
    text: "Dateien liegen im Git-Repository der Website und gehen mit „Veröffentlichen“ live. Gut für wenige, kleine Bilder.",
  },
  {
    id: "cms",
    label: "kerncms-Speicher",
    icon: Server,
    text: "Dateien liegen bei kerncms und sind sofort online. Das Repository bleibt schlank.",
  },
  {
    id: "s3",
    label: "Eigener S3-Speicher",
    icon: Cloud,
    text: "Ein eigener Bucket, zum Beispiel Cloudflare R2, AWS S3, Hetzner oder MinIO.",
  },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function countLabel(files: number, bytes: number) {
  if (files === 0) return "Keine Dateien";
  return `${files} ${files === 1 ? "Datei" : "Dateien"} · ${formatBytes(bytes)}`;
}

export function MediaStorageSettings({ info, canEdit }: { info: MediaStorageInfo; canEdit: boolean }) {
  const [storage, setStorage] = useState<Location>(info.storage);
  const [switching, startSwitch] = useTransition();
  const available = (id: Location) => (id === "s3" ? Boolean(info.custom) : id === "cms" ? info.cmsAvailable : true);

  function choose(id: Location) {
    if (id === storage || !canEdit || !available(id)) return;
    const before = storage;
    setStorage(id);
    startSwitch(async () => {
      const result = await saveMediaStorage(id);
      if (!result.ok) {
        setStorage(before);
        toast.error("Nicht geändert", { description: result.error });
        return;
      }
      toast.success(`Neue Uploads gehen jetzt in: ${OPTIONS.find((o) => o.id === id)!.label}`, {
        description: "Vorhandene Dateien bleiben, wo sie sind. Verschieben kannst du sie unten.",
      });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection title="Speicherort für neue Uploads" description="Wo Bilder und Dateien landen, die ab jetzt hochgeladen werden.">
        <div role="radiogroup" aria-label="Speicherort" className="grid gap-3 p-6 md:grid-cols-3">
          {OPTIONS.map((option) => {
            const selected = storage === option.id;
            const disabled = !canEdit || !available(option.id);
            const count = info.counts[option.id];
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={option.label}
                disabled={disabled && !selected}
                onClick={() => choose(option.id)}
                className={cn(
                  "relative flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                  selected ? "border-accent bg-accent-soft/50 ring-1 ring-accent" : "border-border hover:bg-subtle/60",
                  disabled && !selected && "cursor-not-allowed opacity-60 hover:bg-transparent",
                )}
              >
                <span className="flex items-center gap-3">
                  <span className={cn("flex size-9 items-center justify-center rounded-lg", selected ? "bg-accent text-white" : "bg-subtle text-muted")}>
                    <option.icon className="size-[18px]" strokeWidth={1.75} />
                  </span>
                  <span className="flex-1 text-[15px] font-medium">{option.label}</span>
                  {selected && (switching ? <Loader2 className="size-4 animate-spin text-accent" /> : <CircleCheck className="size-5 text-accent" />)}
                </span>
                <span className="text-sm leading-relaxed text-muted">{option.text}</span>
                <span className="mt-auto text-sm font-medium">
                  {option.id === "s3" && !info.custom ? <span className="text-muted">Noch nicht eingerichtet</span> : countLabel(count.files, count.bytes)}
                </span>
              </button>
            );
          })}
        </div>
        {storage === "cms" && !info.publicUrlConfigured && (
          <p className="flex items-start gap-2.5 px-6 py-4 text-sm text-warning">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              KERN_PUBLIC_URL ist nicht gesetzt. Dateien bekommen Adressen wie <code className="font-mono">{info.cmsBaseUrl}…</code>, die nur auf diesem Rechner funktionieren.
            </span>
          </p>
        )}
      </SettingsSection>

      <CustomStorage info={info} canEdit={canEdit} inUse={storage === "s3"} />

      <MoveMedia info={info} canEdit={canEdit} />
    </div>
  );
}

function CustomStorage({ info, canEdit, inUse }: { info: MediaStorageInfo; canEdit: boolean; inUse: boolean }) {
  const initial: StorageInput = info.custom ?? {
    endpoint: "",
    region: "auto",
    bucket: "",
    accessKeyId: "",
    secretAccessKey: "",
    publicUrl: "",
    prefix: "media/",
    forcePathStyle: true,
  };
  const [values, setValues] = useState(initial);
  const [test, setTest] = useState<StorageTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, startTest] = useTransition();
  const [saving, startSave] = useTransition();
  const [removing, startRemove] = useTransition();
  const set = (patch: Partial<StorageInput>) => {
    setValues((v) => ({ ...v, ...patch }));
    setTest(null);
    setError(null);
  };
  const busy = testing || saving || removing;

  function runTest() {
    startTest(async () => {
      const result = await testSiteStorage(values);
      if (!result.ok) setError(result.error);
      else setTest(result.data);
    });
  }

  function save() {
    startSave(async () => {
      const result = await saveSiteStorage(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTest(result.data);
      setValues((v) => ({ ...v, secretAccessKey: "" }));
      toast.success("S3-Speicher gespeichert");
    });
  }

  function remove() {
    startRemove(async () => {
      const result = await removeSiteStorage();
      if (!result.ok) toast.error("Nicht entfernt", { description: result.error });
      else toast.success("S3-Speicher entfernt");
    });
  }

  const field = (key: keyof StorageInput, label: string, description: string, opts: { type?: string; autoComplete?: string } = {}) => (
    <SettingsRow label={label} description={description} htmlFor={`s3-${key}`}>
      <Input
        id={`s3-${key}`}
        type={opts.type ?? "text"}
        autoComplete={opts.autoComplete ?? "off"}
        spellCheck={false}
        value={String(values[key])}
        onChange={(e) => set({ [key]: e.target.value })}
        className="font-mono text-sm"
      />
    </SettingsRow>
  );

  return (
    <SettingsSection
      title="Eigener S3-Speicher"
      description="Zugangsdaten werden verschlüsselt gespeichert. Der Bucket muss über die öffentliche Adresse lesbar sein, damit die Website die Bilder zeigen kann."
      action={
        info.custom ? (
          <span className="flex items-center gap-1.5 text-sm font-medium text-success">
            <CircleCheck className="size-4" />
            Eingerichtet
          </span>
        ) : null
      }
    >
      <fieldset disabled={!canEdit || busy} className="contents">
        {field("endpoint", "Endpunkt", "Leer lassen für AWS. Zum Beispiel https://<konto>.r2.cloudflarestorage.com")}
        {field("region", "Region", "Bei R2 „auto“, bei AWS zum Beispiel eu-central-1.")}
        {field("bucket", "Bucket", "Name des Buckets.")}
        {field("accessKeyId", "Access Key", "Schlüssel mit Schreibrechten auf den Bucket.")}
        {field("secretAccessKey", "Secret Key", info.custom ? "Gespeichert. Leer lassen, um ihn zu behalten." : "Wird verschlüsselt gespeichert.", { type: "password", autoComplete: "new-password" })}
        {field("publicUrl", "Öffentliche Adresse", "Unter dieser Adresse sind die Dateien im Internet erreichbar, zum Beispiel https://bilder.baeckerei-mueller.de")}
        {field("prefix", "Ordner", "Unterordner im Bucket, zum Beispiel media/. Leer lassen für die oberste Ebene.")}
        <SettingsRow label="Path-Style-Adressen" description="Für MinIO und die meisten S3-kompatiblen Anbieter an, für AWS aus." compact>
          <Switch label="Path-Style" checked={values.forcePathStyle} onCheckedChange={(forcePathStyle) => set({ forcePathStyle })} className="[&>span:first-child]:sr-only" />
        </SettingsRow>
      </fieldset>

      {(test || error) && (
        <div className="px-6 py-4">
          <p
            role="status"
            className={cn(
              "flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm",
              error ? "bg-danger-soft text-danger" : test?.publicRead ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
            )}
          >
            {error || !test?.publicRead ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <CircleCheck className="mt-0.5 size-4 shrink-0" />}
            <span className="min-w-0 break-words">{error ?? test?.message}</span>
          </p>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          {info.custom && (
            <ConfirmDialog
              trigger={
                <>
                  {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Entfernen
                </>
              }
              triggerClassName={buttonStyles({ variant: "ghost", className: "mr-auto -ml-2 text-danger hover:bg-danger-soft" })}
              title="S3-Speicher entfernen?"
              description={
                inUse
                  ? "Neue Uploads gehen noch in diesen Speicher. Wähle zuerst oben einen anderen Speicherort."
                  : "Die Zugangsdaten werden gelöscht. Das geht nur, wenn dort keine Dateien mehr liegen."
              }
              confirmLabel="Entfernen"
              danger
              onConfirm={remove}
            />
          )}
          <Button variant="secondary" onClick={runTest} disabled={busy} className={info.custom ? "" : "ml-auto"}>
            {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
            Verbindung testen
          </Button>
          <Button onClick={save} disabled={busy}>
            {saving && <Loader2 className="animate-spin" />}
            Speichern
          </Button>
        </div>
      )}
    </SettingsSection>
  );
}

function MoveMedia({ info, canEdit }: { info: MediaStorageInfo; canEdit: boolean }) {
  const targets = OPTIONS.filter((o) => (o.id === "s3" ? Boolean(info.custom) : o.id === "cms" ? info.cmsAvailable : true));
  const [target, setTarget] = useState<Location>(info.storage);
  const [confirm, setConfirm] = useState(false);
  const [moving, startMove] = useTransition();
  const total = Object.values(info.counts).reduce((sum, c) => sum + c.files, 0);
  const outside = total - info.counts[target].files;

  function move() {
    startMove(async () => {
      const result = await moveMedia(target);
      if (!result.ok) {
        toast.error("Verschieben fehlgeschlagen", { description: result.error });
        return;
      }
      const { moved, files, skipped } = result.data;
      toast.success(`${moved} ${moved === 1 ? "Datei" : "Dateien"} ${INTO[target]} verschoben`, {
        description: `${files} ${files === 1 ? "Inhalt" : "Inhalte"} angepasst. Veröffentliche, damit die Website die neuen Adressen nutzt.${skipped.length ? ` Nicht verschoben: ${skipped.join(", ")}` : ""}`,
      });
      void refreshStatus();
    });
  }

  return (
    <SettingsSection
      title="Medien verschieben"
      description="Zieht vorhandene Dateien in einen anderen Speicher um und passt alle Verweise in Seiten, Inhalten und Globals an."
    >
      <SettingsRow icon={ArrowRightLeft} label="Ziel" description={outside === 0 ? `Alle Dateien liegen schon dort.` : `${outside} ${outside === 1 ? "Datei wird" : "Dateien werden"} verschoben.`}>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            aria-label="Ziel"
            items={targets.map((t) => ({ value: t.id, label: t.label }))}
            value={target}
            onValueChange={(v) => setTarget(v as Location)}
            disabled={!canEdit || moving}
            className="min-w-56 flex-1"
          />
          <Button onClick={() => setConfirm(true)} disabled={!canEdit || moving || outside === 0}>
            {moving && <Loader2 className="animate-spin" />}
            {moving ? "Verschiebt…" : "Verschieben"}
          </Button>
        </div>
      </SettingsRow>
      <div className="flex flex-col gap-2 px-6 py-5 text-sm leading-relaxed text-muted">
        <p>
          Die angepassten Inhalte landen als Änderung im Entwurf. Bis du veröffentlichst, zeigt die Live-Website weiter die alten Dateien. Alte Kopien im Speicher werden
          eine Stunde nach dem Veröffentlichen gelöscht.
        </p>
        {info.pendingCleanup > 0 && (
          <p>
            {info.pendingCleanup} alte {info.pendingCleanup === 1 ? "Datei wartet" : "Dateien warten"} auf das Aufräumen.
          </p>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`${outside} ${outside === 1 ? "Datei" : "Dateien"} ${INTO[target]} verschieben?`}
        description="Verweise in Seiten, Inhalten und Globals werden angepasst und als Änderung gespeichert. Live geht das mit dem nächsten Veröffentlichen."
        confirmLabel="Verschieben"
        onConfirm={move}
      />
    </SettingsSection>
  );
}

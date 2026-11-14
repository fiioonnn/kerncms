"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Copy, Loader2, RotateCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader } from "@/components/ui/display";
import { Description, Field, Label, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { refreshSearchConsole, removeGoogleServiceAccount, saveGoogleServiceAccount } from "@/server/actions/seo";
import { ErrorNote } from "../_components/shared";

export type SiteMatch = { id: string; name: string; liveUrl: string | null; property: string | null };

const steps = [
  "In der Google Cloud Console ein Projekt anlegen (oder ein vorhandenes nehmen) und dort die „Google Search Console API“ aktivieren.",
  "Unter „IAM und Verwaltung → Dienstkonten“ ein Dienstkonto anlegen. Rollen braucht es keine.",
  "Beim Dienstkonto unter „Schlüssel“ einen neuen JSON-Schlüssel erstellen und den Inhalt der Datei hier einfügen.",
  "In der Search Console jeder Website unter „Einstellungen → Nutzer und Berechtigungen“ die Adresse des Dienstkontos als Nutzer mit eingeschränkten Rechten hinzufügen.",
];

export function SearchConsoleForm({ email, properties, error, sites }: { email: string | null; properties: string[]; error: string | null; sites: SiteMatch[] }) {
  const router = useRouter();
  const [json, setJson] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, startSave] = useTransition();
  const [removing, startRemove] = useTransition();
  const [refreshing, startRefresh] = useTransition();

  const save = () =>
    startSave(async () => {
      const result = await saveGoogleServiceAccount(json);
      if (!result.ok) {
        toast.error("Nicht gespeichert", { description: result.error });
        return;
      }
      setJson("");
      toast.success("Search Console verbunden", {
        description: result.data.length ? `${result.data.length} Properties freigegeben.` : "Noch keine Property freigegeben. Füge das Dienstkonto in der Search Console hinzu.",
      });
      router.refresh();
    });

  const remove = () =>
    startRemove(async () => {
      const result = await removeGoogleServiceAccount();
      if (!result.ok) {
        toast.error("Nicht entfernt", { description: result.error });
        return;
      }
      toast.success("Verbindung entfernt");
      router.refresh();
    });

  const refresh = () =>
    startRefresh(async () => {
      await refreshSearchConsole();
      router.refresh();
    });

  const copy = async () => {
    if (!email) return;
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Google Search Console" description="Zugriff über ein Dienstkonto. Der Schlüssel wird verschlüsselt gespeichert und nie wieder angezeigt." />
        <CardContent className="flex flex-col gap-5 pt-5">
          {email && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Dienstkonto</span>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate rounded-xl border border-border bg-subtle px-3 py-2.5 font-mono text-sm select-all">{email}</span>
                <Button variant="secondary" size="icon" aria-label="Adresse kopieren" onClick={() => void copy()}>
                  {copied ? <Check /> : <Copy />}
                </Button>
                <Button variant="secondary" size="icon" aria-label="Verbindung entfernen" disabled={removing} onClick={remove}>
                  {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              </div>
              <p className="text-sm text-muted">Diese Adresse in der Search Console jeder Website als Nutzer hinzufügen.</p>
            </div>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field>
            <Label>{email ? "Neuer JSON-Schlüssel" : "JSON-Schlüssel des Dienstkontos"}</Label>
            <Textarea value={json} onChange={(e) => setJson(e.target.value)} rows={5} spellCheck={false} autoComplete="off" className="font-mono text-sm" />
            <Description>{email ? "Nur ausfüllen, um das Dienstkonto zu wechseln." : "Der komplette Inhalt der heruntergeladenen .json-Datei."}</Description>
          </Field>
          <Button className="self-start" disabled={saving || !json.trim()} onClick={save}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Speichern
          </Button>
          {!email && (
            <ol className="flex list-decimal flex-col gap-2 border-t border-border pt-5 pl-5 text-sm leading-relaxed text-muted">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {email && (
        <Card>
          <CardHeader
            title="Websites"
            description={`Zugeordnet über die Live-Adresse. ${properties.length} ${properties.length === 1 ? "Property ist" : "Properties sind"} für das Dienstkonto freigegeben.`}
            action={
              <Button variant="secondary" size="sm" disabled={refreshing} onClick={refresh}>
                {refreshing ? <Loader2 className="animate-spin" /> : <RotateCw />}
                Neu laden
              </Button>
            }
          />
          <CardContent className="flex flex-col pt-2">
            {sites.length === 0 && <p className="py-3 text-sm text-muted">Noch keine Websites.</p>}
            {sites.map((site) => (
              <div key={site.id} className="flex items-center gap-4 border-b border-border py-3 last:border-0">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{site.name}</span>
                  <span className="truncate text-sm text-muted">{site.property ?? site.liveUrl ?? "Keine Live-Adresse"}</span>
                </span>
                {site.property ? (
                  <Badge tone="success" dot>
                    Verbunden
                  </Badge>
                ) : site.liveUrl ? (
                  <Badge tone="warning" dot>
                    Nicht freigegeben
                  </Badge>
                ) : (
                  <Badge dot>Ohne Adresse</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

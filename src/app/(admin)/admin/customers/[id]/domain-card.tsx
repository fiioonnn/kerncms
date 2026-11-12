"use client";

import { useState, useTransition } from "react";
import { Copy, Globe, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, Card, CardContent, CardHeader } from "@/components/ui/display";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { checkCustomerDomain, removeCustomerDomain, setCustomerDomain } from "@/server/actions/admin";
import { ErrorNote } from "../../_components/shared";

export type DomainState = {
  domain: string | null;
  status: "pending" | "active" | "error" | null;
  /** Cloudflare for SaaS credentials are set; without them the domain is only stored. */
  cloudflare: boolean;
  /** Where the customer's CNAME points, e.g. customers.kerncms.com. */
  target: string | null;
  txtRecords: { name: string; value: string }[];
  errors: string[];
};

const statusBadge = {
  active: { tone: "success", label: "Aktiv" },
  pending: { tone: "warning", label: "Wartet auf DNS" },
  error: { tone: "danger", label: "Fehler" },
} as const;

/** The customer's own CMS address (cms.kundendomain.de) and the DNS records it needs. */
export function DomainCard({ customerId, state }: { customerId: string; state: DomainState }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setCustomerDomain(customerId, input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInput("");
      toast.success("Domain gespeichert");
    });
  }

  function check() {
    startTransition(async () => {
      const result = await checkCustomerDomain(customerId);
      if (!result.ok) toast.error("Prüfen fehlgeschlagen", { description: result.error });
      else if (result.data.status === "active") toast.success("Die Domain ist aktiv");
      else toast.info("Noch nicht fertig", { description: "DNS und Zertifikat brauchen meist ein paar Minuten." });
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeCustomerDomain(customerId);
      if (!result.ok) toast.error("Entfernen fehlgeschlagen", { description: result.error });
      else toast.success("Domain entfernt");
    });
  }

  if (!state.domain) {
    return (
      <Card>
        <CardHeader title="Eigene Domain" description="Der Kunde öffnet das CMS unter seiner eigenen Adresse. Einladungen und Benachrichtigungen verlinken dorthin." />
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field>
              <Label>Domain</Label>
              <Input value={input} onValueChange={setInput} disabled={pending} autoComplete="off" spellCheck={false} />
              <Description>Zum Beispiel cms.kundendomain.de</Description>
            </Field>
            {!state.cloudflare && (
              <p className="text-sm text-muted">
                Cloudflare for SaaS ist nicht eingerichtet. Die Domain wird nur gespeichert und muss selbst auf den Server zeigen.
              </p>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" className="w-fit" disabled={pending || !input.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <Globe />}
              Domain hinzufügen
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const badge = statusBadge[state.status ?? "pending"];
  const records = [
    ...(state.target ? [{ type: "CNAME", name: state.domain, value: state.target }] : []),
    ...state.txtRecords.map((r) => ({ type: "TXT", name: r.name, value: r.value })),
  ];

  return (
    <Card>
      <CardHeader
        title="Eigene Domain"
        action={
          <Badge tone={badge.tone} dot>
            {badge.label}
          </Badge>
        }
      />
      <CardContent className="flex flex-col gap-5">
        <a href={`https://${state.domain}`} target="_blank" rel="noreferrer" className="w-fit text-base font-semibold text-accent hover:underline">
          {state.domain}
        </a>

        {state.cloudflare && state.status !== "active" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              Diese Einträge kommen ins DNS des Kunden. Liegt sein DNS bei Cloudflare, den CNAME auf „Nur DNS“ stellen. Die TXT-Einträge braucht es nur, wenn die
              Prüfung über den CNAME nicht klappt.
            </p>
            <ul className="flex flex-col gap-2">
              {records.map((r) => (
                <DnsRecord key={`${r.type}-${r.name}`} {...r} />
              ))}
            </ul>
          </div>
        )}
        {!state.cloudflare && (
          <p className="text-sm text-muted">Cloudflare for SaaS ist nicht eingerichtet. Die Domain muss selbst auf den Server zeigen.</p>
        )}
        {state.errors.length > 0 && <ErrorNote>{state.errors.join(" ")}</ErrorNote>}

        <div className="flex flex-wrap items-center gap-3">
          {state.cloudflare && (
            <Button variant="secondary" onClick={check} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Status prüfen
            </Button>
          )}
          <ConfirmDialog
            title={`${state.domain} entfernen?`}
            description="Das CMS ist danach nicht mehr unter dieser Adresse erreichbar. Links gehen wieder auf die normale kerncms-Adresse."
            confirmLabel="Domain entfernen"
            danger
            triggerClassName={buttonStyles({ variant: "ghost", className: "text-danger" })}
            trigger={
              <>
                <Trash2 />
                Entfernen
              </>
            }
            onConfirm={remove}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DnsRecord({ type, name, value }: { type: string; name: string; value: string }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-xl bg-subtle px-4 py-3 text-sm">
      <span className="flex items-center justify-between gap-3">
        <Badge>{type}</Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            toast.success("Ziel kopiert");
          }}
        >
          <Copy />
          Ziel kopieren
        </Button>
      </span>
      <span className="break-all font-mono">{name}</span>
      <span className="break-all font-mono text-muted">→ {value}</span>
    </li>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Globe, Loader2, Mail, RefreshCw, Trash2 } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Badge, Card, CardContent, CardHeader } from "@/components/ui/display";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { checkCustomerDomain, mailDomainInstructions, removeCustomerDomain, setCustomerDomain } from "@/server/actions/admin";
import { cn } from "@/lib/utils";
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
export function DomainCard({ customerId, state, contactEmail }: { customerId: string; state: DomainState; contactEmail?: string | null }) {
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
  const cname = state.target ? { type: "CNAME", name: state.domain, value: state.target } : null;
  const showSetup = state.cloudflare && state.status !== "active";

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

        {showSetup && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Diesen Eintrag legt der Kunde bei seinem Domain-Anbieter an. Danach dauert es meist ein paar Minuten.</p>
            {cname && <DnsRecord {...cname} note="Bei Cloudflare auf „Nur DNS“ stellen (graue Wolke)." />}
            {state.txtRecords.length > 0 && (
              <>
                <p className="pt-1 text-sm text-muted">Nur falls die Prüfung über den CNAME nicht klappt, zusätzlich:</p>
                {state.txtRecords.map((r) => (
                  <DnsRecord key={r.name + r.value} type="TXT" name={r.name} value={r.value} />
                ))}
              </>
            )}
          </div>
        )}
        {!state.cloudflare && (
          <p className="text-sm text-muted">Cloudflare for SaaS ist nicht eingerichtet. Die Domain muss selbst auf den Server zeigen.</p>
        )}
        {state.errors.length > 0 && <ErrorNote>{state.errors.join(" ")}</ErrorNote>}

        <div className="flex flex-wrap items-center gap-3">
          {showSetup && cname && <MailInstructions customerId={customerId} defaultEmail={contactEmail ?? ""} />}
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

function DnsRecord({ type, name, value, note }: { type: string; name: string; value: string; note?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-subtle px-4 py-2">
        <Badge tone="accent">{type}</Badge>
        <span className="text-xs text-muted">TTL: Auto</span>
      </div>
      <dl className="divide-y divide-border">
        <CopyRow label="Name" value={name} />
        <CopyRow label="Ziel" value={value} />
      </dl>
      {note && <p className="border-t border-border px-4 py-2.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

/** One record field with a copy button; the whole value stays selectable. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="flex items-center gap-3 py-1.5 pr-1.5 pl-4">
      <dt className="w-10 shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 font-mono text-[13px] break-all select-all">{value}</dd>
      <Button variant="ghost" size="icon" onClick={copy} aria-label={`${label} kopieren`} className={cn("size-9 shrink-0", copied && "text-success")}>
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

/** Lets the admin mail the DNS instructions to the customer. */
function MailInstructions({ customerId, defaultEmail }: { customerId: string; defaultEmail: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await mailDomainInstructions(customerId, { email });
      if (!result.ok) return setError(result.error);
      setOpen(false);
      toast.success("Anleitung verschickt", { description: email });
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) {
          setEmail(defaultEmail);
          setError(null);
        }
      }}
    >
      <Button onClick={() => setOpen(true)}>
        <Mail />
        Anleitung senden
      </Button>
      <DialogContent
        title="Anleitung per E-Mail senden"
        description="Der Kunde bekommt den DNS-Eintrag mit kurzer Erklärung, wo er ihn anlegt."
        size="sm"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={pending}>
              Abbrechen
            </DialogClose>
            <Button onClick={send} disabled={pending || !email.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <Mail />}
              Senden
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Field invalid={Boolean(error)}>
            <Label>E-Mail-Adresse</Label>
            <Input type="email" value={email} onValueChange={setEmail} disabled={pending} autoComplete="off" />
            <Description>{defaultEmail ? "Vorausgefüllt mit dem Ansprechpartner des Kunden." : "Beim Kunden ist keine E-Mail-Adresse hinterlegt."}</Description>
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
        </form>
      </DialogContent>
    </Dialog>
  );
}

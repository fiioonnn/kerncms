"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, ExternalLink, Globe, Loader2, Plus, Save, Trash2, Users } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Avatar, Badge, Card, CardContent, CardHeader, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/admin-format";
import { roleLabels, type RoleName } from "@/lib/kern-types";
import { deleteCustomer, updateCustomer, type CustomerInput } from "@/server/actions/admin";
import { CustomerFields } from "../../_components/customer-dialog";
import { InviteButton } from "../../_components/invite-dialog";
import {
  CustomerStatusBadge,
  customerStatusItems,
  DeployBadge,
  ErrorNote,
  hostOf,
  OpenSiteButton,
  SiteSource,
  type CustomerStatus,
} from "../../_components/shared";

type Customer = CustomerInput & { id: string; status: CustomerStatus; createdAt: string };
type Site = {
  id: string;
  name: string;
  source: string;
  githubRepo: string | null;
  repoPath: string | null;
  liveUrl: string | null;
  lastDeploy: { status: string; createdAt: string; message: string } | null;
};
type Person = { id: string; name: string; email: string; role: RoleName; siteId: string; site: string };

export function CustomerDetail({ customer, sites, people }: { customer: Customer; sites: Site[]; people: Person[] }) {
  const router = useRouter();
  const [deleting, startDelete] = useTransition();

  return (
    <PageContainer>
      <Link href="/admin/customers" className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-medium text-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        Alle Kunden
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
            <CustomerStatusBadge status={customer.status} />
          </div>
          <p className="text-[15px] text-muted">Kunde seit {formatDate(customer.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <InviteButton
            label="Kunden einladen"
            title={`${customer.name} einladen`}
            sites={sites}
            defaultEmail={customer.contactEmail}
            defaultRole="owner"
            disabled={sites.length === 0}
          />
          <Link href={`/admin/sites/new?customer=${customer.id}`} className={buttonStyles()}>
            <Plus />
            Website verbinden
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title="Websites" description={sites.length === 1 ? "1 Website" : `${sites.length} Websites`} className="pb-4" />
            {sites.length === 0 ? (
              <EmptyState
                icon={Globe}
                title="Noch keine Website"
                description="Verbinde das Repository der Website dieses Kunden."
                className="border-t border-border py-12"
                action={
                  <Link href={`/admin/sites/new?customer=${customer.id}`} className={buttonStyles()}>
                    <Plus />
                    Website verbinden
                  </Link>
                }
              />
            ) : (
              <ul className="border-t border-border">
                {sites.map((site) => {
                  const host = hostOf(site.liveUrl);
                  return (
                    <li key={site.id} className="flex flex-col gap-4 border-b border-border px-6 py-5 last:border-0 lg:flex-row lg:items-center">
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="text-base font-semibold">{site.name}</span>
                        <SiteSource source={site.source} githubRepo={site.githubRepo} repoPath={site.repoPath} className="text-muted" />
                        {site.liveUrl && host && (
                          <a href={site.liveUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-accent hover:underline">
                            <ExternalLink className="size-4" />
                            {host}
                          </a>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-5">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm text-muted">Zuletzt veröffentlicht</span>
                          <DeployBadge deploy={site.lastDeploy} />
                        </div>
                        <OpenSiteButton siteId={site.id} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Personen mit Zugriff"
              description="Wer die Websites dieses Kunden im CMS bearbeiten kann."
              className="pb-4"
              action={
                sites.length > 0 ? (
                  <InviteButton label="Einladen" size="sm" title={`${customer.name} einladen`} sites={sites} defaultEmail={customer.contactEmail} defaultRole="owner" />
                ) : undefined
              }
            />
            {people.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Noch niemand"
                description={sites.length ? "Lade die Ansprechperson des Kunden als Inhaber ein." : "Verbinde zuerst eine Website, dann kannst du Personen einladen."}
                className="border-t border-border py-12"
              />
            ) : (
              <div className="border-t border-border">
                <Table>
                  <thead>
                    <tr>
                      <Th className="rounded-none!">Name</Th>
                      <Th className="hidden md:table-cell">Website</Th>
                      <Th className="rounded-none!">Rolle</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={`${p.siteId}-${p.id}`}>
                        <Td className="py-3">
                          <span className="flex items-center gap-4">
                            <Avatar name={p.name} />
                            <span className="flex min-w-0 flex-col leading-snug">
                              <span className="text-base font-medium">{p.name}</span>
                              <span className="truncate text-sm text-muted">{p.email}</span>
                            </span>
                          </span>
                        </Td>
                        <Td className="hidden md:table-cell">{p.site}</Td>
                        <Td>
                          <Badge tone={p.role === "owner" || p.role === "admin" ? "accent" : "neutral"}>{roleLabels[p.role]}</Badge>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <DetailsCard customer={customer} />

          <Card>
            <CardHeader title="Kunde löschen" description="Die Websites bleiben verbunden und sind danach keinem Kunden zugeordnet." />
            <CardContent>
              <ConfirmDialog
                title={`${customer.name} löschen?`}
                description="Der Kunde wird gelöscht. Seine Websites, Inhalte und Personen bleiben erhalten, sind aber keinem Kunden mehr zugeordnet."
                confirmLabel="Kunde löschen"
                danger
                triggerClassName={buttonStyles({ variant: "secondary", className: "text-danger" })}
                trigger={
                  <>
                    {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    Kunde löschen
                  </>
                }
                onConfirm={() =>
                  startDelete(async () => {
                    const result = await deleteCustomer(customer.id);
                    if (!result.ok) {
                      toast.error("Löschen fehlgeschlagen", { description: result.error });
                      return;
                    }
                    toast.success(`${customer.name} gelöscht`);
                    router.push("/admin/customers");
                  })
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function DetailsCard({ customer }: { customer: Customer }) {
  const initial: CustomerInput & { status: CustomerStatus } = {
    name: customer.name,
    contactName: customer.contactName,
    contactEmail: customer.contactEmail,
    phone: customer.phone,
    notes: customer.notes,
    status: customer.status,
  };
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateCustomer(customer.id, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(value);
      toast.success("Kunde gespeichert");
    });
  }

  return (
    <Card>
      <CardHeader title="Angaben" />
      <CardContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Select
            label="Status"
            items={customerStatusItems}
            value={value.status}
            onValueChange={(v) => setValue({ ...value, status: v as CustomerStatus })}
            disabled={pending}
          />
          <CustomerFields stacked value={value} onChange={(next) => setValue({ ...value, ...next })} disabled={pending} />
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending || !dirty || !value.name.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              Speichern
            </Button>
            {dirty && !pending && (
              <Button variant="ghost" onClick={() => setValue(saved)}>
                Verwerfen
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

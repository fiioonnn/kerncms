"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Building2, ExternalLink, GitBranch, Globe, Loader2, MoreHorizontal, MousePointerClick, Plus, RefreshCw, Search, Trash2, UserPlus } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Card, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Label } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select, type SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { formatWhen, numberFormat } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { assignSiteCustomer, removeSite, syncSiteNow } from "@/server/actions/admin";
import { InviteDialog } from "../_components/invite-dialog";
import { DeployBadge, ErrorNote, hostOf, SearchInput, SiteSource, useOpenSite } from "../_components/shared";

type Site = {
  id: string;
  name: string;
  customerId: string | null;
  customer: string | null;
  source: string;
  githubRepo: string | null;
  repoPath: string | null;
  branch: string;
  liveUrl: string | null;
  lastSyncedAt: string | null;
  members: number;
  views30d: number;
  lastDeploy: { status: string; createdAt: string; message: string } | null;
};

type Dialogs = { kind: "customer" | "invite" | "remove"; site: Site } | null;

export function SitesTable({ sites, customers }: { sites: Site[]; customers: SelectItem[] }) {
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [, startSync] = useTransition();
  const { open, opening } = useOpenSite();

  const q = query.trim().toLowerCase();
  const rows = sites.filter(
    (s) => !q || [s.name, s.customer ?? "", s.githubRepo ?? "", s.repoPath ?? "", s.liveUrl ?? ""].some((v) => v.toLowerCase().includes(q)),
  );

  function sync(site: Site) {
    setSyncing(site.id);
    startSync(async () => {
      const result = await syncSiteNow(site.id);
      setSyncing(null);
      if (!result.ok) toast.error("Abgleich fehlgeschlagen", { description: result.error });
      else toast.success(`${site.name} ist abgeglichen`);
    });
  }

  if (sites.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Globe}
          title="Noch keine Website verbunden"
          description="Verbinde ein Repository von GitHub. kerncms legt danach einen Entwurfs-Branch an."
          action={
            <Link href="/admin/sites/new" className={buttonStyles()}>
              <Plus />
              Website verbinden
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SearchInput value={query} onChange={setQuery} label="Websites durchsuchen" />

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Search} title="Keine Website gefunden" description="Versuche es mit einem anderen Namen, Kunden oder Repository." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Website</Th>
                <Th className="hidden md:table-cell">Kunde</Th>
                <Th className="hidden lg:table-cell">Quelle</Th>
                <Th className="hidden 2xl:table-cell">Personen</Th>
                <Th className="hidden whitespace-nowrap 2xl:table-cell">Aufrufe (30 T.)</Th>
                <Th className="hidden sm:table-cell">Veröffentlicht</Th>
                <Th className="w-0" aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {rows.map((site) => {
                const github = site.source === "github";
                const host = hostOf(site.liveUrl);
                return (
                  <tr key={site.id}>
                    <Td className="py-3">
                      <span className="flex flex-col leading-snug">
                        <span className="text-base font-medium whitespace-nowrap">{site.name}</span>
                        <span className="text-sm whitespace-nowrap text-muted">{host ?? "Keine Live-Adresse"}</span>
                      </span>
                    </Td>
                    <Td className="hidden md:table-cell">
                      {site.customerId && site.customer ? (
                        <Link href={`/admin/customers/${site.customerId}`} className="font-medium hover:text-accent hover:underline">
                          {site.customer}
                        </Link>
                      ) : (
                        <button type="button" onClick={() => setDialog({ kind: "customer", site })} className="text-[15px] font-medium text-accent hover:underline">
                          Zuordnen
                        </button>
                      )}
                    </Td>
                    <Td className="hidden max-w-72 py-3 lg:table-cell">
                      <span className="flex flex-col gap-1">
                        <SiteSource source={site.source} githubRepo={site.githubRepo} repoPath={site.repoPath} />
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
                          <span className="flex items-center gap-1.5">
                            <GitBranch className="size-3.5" />
                            {site.branch}
                          </span>
                          {github && (
                            <span suppressHydrationWarning className="flex items-center gap-1.5">
                              <RefreshCw className={cn("size-3.5", syncing === site.id && "animate-spin")} />
                              {syncing === site.id ? "Gleicht ab…" : site.lastSyncedAt ? `Abgeglichen ${formatWhen(site.lastSyncedAt)}` : "Noch nie abgeglichen"}
                            </span>
                          )}
                        </span>
                      </span>
                    </Td>
                    <Td className="hidden tabular-nums 2xl:table-cell">{site.members}</Td>
                    <Td className="hidden tabular-nums 2xl:table-cell">{numberFormat.format(site.views30d)}</Td>
                    <Td className="hidden py-3 sm:table-cell">
                      <DeployBadge deploy={site.lastDeploy} />
                    </Td>
                    <Td className="w-0 text-right">
                      <span className="flex items-center justify-end gap-2">
                        <Button variant="secondary" size="sm" className="hidden md:inline-flex" disabled={opening !== null} onClick={() => open(site.id)}>
                          {opening === site.id ? <Loader2 className="animate-spin" /> : <MousePointerClick />}
                          Öffnen
                        </Button>
                        <Menu>
                          <MenuTrigger aria-label={`Aktionen für ${site.name}`} className={buttonStyles({ variant: "ghost", size: "icon" })}>
                            {syncing === site.id ? <Loader2 className="animate-spin" /> : <MoreHorizontal strokeWidth={1.75} />}
                          </MenuTrigger>
                          <MenuContent>
                            <MenuItem icon={MousePointerClick} onClick={() => open(site.id)}>
                              Im CMS öffnen
                            </MenuItem>
                            {site.liveUrl && (
                              <MenuItem icon={ExternalLink} render={<a href={site.liveUrl} target="_blank" rel="noreferrer" />}>
                                Live ansehen
                              </MenuItem>
                            )}
                            {github && (
                              <MenuItem icon={RefreshCw} disabled={syncing !== null} onClick={() => sync(site)}>
                                Jetzt abgleichen
                              </MenuItem>
                            )}
                            <MenuSeparator />
                            <MenuItem icon={Building2} onClick={() => setDialog({ kind: "customer", site })}>
                              Kunde zuordnen
                            </MenuItem>
                            <MenuItem icon={UserPlus} onClick={() => setDialog({ kind: "invite", site })}>
                              Personen einladen
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem icon={Trash2} danger onClick={() => setDialog({ kind: "remove", site })}>
                              Entfernen
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <AssignCustomerDialog
        site={dialog?.kind === "customer" ? dialog.site : null}
        customers={customers}
        onClose={() => setDialog(null)}
      />
      <InviteDialog
        open={dialog?.kind === "invite"}
        onOpenChange={(next) => !next && setDialog(null)}
        sites={dialog?.kind === "invite" ? [{ id: dialog.site.id, name: dialog.site.name }] : []}
        defaultSiteId={dialog?.kind === "invite" ? dialog.site.id : undefined}
        title={dialog?.kind === "invite" ? `Personen zu ${dialog.site.name} einladen` : undefined}
      />
      <RemoveSiteDialog site={dialog?.kind === "remove" ? dialog.site : null} onClose={() => setDialog(null)} />
    </div>
  );
}

const NONE = "__none";

function AssignCustomerDialog({ site, customers, onClose }: { site: Site | null; customers: SelectItem[]; onClose: () => void }) {
  return (
    <Dialog open={site !== null} onOpenChange={(next) => !next && onClose()}>
      {site && <AssignCustomerBody key={site.id} site={site} customers={customers} onClose={onClose} />}
    </Dialog>
  );
}

function AssignCustomerBody({ site, customers, onClose }: { site: Site; customers: SelectItem[]; onClose: () => void }) {
  const [value, setValue] = useState(site.customerId ?? NONE);
  const [pending, startTransition] = useTransition();
  // An archived customer is not offered in the options but may still be assigned.
  const items = [
    { value: NONE, label: "Kein Kunde" },
    ...customers,
    ...(site.customerId && !customers.some((c) => c.value === site.customerId) ? [{ value: site.customerId, label: site.customer ?? "Unbekannt" }] : []),
  ];

  return (
    <DialogContent
      title="Kunde zuordnen"
      description={`Zu welchem Kunden gehört ${site.name}?`}
      size="sm"
      footer={
        <>
          <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={pending}>
            Abbrechen
          </DialogClose>
          <Button
            disabled={pending || value === (site.customerId ?? NONE)}
            onClick={() =>
              startTransition(async () => {
                const result = await assignSiteCustomer(site.id, value === NONE ? null : value);
                if (!result.ok) {
                  toast.error("Zuordnen fehlgeschlagen", { description: result.error });
                  return;
                }
                toast.success(value === NONE ? `${site.name} ist keinem Kunden mehr zugeordnet` : `${site.name} gehört jetzt zu ${items.find((i) => i.value === value)?.label}`);
                onClose();
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Speichern
          </Button>
        </>
      }
    >
      <Select label="Kunde" items={items} value={value} onValueChange={setValue} disabled={pending} />
    </DialogContent>
  );
}

function RemoveSiteDialog({ site, onClose }: { site: Site | null; onClose: () => void }) {
  return (
    <Dialog open={site !== null} onOpenChange={(next) => !next && onClose()}>
      {site && <RemoveSiteBody key={site.id} site={site} onClose={onClose} />}
    </Dialog>
  );
}

function RemoveSiteBody({ site, onClose }: { site: Site; onClose: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const github = site.source === "github";
  const matches = name.trim() === site.name;

  function submit() {
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      const result = await removeSite(site.id, name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`${site.name} entfernt`);
      onClose();
    });
  }

  return (
    <DialogContent
      title={`${site.name} entfernen?`}
      description="Die Website verschwindet aus kerncms, samt Team, Verlauf, Statistiken und Formular-Nachrichten."
      size="md"
      footer={
        <>
          <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={pending}>
            Abbrechen
          </DialogClose>
          <Button variant="danger" disabled={pending || !matches} onClick={submit}>
            {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Endgültig entfernen
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="rounded-xl bg-subtle px-4 py-3 text-[15px]">
          {github ? (
            <>
              Das Repository <span className="font-medium">{site.githubRepo}</span> auf GitHub bleibt unverändert. kerncms löscht nur seine eigene Kopie.
            </>
          ) : (
            <>
              Der Ordner <span className="font-mono text-sm">{site.repoPath}</span> bleibt unverändert. kerncms entfernt nur seinen Arbeitsordner.
            </>
          )}
        </div>
        <Field>
          <Label>
            Gib zur Bestätigung <span className="font-semibold">{site.name}</span> ein
          </Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" spellCheck={false} disabled={pending} />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </form>
    </DialogContent>
  );
}

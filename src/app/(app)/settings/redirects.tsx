"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2, Waypoints } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Badge, Card, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { SegmentedControl } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import type { Redirect } from "@/lib/kern-types";
import { saveRedirects } from "@/server/actions/content";

const types = [
  { value: "301", label: "301 dauerhaft" },
  { value: "302", label: "302 vorübergehend" },
];

export function Redirects({ initial, file, canEdit }: { initial: Redirect[]; file: string | null; canEdit: boolean }) {
  const [redirects, setRedirects] = useState(initial);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const filtered = redirects
    .map((r, index) => ({ ...r, index }))
    .filter((r) => r.from.toLowerCase().includes(q) || r.to.toLowerCase().includes(q));

  function openDialog(index: number | null) {
    setEditing(index);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  }

  /** Saves the whole list; returns an error message or null. */
  async function save(next: Redirect[]) {
    const result = await saveRedirects(next);
    if (!result.ok) return result.error;
    setRedirects(result.data as Redirect[]);
    return null;
  }

  if (!file) {
    return (
      <Card>
        <EmptyState
          icon={Waypoints}
          title="Weiterleitungen sind nicht eingerichtet"
          description="Trage in der kern.config.yaml unter „redirects“ eine JSON-Datei ein, z. B. src/content/globals/redirects.json. Die Website liest sie in astro.config.mjs."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" strokeWidth={1.75} />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Weiterleitungen durchsuchen" placeholder="Weiterleitungen durchsuchen" className="pl-11" />
        </div>
        {canEdit && (
          <Button onClick={() => openDialog(null)}>
            <Plus />
            Neue Weiterleitung
          </Button>
        )}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Waypoints}
            title={redirects.length === 0 ? "Noch keine Weiterleitungen" : "Keine Treffer"}
            description={redirects.length === 0 ? "Leite alte Adressen auf neue Seiten um, damit Links und Suchtreffer weiter funktionieren." : "Versuche es mit einem anderen Pfad."}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Von</Th>
                <Th className="w-0 px-2" aria-label="nach" />
                <Th className="pl-2">Nach</Th>
                <Th>Typ</Th>
                {canEdit && <Th className="w-0 pr-3 pl-0" aria-label="Aktionen" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.from} className="transition-colors hover:bg-subtle/50">
                  <Td className="font-mono text-sm whitespace-nowrap">{r.from}</Td>
                  <Td className="px-2 text-muted">
                    <ArrowRight className="size-4" strokeWidth={1.75} />
                  </Td>
                  <Td className="max-w-64 truncate pl-2 font-mono text-sm text-muted" title={r.to}>
                    {r.to}
                  </Td>
                  <Td>
                    <Badge tone={r.status === 301 ? "accent" : "warning"}>{r.status}</Badge>
                  </Td>
                  {canEdit && (
                    <Td className="w-0 pr-3 pl-0 text-right">
                      <Menu>
                        <MenuTrigger
                          aria-label={`Aktionen für ${r.from}`}
                          className={buttonStyles({ variant: "ghost", size: "icon", className: "data-popup-open:bg-subtle" })}
                        >
                          <MoreHorizontal />
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem icon={Pencil} onClick={() => openDialog(r.index)}>
                            Bearbeiten
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem icon={Trash2} danger onClick={() => setDeleting(r.index)}>
                            Löschen
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="text-sm text-muted">
        Gespeichert in <code className="font-mono">{file}</code>. Live nach dem nächsten Veröffentlichen.
      </p>

      <RedirectDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing === null ? null : redirects[editing]}
        others={redirects.filter((_, i) => i !== editing)}
        onSave={async (data) => {
          const next = editing === null ? [...redirects, data] : redirects.map((r, i) => (i === editing ? data : r));
          const error = await save(next);
          if (!error) toast.success(editing === null ? "Weiterleitung angelegt" : "Weiterleitung gespeichert", { description: `${data.from} → ${data.to}` });
          return error;
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Weiterleitung löschen?"
        description={deleting !== null ? `Aufrufe von ${redirects[deleting]?.from} führen danach ins Leere, wenn es diese Seite nicht mehr gibt.` : ""}
        confirmLabel="Löschen"
        danger
        onConfirm={() => {
          const index = deleting;
          if (index === null) return;
          startTransition(async () => {
            const error = await save(redirects.filter((_, i) => i !== index));
            if (error) toast.error("Löschen fehlgeschlagen", { description: error });
            else toast.success("Weiterleitung gelöscht");
          });
        }}
      />
    </div>
  );
}

function validate(from: string, to: string, others: Redirect[]) {
  const errors: { from?: string; to?: string } = {};
  if (!from.startsWith("/")) errors.from = "Der Pfad muss mit „/“ beginnen.";
  else if (from === "/") errors.from = "Die Startseite kann nicht weitergeleitet werden.";
  else if (others.some((r) => r.from === from)) errors.from = "Für diesen Pfad gibt es schon eine Weiterleitung.";
  if (!to) errors.to = "Bitte ein Ziel angeben.";
  else if (!to.startsWith("/") && !/^https?:\/\//.test(to)) errors.to = "Ein Pfad mit „/“ oder eine Adresse mit https://.";
  else if (to === from) errors.to = "Das Ziel darf nicht gleich der Quelle sein.";
  return errors;
}

function RedirectDialog({
  open,
  onOpenChange,
  initial,
  others,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Redirect | null;
  others: Redirect[];
  onSave: (data: Redirect) => Promise<string | null>;
}) {
  const [from, setFrom] = useState(initial?.from ?? "");
  const [to, setTo] = useState(initial?.to ?? "");
  const [status, setStatus] = useState<Redirect["status"]>(initial?.status ?? 301);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = validate(from.trim(), to.trim(), others);
  const valid = !errors.from && !errors.to;

  function submit() {
    setTouched(true);
    if (!valid) return;
    startTransition(async () => {
      const error = await onSave({ from: from.trim(), to: to.trim(), status });
      if (error) setServerError(error);
      else onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        title={initial ? "Weiterleitung bearbeiten" : "Neue Weiterleitung"}
        size="sm"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={pending}>
              Abbrechen
            </DialogClose>
            <Button onClick={submit} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {initial ? "Speichern" : "Anlegen"}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field invalid={touched && Boolean(errors.from)}>
            <Label>Von</Label>
            <Input value={from} onChange={(e) => setFrom(e.target.value)} onBlur={() => from && setTouched(true)} className="font-mono" />
            <Description className={touched && errors.from ? "text-danger" : undefined}>
              {touched && errors.from ? errors.from : "Alter Pfad, beginnt mit „/“."}
            </Description>
          </Field>
          <Field invalid={touched && Boolean(errors.to)}>
            <Label>Nach</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} className="font-mono" />
            <Description className={touched && errors.to ? "text-danger" : undefined}>
              {touched && errors.to ? errors.to : "Neuer Pfad oder vollständige Adresse."}
            </Description>
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-medium">Typ</span>
            <SegmentedControl
              label="Typ"
              items={types}
              value={String(status)}
              onValueChange={(v) => setStatus(v === "302" ? 302 : 301)}
              className="self-start"
            />
            <span className="text-sm text-muted">
              {status === 301 ? "Dauerhaft: Suchmaschinen übernehmen die neue Adresse." : "Vorübergehend: Die alte Adresse bleibt in Suchmaschinen."}
            </span>
          </div>
          {serverError && (
            <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
              {serverError}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

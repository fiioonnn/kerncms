"use client";

import { useState } from "react";
import { ArrowRight, MoreHorizontal, Pencil, Plus, Search, Trash2, Waypoints } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Badge, Card, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { SegmentedControl, Tooltip } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";

type Redirect = { id: string; from: string; to: string; type: "301" | "302"; hits: number; auto?: boolean };

const initialRedirects: Redirect[] = [
  { id: "1", from: "/produkte", to: "/sortiment", type: "301", hits: 1284, auto: true },
  { id: "2", from: "/blog/sauerteig-ab-mai", to: "/blog/neue-sauerteigbrote-ab-mai", type: "301", hits: 312, auto: true },
  { id: "3", from: "/team", to: "/ueber-uns", type: "301", hits: 205 },
  { id: "4", from: "/weihnachten", to: "/blog/stollenzeit-2026", type: "302", hits: 48 },
  { id: "5", from: "/bestellen", to: "https://bestellen.baeckerei-mueller.de", type: "302", hits: 2210 },
  { id: "6", from: "/filialen/vaihingen", to: "/kontakt", type: "301", hits: 17, auto: true },
];

const types = [
  { value: "301", label: "301 dauerhaft" },
  { value: "302", label: "302 vorübergehend" },
];

const numberFormat = new Intl.NumberFormat("de-DE");

export function Redirects() {
  const [redirects, setRedirects] = useState(initialRedirects);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Redirect | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [deleting, setDeleting] = useState<Redirect | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = redirects.filter((r) => r.from.toLowerCase().includes(q) || r.to.toLowerCase().includes(q));

  function openDialog(r: Redirect | null) {
    setEditing(r);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" strokeWidth={1.75} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Weiterleitungen durchsuchen"
            placeholder="Weiterleitungen durchsuchen"
            className="pl-11"
          />
        </div>
        <Button onClick={() => openDialog(null)}>
          <Plus />
          Neue Weiterleitung
        </Button>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Waypoints}
            title={redirects.length === 0 ? "Noch keine Weiterleitungen" : "Keine Treffer"}
            description={
              redirects.length === 0
                ? "Wenn du den Pfad einer Seite änderst, legt kerncms die Weiterleitung automatisch an."
                : "Versuche es mit einem anderen Pfad."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Von</Th>
                <Th className="w-0 px-0" aria-label="nach" />
                <Th>Nach</Th>
                <Th>Typ</Th>
                <Th className="text-right">Aufrufe</Th>
                <Th className="w-0" aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-subtle/50">
                  <Td>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm">{r.from}</span>
                      {r.auto && (
                        <Tooltip label="Beim Ändern des Seitenpfads angelegt">
                          <span tabIndex={0}>
                            <Badge className="h-6 px-2.5 text-xs">automatisch</Badge>
                          </span>
                        </Tooltip>
                      )}
                    </span>
                  </Td>
                  <Td className="px-0 text-muted">
                    <ArrowRight className="size-4" strokeWidth={1.75} />
                  </Td>
                  <Td className="max-w-64 truncate font-mono text-sm text-muted">{r.to}</Td>
                  <Td>
                    <Badge tone={r.type === "301" ? "accent" : "warning"}>{r.type}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums text-muted">{numberFormat.format(r.hits)}</Td>
                  <Td>
                    <Menu>
                      <MenuTrigger
                        aria-label={`Aktionen für ${r.from}`}
                        className={buttonStyles({ variant: "ghost", size: "icon", className: "data-popup-open:bg-subtle" })}
                      >
                        <MoreHorizontal />
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={Pencil} onClick={() => openDialog(r)}>
                          Bearbeiten
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem icon={Trash2} danger onClick={() => setDeleting(r)}>
                          Löschen
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="text-sm text-muted">
        Weiterleitungen werden beim nächsten Veröffentlichen in die Hosting-Konfiguration geschrieben.
      </p>

      <RedirectDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSave={(data) => {
          if (editing) {
            setRedirects((list) => list.map((r) => (r.id === editing.id ? { ...r, ...data, auto: false } : r)));
            toast.success("Weiterleitung gespeichert");
          } else {
            setRedirects((list) => [{ id: String(Date.now()), hits: 0, ...data }, ...list]);
            toast.success("Weiterleitung angelegt", { description: `${data.from} → ${data.to}` });
          }
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Weiterleitung löschen?"
        description={
          deleting ? `Aufrufe von ${deleting.from} führen danach ins Leere, wenn es diese Seite nicht mehr gibt.` : ""
        }
        confirmLabel="Löschen"
        danger
        onConfirm={() => {
          if (!deleting) return;
          setRedirects((list) => list.filter((r) => r.id !== deleting.id));
          toast.success("Weiterleitung gelöscht");
        }}
      />
    </div>
  );
}

function RedirectDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Redirect | null;
  onSave: (data: Pick<Redirect, "from" | "to" | "type">) => void;
}) {
  const [from, setFrom] = useState(initial?.from ?? "");
  const [to, setTo] = useState(initial?.to ?? "");
  const [type, setType] = useState<Redirect["type"]>(initial?.type ?? "301");
  const fromValid = from.trim().startsWith("/");
  const valid = fromValid && to.trim().length > 0 && from.trim() !== to.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={initial ? "Weiterleitung bearbeiten" : "Neue Weiterleitung"}
        size="sm"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <DialogClose
              className={buttonStyles()}
              disabled={!valid}
              onClick={() => onSave({ from: from.trim(), to: to.trim(), type })}
            >
              {initial ? "Speichern" : "Anlegen"}
            </DialogClose>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <Field invalid={from.length > 0 && !fromValid}>
            <Label>Von</Label>
            <Input value={from} onChange={(e) => setFrom(e.target.value)} className="font-mono" autoFocus />
            <Description>Alter Pfad, beginnt mit „/“.</Description>
          </Field>
          <Field>
            <Label>Nach</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} className="font-mono" />
            <Description>Neuer Pfad oder vollständige URL.</Description>
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-medium">Typ</span>
            <SegmentedControl
              label="Typ"
              items={types}
              value={type}
              onValueChange={(v) => setType(v as Redirect["type"])}
              className="self-start"
            />
            <span className="text-sm text-muted">
              {type === "301"
                ? "Dauerhaft: Suchmaschinen übernehmen die neue Adresse."
                : "Vorübergehend: Die alte Adresse bleibt in Suchmaschinen."}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

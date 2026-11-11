"use client";

import { useState } from "react";
import { Lock, Plus } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Card } from "@/components/ui/display";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/toggles";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/overlay";

type Permission = { key: string; label: string; description: string };

const groups: { label: string; permissions: Permission[] }[] = [
  {
    label: "Inhalte",
    permissions: [
      { key: "edit", label: "Inhalte bearbeiten", description: "Texte, Bilder und Blöcke ändern" },
      { key: "pages", label: "Seiten anlegen/löschen", description: "Neue Seiten und Beiträge, Seiten entfernen" },
      { key: "media", label: "Medien hochladen", description: "Bilder und Dateien in die Mediathek" },
      { key: "globals", label: "Navigation & Globals", description: "Menüs, Öffnungszeiten, Kontaktdaten" },
    ],
  },
  {
    label: "Veröffentlichung",
    permissions: [
      { key: "publish", label: "Veröffentlichen", description: "Eigene Änderungen ohne Freigabe live stellen" },
      { key: "approve", label: "Freigaben erteilen", description: "Änderungen anderer prüfen und freigeben" },
    ],
  },
  {
    label: "Verwaltung",
    permissions: [
      { key: "settings", label: "Einstellungen", description: "Repository, Domain, Tracking, Weiterleitungen" },
      { key: "team", label: "Team verwalten", description: "Personen einladen, Rollen vergeben" },
    ],
  },
];

const allKeys = groups.flatMap((g) => g.permissions.map((p) => p.key));

type Role = { id: string; name: string; locked?: boolean; permissions: Set<string> };

const initialRoles: Role[] = [
  { id: "admin", name: "Admin", locked: true, permissions: new Set(allKeys) },
  { id: "editor", name: "Redakteur", permissions: new Set(["edit", "pages", "media", "globals"]) },
  { id: "viewer", name: "Nur lesen", permissions: new Set() },
];

export function RolesMatrix() {
  const [roles, setRoles] = useState(initialRoles);

  function toggle(roleId: string, key: string, checked: boolean) {
    setRoles((list) =>
      list.map((r) => {
        if (r.id !== roleId) return r;
        const permissions = new Set(r.permissions);
        if (checked) permissions.add(key);
        else permissions.delete(key);
        return { ...r, permissions };
      }),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-[15px] text-muted">
          Was jede Rolle darf. Änderungen gelten sofort für alle Personen mit dieser Rolle.
        </p>
        <NewRoleDialog
          roles={roles}
          onCreate={(name, base) => {
            const template = roles.find((r) => r.id === base);
            setRoles((list) => [
              ...list,
              { id: `custom-${Date.now()}`, name, permissions: new Set(template?.permissions ?? []) },
            ]);
            toast.success("Rolle angelegt", { description: `„${name}“ kann jetzt vergeben werden.` });
          }}
        />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr>
                <th className="h-12 rounded-tl-2xl border-b border-border bg-subtle/60 px-6 text-sm font-medium text-muted">
                  Berechtigung
                </th>
                {roles.map((role) => (
                  <th
                    key={role.id}
                    className="h-12 min-w-32 border-b border-border bg-subtle/60 px-4 text-center text-sm font-semibold last:rounded-tr-2xl"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {role.name}
                      {role.locked && (
                        <Tooltip label="Admins haben immer alle Rechte">
                          <Lock className="size-3.5 text-muted" strokeWidth={1.75} tabIndex={0} aria-label="Gesperrt" />
                        </Tooltip>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.label}>
                <tr>
                  <td
                    colSpan={roles.length + 1}
                    className="border-b border-border bg-subtle/30 px-6 pt-4 pb-2 text-xs font-semibold tracking-wider text-muted uppercase"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.permissions.map((p) => (
                  <tr key={p.key} className="transition-colors hover:bg-subtle/40">
                    <td className="border-b border-border px-6 py-3">
                      <span className="flex flex-col">
                        <span className="font-medium">{p.label}</span>
                        <span className="text-sm text-muted">{p.description}</span>
                      </span>
                    </td>
                    {roles.map((role) => (
                      <td key={role.id} className="border-b border-border px-4 py-3">
                        <Checkbox
                          label={`${p.label} für ${role.name}`}
                          hideLabel
                          className="justify-center"
                          checked={role.locked || role.permissions.has(p.key)}
                          disabled={role.locked}
                          onCheckedChange={(checked) => toggle(role.id, p.key, checked)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Card>
    </div>
  );
}

function NewRoleDialog({ roles, onCreate }: { roles: Role[]; onCreate: (name: string, base: string) => void }) {
  const [name, setName] = useState("");
  const [base, setBase] = useState("viewer");
  const taken = roles.some((r) => r.name.toLowerCase() === name.trim().toLowerCase());

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setName("");
          setBase("viewer");
        }
      }}
    >
      <DialogTrigger className={buttonStyles({ variant: "secondary" })}>
        <Plus />
        Neue Rolle
      </DialogTrigger>
      <DialogContent
        title="Neue Rolle"
        description="Die Rechte lassen sich danach in der Tabelle anpassen."
        size="sm"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <DialogClose className={buttonStyles()} disabled={!name.trim() || taken} onClick={() => onCreate(name.trim(), base)}>
              Rolle anlegen
            </DialogClose>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <Field invalid={taken}>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            {taken && <Description className="text-danger">Diese Rolle gibt es schon.</Description>}
          </Field>
          <Select
            label="Rechte übernehmen von"
            items={roles.map((r) => ({ label: r.name, value: r.id }))}
            defaultValue="viewer"
            onValueChange={setBase}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

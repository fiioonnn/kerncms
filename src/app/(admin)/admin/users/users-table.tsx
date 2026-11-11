"use client";

import { useState, useTransition } from "react";
import { Ban, KeyRound, Loader2, MoreHorizontal, Search, Shield, ShieldOff, Trash2, UserCheck, Users } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Avatar, Badge, Card, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { formatWhen } from "@/lib/admin-format";
import { roleLabels, type RoleName } from "@/lib/kern-types";
import { deleteUser, setMembershipRole, setUserAdmin, setUserDisabled } from "@/server/actions/admin";
import { roleItems } from "../_components/invite-dialog";
import { SearchInput } from "../_components/shared";

type User = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  disabled: boolean;
  lastLogin: string | null;
  sites: { id: string; name: string; role: RoleName }[];
};
type Site = { id: string; name: string; customer: string | null };

type Confirm = { kind: "admin" | "disable" | "delete"; user: User } | null;

export function UsersTable({ me, users, sites }: { me: string; users: User[]; sites: Site[] }) {
  const [query, setQuery] = useState("");
  // Kept after closing so the dialog keeps its text during the close animation.
  const [confirm, setConfirmState] = useState<Confirm>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const setConfirm = (next: Confirm) => {
    setConfirmState(next);
    setConfirmOpen(true);
  };
  const [access, setAccess] = useState<User | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const rows = users.filter((u) => !q || [u.name, u.email, ...u.sites.map((s) => s.name)].some((v) => v.toLowerCase().includes(q)));

  function act(user: User, fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, failure: string) {
    setBusy(user.id);
    startTransition(async () => {
      const result = await fn();
      setBusy(null);
      if (!result.ok) toast.error(failure, { description: result.error });
      else toast.success(success);
    });
  }

  function runConfirm() {
    if (!confirm) return;
    const { kind, user } = confirm;
    if (kind === "admin") {
      const next = !user.isAdmin;
      act(user, () => setUserAdmin(user.id, next), next ? `${user.name} ist jetzt Admin` : `${user.name} ist kein Admin mehr`, "Ändern fehlgeschlagen");
    } else if (kind === "disable") {
      const next = !user.disabled;
      act(user, () => setUserDisabled(user.id, next), next ? `${user.name} ist gesperrt` : `${user.name} ist entsperrt`, "Ändern fehlgeschlagen");
    } else {
      act(user, () => deleteUser(user.id), `${user.name} gelöscht`, "Löschen fehlgeschlagen");
    }
  }

  const texts = confirm && confirmTexts(confirm.kind, confirm.user);

  return (
    <div className="flex flex-col gap-5">
      <SearchInput value={query} onChange={setQuery} label="Nutzer durchsuchen" />

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={users.length ? Search : Users} title={users.length ? "Niemand gefunden" : "Noch keine Nutzer"} description={users.length ? "Versuche es mit einem anderen Namen oder einer E-Mail-Adresse." : undefined} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="hidden lg:table-cell">Websites</Th>
                <Th className="hidden md:table-cell">Letzte Anmeldung</Th>
                <Th className="w-0" aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => {
                const self = user.id === me;
                return (
                  <tr key={user.id} className={user.disabled ? "bg-subtle/40" : undefined}>
                    <Td className="py-3">
                      <span className="flex items-center gap-4">
                        <Avatar name={user.name} className={user.disabled ? "opacity-50" : undefined} />
                        <span className="flex min-w-0 flex-col leading-snug">
                          <span className="flex flex-wrap items-center gap-2 text-base font-medium">
                            {user.name}
                            {self && <Badge className="h-6 px-2 text-xs">Du</Badge>}
                            {user.isAdmin && (
                              <Badge tone="accent" className="h-6 px-2 text-xs">
                                <Shield className="size-3" />
                                Admin
                              </Badge>
                            )}
                            {user.disabled && (
                              <Badge tone="danger" className="h-6 px-2 text-xs">
                                <Ban className="size-3" />
                                Gesperrt
                              </Badge>
                            )}
                          </span>
                          <span className="truncate text-sm text-muted">{user.email}</span>
                        </span>
                      </span>
                    </Td>
                    <Td className="hidden py-3 lg:table-cell">
                      {user.sites.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {user.sites.map((s) => (
                            <Badge key={s.id}>
                              {s.name}
                              <span className="text-muted">· {roleLabels[s.role]}</span>
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted">{user.isAdmin ? "Alle, als Admin" : "Keine"}</span>
                      )}
                    </Td>
                    <Td suppressHydrationWarning className="hidden text-muted md:table-cell">{user.lastLogin ? formatWhen(user.lastLogin) : "Noch nie"}</Td>
                    <Td className="w-0 text-right">
                      <Menu>
                        <MenuTrigger aria-label={`Aktionen für ${user.name}`} className={buttonStyles({ variant: "ghost", size: "icon" })} disabled={busy === user.id}>
                          {busy === user.id ? <Loader2 className="animate-spin" /> : <MoreHorizontal strokeWidth={1.75} />}
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem icon={KeyRound} onClick={() => setAccess(user)}>
                            Zugriff bearbeiten
                          </MenuItem>
                          <MenuItem icon={user.isAdmin ? ShieldOff : Shield} disabled={self} onClick={() => setConfirm({ kind: "admin", user })}>
                            {user.isAdmin ? "Admin-Rechte entziehen" : "Admin-Rechte geben"}
                          </MenuItem>
                          <MenuItem icon={user.disabled ? UserCheck : Ban} disabled={self} onClick={() => setConfirm({ kind: "disable", user })}>
                            {user.disabled ? "Entsperren" : "Sperren"}
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem icon={Trash2} danger disabled={self} onClick={() => setConfirm({ kind: "delete", user })}>
                            Löschen
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={texts?.title ?? ""}
        description={texts?.description ?? ""}
        confirmLabel={texts?.confirm ?? ""}
        danger={texts?.danger}
        onConfirm={runConfirm}
      />

      <AccessDialog user={access} sites={sites} onClose={() => setAccess(null)} />
    </div>
  );
}

function confirmTexts(kind: "admin" | "disable" | "delete", user: User) {
  if (kind === "admin") {
    return user.isAdmin
      ? { title: `${user.name} die Admin-Rechte entziehen?`, description: "Die Person sieht danach nur noch die Websites, zu denen sie eingeladen wurde, und kommt nicht mehr in den Admin-Bereich.", confirm: "Rechte entziehen", danger: true }
      : { title: `${user.name} zum Admin machen?`, description: "Admins sehen alle Kunden und Websites, können Personen einladen, sperren und löschen und GitHub verwalten.", confirm: "Zum Admin machen", danger: false };
  }
  if (kind === "disable") {
    return user.disabled
      ? { title: `${user.name} entsperren?`, description: "Die Person kann sich wieder anmelden und hat wieder Zugriff auf ihre Websites.", confirm: "Entsperren", danger: false }
      : { title: `${user.name} sperren?`, description: "Die Person wird sofort abgemeldet und kann sich nicht mehr anmelden. Ihr Zugriff bleibt gespeichert, bis du sie entsperrst.", confirm: "Sperren", danger: true };
  }
  return {
    title: `${user.name} löschen?`,
    description: "Das Konto und alle Zugriffe werden gelöscht. Änderungen der Person bleiben im Verlauf der Websites erhalten. Das lässt sich nicht rückgängig machen.",
    confirm: "Endgültig löschen",
    danger: true,
  };
}

const NO_ACCESS = "__none";

function AccessDialog({ user, sites, onClose }: { user: User | null; sites: Site[]; onClose: () => void }) {
  return (
    <Dialog open={user !== null} onOpenChange={(next) => !next && onClose()}>
      {user && <AccessBody key={user.id} user={user} sites={sites} />}
    </Dialog>
  );
}

function AccessBody({ user, sites }: { user: User; sites: Site[] }) {
  const [roles, setRoles] = useState<Record<string, string>>(() => Object.fromEntries(user.sites.map((s) => [s.id, s.role])));
  const [saving, setSaving] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const items = [{ value: NO_ACCESS, label: "Kein Zugriff" }, ...roleItems];

  function change(site: Site, value: string) {
    const previous = roles[site.id] ?? NO_ACCESS;
    if (value === previous) return;
    setRoles((r) => ({ ...r, [site.id]: value }));
    setSaving(site.id);
    startTransition(async () => {
      const result = await setMembershipRole(site.id, user.id, value === NO_ACCESS ? null : (value as RoleName));
      setSaving(null);
      if (!result.ok) {
        setRoles((r) => ({ ...r, [site.id]: previous }));
        toast.error("Zugriff nicht geändert", { description: result.error });
        return;
      }
      toast.success(value === NO_ACCESS ? `Kein Zugriff mehr auf ${site.name}` : `${roleLabels[value as RoleName]} auf ${site.name}`);
    });
  }

  return (
    <DialogContent
      title={`Zugriff von ${user.name}`}
      description={
        user.isAdmin
          ? "Als Admin kann die Person ohnehin alle Websites öffnen. Hier legst du fest, in welchen Teams sie geführt wird."
          : "Auf welchen Websites die Person mit welcher Rolle arbeitet. Änderungen gelten sofort."
      }
      size="lg"
      footer={<DialogClose className={buttonStyles()}>Fertig</DialogClose>}
    >
      {sites.length === 0 ? (
        <p className="text-[15px] text-muted">Es ist noch keine Website verbunden.</p>
      ) : (
        <ul className="-my-2 flex flex-col">
          {sites.map((site) => (
            <li key={site.id} className="flex flex-col gap-3 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center">
              <span className="flex min-w-0 flex-1 flex-col leading-snug">
                <span className="flex items-center gap-2 text-base font-medium">
                  {site.name}
                  {saving === site.id && <Loader2 className="size-4 animate-spin text-muted" />}
                </span>
                {site.customer && <span className="truncate text-sm text-muted">{site.customer}</span>}
              </span>
              <Select
                aria-label={`Rolle auf ${site.name}`}
                items={items}
                value={roles[site.id] ?? NO_ACCESS}
                onValueChange={(v) => change(site, v)}
                disabled={saving !== null}
                className="sm:w-52"
              />
            </li>
          ))}
        </ul>
      )}
    </DialogContent>
  );
}

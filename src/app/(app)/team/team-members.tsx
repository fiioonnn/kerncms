"use client";

import { useState, useTransition } from "react";
import { Loader2, MailCheck, MailWarning, UserMinus, UserPlus, X } from "lucide-react";
import { CopyButton } from "@/components/actions/common";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Avatar, Badge, Card, CardHeader, Table, Td, Th } from "@/components/ui/display";
import { Field, Input, Label } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/admin-format";
import { roleLabels, type RoleName } from "@/lib/kern-types";
import { changeRole, inviteMember, removeMember, revokeInvite } from "@/server/actions/team";

type Member = { id: string; name: string; email: string; role: RoleName; since: string };
type Invite = { id: string; email: string; role: RoleName; expiresAt: string };

const rank: Record<RoleName, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

/** Roles the current user may hand out. Only owners can make owners. */
function assignable(myRole: RoleName) {
  return (["viewer", "editor", "admin", "owner"] as RoleName[])
    .filter((r) => r !== "owner" || myRole === "owner")
    .map((r) => ({ value: r, label: roleLabels[r] }));
}

export function TeamTables({ me, myRole, members, invites }: { me: string; myRole: RoleName; members: Member[]; invites: Invite[] }) {
  const canManage = rank[myRole] >= rank.admin;
  const [removing, setRemoving] = useState<Member | null>(null);
  const [pending, startTransition] = useTransition();

  function setRole(member: Member, role: RoleName) {
    if (role === member.role) return;
    startTransition(async () => {
      const result = await changeRole(member.id, role);
      if (!result.ok) toast.error("Rolle nicht geändert", { description: result.error });
      else toast.success(`${member.name} ist jetzt ${roleLabels[role]}`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th className="w-56">Rolle</Th>
              <Th className="hidden md:table-cell">Dabei seit</Th>
              {canManage && <Th className="w-0" aria-label="Aktionen" />}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const editable = canManage && member.id !== me && (member.role !== "owner" || myRole === "owner");
              return (
                <tr key={member.id}>
                  <Td>
                    <span className="flex items-center gap-4">
                      <Avatar name={member.name} />
                      <span className="flex min-w-0 flex-col leading-snug">
                        <span className="flex items-center gap-2 text-base font-medium">
                          {member.name}
                          {member.id === me && <Badge className="h-6 px-2 text-xs">Du</Badge>}
                        </span>
                        <span className="truncate text-sm text-muted">{member.email}</span>
                      </span>
                    </span>
                  </Td>
                  <Td>
                    {editable ? (
                      <Select
                        aria-label={`Rolle von ${member.name}`}
                        items={assignable(myRole)}
                        value={member.role}
                        disabled={pending}
                        onValueChange={(v) => setRole(member, v as RoleName)}
                      />
                    ) : (
                      <Badge tone={member.role === "owner" || member.role === "admin" ? "accent" : "neutral"}>{roleLabels[member.role]}</Badge>
                    )}
                  </Td>
                  <Td className="hidden text-muted md:table-cell">{formatDate(member.since)}</Td>
                  {canManage && (
                    <Td className="w-0 text-right">
                      {editable && (
                        <Tooltip label="Aus dem Team entfernen">
                          <Button variant="ghost" size="icon" aria-label={`${member.name} entfernen`} onClick={() => setRemoving(member)}>
                            <UserMinus strokeWidth={1.75} />
                          </Button>
                        </Tooltip>
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {canManage && invites.length > 0 && (
        <Card>
          <CardHeader title="Offene Einladungen" description="Noch nicht angenommen. Links gelten 7 Tage." className="pb-4" />
          <Table>
            <thead>
              <tr>
                <Th>E-Mail</Th>
                <Th>Rolle</Th>
                <Th className="hidden md:table-cell">Gültig bis</Th>
                <Th className="w-0" aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <InviteRow key={invite.id} invite={invite} />
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? `${removing.name} entfernen?` : ""}
        description="Die Person verliert sofort den Zugriff auf diese Website. Ihre Änderungen bleiben im Verlauf."
        confirmLabel="Entfernen"
        danger
        onConfirm={() => {
          const member = removing;
          if (!member) return;
          startTransition(async () => {
            const result = await removeMember(member.id);
            if (!result.ok) toast.error("Entfernen fehlgeschlagen", { description: result.error });
            else toast.success(`${member.name} entfernt`);
          });
        }}
      />
    </div>
  );
}

function InviteRow({ invite }: { invite: Invite }) {
  const [pending, startTransition] = useTransition();
  return (
    <tr>
      <Td>{invite.email}</Td>
      <Td>
        <Badge>{roleLabels[invite.role]}</Badge>
      </Td>
      <Td className="hidden text-muted md:table-cell">{formatDate(invite.expiresAt)}</Td>
      <Td className="w-0 text-right">
        <Tooltip label="Einladung zurückziehen">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Einladung an ${invite.email} zurückziehen`}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await revokeInvite(invite.id);
                if (!result.ok) toast.error("Zurückziehen fehlgeschlagen", { description: result.error });
                else toast.success("Einladung zurückgezogen");
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <X strokeWidth={1.75} />}
          </Button>
        </Tooltip>
      </Td>
    </tr>
  );
}

export function InviteDialog({ myRole }: { myRole: RoleName }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleName>("editor");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; link: string; mailed: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setEmail("");
    setRole("editor");
    setError(null);
    setResult(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await inviteMember({ email, role });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult({ email: email.trim().toLowerCase(), ...res.data });
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button onClick={() => setOpen(true)}>
        <UserPlus />
        Einladen
      </Button>
      {result ? (
        <DialogContent
          title={result.mailed ? `Einladung an ${result.email} verschickt` : "Einladung angelegt"}
          description={
            result.mailed
              ? "Die Person bekommt eine E-Mail mit dem Link. Du kannst ihn auch selbst weitergeben."
              : "Die E-Mail konnte nicht verschickt werden. Gib den Link bitte selbst weiter."
          }
          size="sm"
          footer={<DialogClose className={buttonStyles()}>Fertig</DialogClose>}
        >
          <div className="flex flex-col gap-4">
            <div
              className={
                result.mailed
                  ? "flex items-center gap-3 rounded-xl bg-success-soft px-4 py-3 text-[15px] text-success"
                  : "flex items-center gap-3 rounded-xl bg-warning-soft px-4 py-3 text-[15px] text-warning"
              }
            >
              {result.mailed ? <MailCheck className="size-5 shrink-0" /> : <MailWarning className="size-5 shrink-0" />}
              {result.mailed ? "E-Mail verschickt" : "E-Mail nicht verschickt"}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-medium">Einladungslink</span>
              <code className="rounded-xl border border-border bg-subtle/50 px-4 py-3 font-mono text-sm break-all">{result.link}</code>
              <div>
                <CopyButton value={result.link} label="Link kopieren" />
              </div>
              <span className="text-sm text-muted">Gilt 7 Tage und nur für {result.email}.</span>
            </div>
          </div>
        </DialogContent>
      ) : (
        <DialogContent
          title="Person einladen"
          description="Die Person bekommt einen Link per E-Mail und meldet sich damit an."
          size="sm"
          footer={
            <>
              <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={pending}>
                Abbrechen
              </DialogClose>
              <Button onClick={submit} disabled={pending || !email.trim()}>
                {pending && <Loader2 className="animate-spin" />}
                Einladen
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
            <Field invalid={Boolean(error)}>
              <Label>E-Mail</Label>
              <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Select label="Rolle" items={assignable(myRole)} value={role} onValueChange={(v) => setRole(v as RoleName)} />
            {error && (
              <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
                {error}
              </p>
            )}
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

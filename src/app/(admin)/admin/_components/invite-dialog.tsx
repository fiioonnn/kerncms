"use client";

import { useState, useTransition } from "react";
import { Loader2, MailCheck, MailWarning, UserPlus } from "lucide-react";
import { CopyButton } from "@/components/actions/common";
import { Button, buttonStyles, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Label } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { roleLabels, type RoleName } from "@/lib/kern-types";
import { inviteToSite } from "@/server/actions/admin";
import { ErrorNote } from "./shared";

export const roleItems = (["owner", "admin", "editor", "viewer"] as RoleName[]).map((value) => ({ value, label: roleLabels[value] }));

type Site = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: Site[];
  defaultSiteId?: string;
  defaultEmail?: string;
  defaultRole?: RoleName;
  title?: string;
};

/** Invite someone to one site: sends the link by mail and shows it for copying. Controlled. */
export function InviteDialog(props: Props) {
  const { open, onOpenChange } = props;
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      {/* Remount the body on every open so it starts with fresh defaults. */}
      {open && <InviteBody {...props} onPendingChange={setPending} />}
    </Dialog>
  );
}

function InviteBody({
  sites,
  defaultSiteId,
  defaultEmail = "",
  defaultRole = "owner",
  title = "Personen einladen",
  onPendingChange,
}: Props & { onPendingChange: (pending: boolean) => void }) {
  const [siteId, setSiteId] = useState<string | null>(defaultSiteId ?? (sites.length === 1 ? sites[0].id : null));
  const [email, setEmail] = useState(defaultEmail);
  const [role, setRole] = useState<RoleName>(defaultRole);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; site: string; link: string; mailed: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!siteId) return;
    setError(null);
    onPendingChange(true);
    startTransition(async () => {
      const res = await inviteToSite({ siteId, email, role });
      onPendingChange(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult({ email: email.trim().toLowerCase(), site: sites.find((s) => s.id === siteId)?.name ?? "", ...res.data });
    });
  }

  if (result) {
    return (
      <DialogContent
        title={result.mailed ? `Einladung an ${result.email} verschickt` : "Einladung angelegt"}
        description={
          result.mailed
            ? `Die Person bekommt eine E-Mail mit dem Link zu ${result.site}. Du kannst ihn auch selbst weitergeben.`
            : "Die E-Mail konnte nicht verschickt werden. Gib den Link bitte selbst weiter."
        }
        size="md"
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
    );
  }

  return (
    <DialogContent
      title={title}
      description="Die Person bekommt einen Link per E-Mail und meldet sich damit an."
      size="md"
      footer={
        <>
          <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={pending}>
            Abbrechen
          </DialogClose>
          <Button onClick={submit} disabled={pending || !email.trim() || !siteId}>
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
          e.stopPropagation();
          submit();
        }}
      >
        {sites.length > 1 || !siteId ? (
          <Select label="Website" items={sites.map((s) => ({ value: s.id, label: s.name }))} value={siteId} onValueChange={setSiteId} disabled={pending} />
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-[15px] font-medium">Website</span>
            <span className="text-[15px] text-muted">{sites.find((s) => s.id === siteId)?.name}</span>
          </div>
        )}
        <Field invalid={Boolean(error)}>
          <Label>E-Mail</Label>
          <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
        </Field>
        <div className="flex flex-col gap-2">
          <Select label="Rolle" items={roleItems} value={role} onValueChange={(v) => setRole(v as RoleName)} disabled={pending} />
          <p className="text-sm text-muted">Inhaber verwalten die Website samt Team, Redakteure pflegen nur Inhalte.</p>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <button type="submit" hidden />
      </form>
    </DialogContent>
  );
}

/** Button that opens the invite dialog. */
export function InviteButton({
  label = "Personen einladen",
  variant = "secondary",
  size = "md",
  disabled,
  ...props
}: Omit<Props, "open" | "onOpenChange"> & { label?: string; variant?: ButtonVariant; size?: ButtonSize; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} disabled={disabled} onClick={() => setOpen(true)}>
        <UserPlus />
        {label}
      </Button>
      <InviteDialog open={open} onOpenChange={setOpen} {...props} />
    </>
  );
}

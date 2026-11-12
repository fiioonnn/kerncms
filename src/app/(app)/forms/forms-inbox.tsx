"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Bell, BellOff, ChevronDown, CircleAlert, CircleCheck, Download, Inbox, Loader2, Mail, MailOpen, RefreshCw, Reply, Settings2, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { refreshStatus, useStatus } from "@/components/history/use-status";
import { useKern } from "@/components/kern/kern-provider";
import { PageContainer } from "@/components/layout/page-container";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import type { FormDef } from "@/lib/kern-types";
import { formatWhen } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { loadSubmissions, resendSubmissionMail, type FormSettingsInput } from "@/server/actions/forms";
import { deleteSubmissions, updateSubmissions } from "@/server/actions/site";
import { Tooltip } from "@/components/ui/overlay";
import { cleanLabel, displayValue, replyMailto } from "@/lib/form-template";

type Submission = {
  id: string;
  form: string;
  data: Record<string, string>;
  page: string | null;
  read: boolean;
  archived: boolean;
  spam: boolean;
  spamReason: string | null;
  mailStatus: "sent" | "failed" | "off" | null;
  mailError: string | null;
  mailedAt: string | null;
  createdAt: string;
};

/** Who sent it and what it is about, guessed from the form's fields. */
function summarize(s: Submission, form: FormDef | undefined) {
  const fields = form?.fields ?? [];
  const value = (name?: string) => (name ? (s.data[name] ?? "").trim() : "");
  const email = value(fields.find((f) => f.type === "email")?.name) || value("email");
  const name = value("name") || value(fields.find((f) => f.type === "text" && /name/i.test(f.name))?.name);
  const subjectField = fields.find((f) => /betreff|subject|thema/i.test(f.name));
  const textField = fields.find((f) => f.type === "textarea") ?? fields.find((f) => f.name === "message" || f.name === "nachricht");
  const subject = value(subjectField?.name) || value(textField?.name).replace(/\s+/g, " ").slice(0, 80) || form?.label || s.form;
  return { sender: name || email || "Unbekannt", email, subject };
}

export function FormsInbox({
  forms,
  initial,
  settings,
  canConfigure,
}: {
  forms: FormDef[];
  initial: Submission[];
  settings: Record<string, FormSettingsInput>;
  canConfigure: boolean;
}) {
  const kern = useKern();
  const [items, setItems] = useState(initial);
  const [formKey, setFormKey] = useState<string | null>(null);
  const [tab, setTab] = useState<"inbox" | "archive" | "spam">("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSpamOpen, setConfirmSpamOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [reloading, setReloading] = useState(false);
  const status = useStatus();

  // New submissions show up without a reload: when the status poll reports more unread
  // messages, every minute as a fallback (spam, other people's changes), and on returning to the tab.
  const reload = useCallback(async (manual = false) => {
    if (manual) setReloading(true);
    const result = await loadSubmissions();
    if (manual) setReloading(false);
    if (result.ok) setItems(result.data);
    else if (manual) toast.error("Nicht aktualisiert", { description: result.error });
  }, []);
  const formsUnread = status?.formsUnread;
  const lastUnread = useRef(formsUnread);
  useEffect(() => {
    if (formsUnread !== undefined && lastUnread.current !== undefined && formsUnread > lastUnread.current) void reload();
    lastUnread.current = formsUnread;
  }, [formsUnread, reload]);
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && void reload();
    const timer = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [reload]);

  const formOf = (key: string) => forms.find((f) => f.key === key);
  const open = items.find((s) => s.id === openId);
  const inForm = items.filter((s) => !formKey || s.form === formKey);
  const inbox = inForm.filter((s) => !s.archived && !s.spam);
  const archive = inForm.filter((s) => s.archived && !s.spam);
  const spam = inForm.filter((s) => s.spam);
  const unread = (key?: string | null) => items.filter((s) => !s.archived && !s.spam && !s.read && (!key || s.form === key)).length;

  function change(ids: string[], patch: { read?: boolean; archived?: boolean; spam?: boolean }, message?: string) {
    const before = items;
    setItems((list) => list.map((s) => (ids.includes(s.id) ? { ...s, ...patch, ...(patch.spam === false ? { spamReason: null } : {}) } : s)));
    startTransition(async () => {
      const result = await updateSubmissions(ids, patch);
      if (!result.ok) {
        setItems(before);
        toast.error("Das hat nicht geklappt", { description: result.error });
        return;
      }
      if (message) toast.success(message);
      void refreshStatus();
    });
  }

  function remove(ids: string[]) {
    const before = items;
    setItems((list) => list.filter((s) => !ids.includes(s.id)));
    setDialogOpen(false);
    startTransition(async () => {
      const result = await deleteSubmissions(ids);
      if (!result.ok) {
        setItems(before);
        toast.error("Löschen fehlgeschlagen", { description: result.error });
        return;
      }
      toast.success(ids.length === 1 ? "Nachricht gelöscht" : `${ids.length} Nachrichten gelöscht`);
      void refreshStatus();
    });
  }

  function openSubmission(id: string) {
    setOpenId(id);
    setDialogOpen(true);
    const s = items.find((x) => x.id === id);
    if (s && !s.read) change([id], { read: true });
  }


  if (forms.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Formulare" description="Nachrichten, die Besucher über die Formulare deiner Website schicken." />
        <Card>
          <EmptyState
            icon={Inbox}
            title="Keine Formulare eingerichtet"
            description="Formulare werden in der kern.config.yaml der Website unter „forms“ beschrieben. Danach erscheinen hier ihre Nachrichten."
          />
        </Card>
      </PageContainer>
    );
  }

  const exportForms = formKey ? forms.filter((f) => f.key === formKey) : forms;
  const navItems = [{ key: null, label: "Alle Formulare" }, ...forms.map((f) => ({ key: f.key as string | null, label: f.label }))];

  return (
    <PageContainer>
      <PageHeader
        title="Formulare"
        description="Nachrichten, die Besucher über die Formulare deiner Website schicken."
        actions={
          <>
          <Button variant="secondary" size="icon" className="flex-none!" onClick={() => void reload(true)} disabled={reloading} aria-label="Aktualisieren">
            <RefreshCw className={cn(reloading && "animate-spin")} />
          </Button>
          {exportForms.length === 1 ? (
            <a href={`/api/forms/export?form=${encodeURIComponent(exportForms[0].key)}`} className={buttonStyles({ variant: "secondary" })}>
              <Download />
              Als CSV exportieren
            </a>
          ) : (
            <Menu>
              <MenuTrigger className={buttonStyles({ variant: "secondary", className: "data-popup-open:bg-subtle" })}>
                <Download />
                Als CSV exportieren
                <ChevronDown className="size-4" />
              </MenuTrigger>
              <MenuContent>
                {exportForms.map((f) => (
                  <MenuItem key={f.key} render={<a href={`/api/forms/export?form=${encodeURIComponent(f.key)}`} />}>
                    {f.label}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="h-fit p-2">
          <nav aria-label="Formulare" className="flex flex-col gap-1">
            {navItems.map((form) => {
              const count = unread(form.key);
              const active = formKey === form.key;
              return (
                <button
                  key={form.key ?? "all"}
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setFormKey(form.key)}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-xl px-3 text-left transition-colors outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40",
                    active && "bg-subtle",
                  )}
                >
                  {form.key ? (
                    <Mail className={cn("size-5 shrink-0", active ? "text-accent" : "text-muted")} strokeWidth={1.75} />
                  ) : (
                    <Inbox className={cn("size-5 shrink-0", active ? "text-accent" : "text-muted")} strokeWidth={1.75} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{form.label}</span>
                  {form.key && settings[form.key]?.notify && (
                    <Tooltip label="Benachrichtigung per E-Mail ist an">
                      <Bell className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-label="Benachrichtigung an" />
                    </Tooltip>
                  )}
                  {count > 0 && (
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-2 text-xs font-semibold text-accent-foreground">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          {canConfigure && (
            <div className="mt-1 border-t border-border p-2 pt-3">
              <Link
                href={`/settings?tab=forms${formKey ? `#form-${formKey}` : ""}`}
                className={buttonStyles({ variant: "ghost", size: "sm", className: "w-full justify-start" })}
              >
                <Settings2 />
                E-Mail-Einstellungen
              </Link>
            </div>
          )}
        </Card>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "inbox" | "archive" | "spam")}>
          <TabsList>
            <Tab value="inbox">
              Posteingang
              {unread(formKey) > 0 && (
                <Badge tone="accent" className="h-6 px-2 text-xs">
                  {unread(formKey)}
                </Badge>
              )}
            </Tab>
            <Tab value="archive">Archiv</Tab>
            <Tab value="spam">
              Spam
              {spam.length > 0 && <span className="text-sm text-muted">{spam.length}</span>}
            </Tab>
          </TabsList>
          <TabPanel value="inbox" className="pt-5">
            <Card>
              {inbox.length ? (
                <SubmissionTable rows={inbox} showForm={!formKey} formOf={formOf} onOpen={openSubmission} />
              ) : items.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="Noch keine Nachrichten"
                  description="Sobald jemand das Formular auf deiner Website ausfüllt, erscheint die Nachricht hier."
                />
              ) : (
                <EmptyState icon={Inbox} title="Keine Nachrichten" description="Neue Einsendungen erscheinen hier automatisch." />
              )}
            </Card>
          </TabPanel>
          <TabPanel value="archive" className="pt-5">
            <Card>
              {archive.length ? (
                <SubmissionTable rows={archive} showForm={!formKey} formOf={formOf} onOpen={openSubmission} />
              ) : (
                <EmptyState icon={Archive} title="Archiv ist leer" description="Erledigte Nachrichten kannst du archivieren, damit der Posteingang übersichtlich bleibt." />
              )}
            </Card>
          </TabPanel>
          <TabPanel value="spam" className="pt-5">
            <Card>
              {spam.length ? (
                <>
                  <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
                    <p className="min-w-0 flex-1 text-sm text-muted">Hier landen verdächtige Nachrichten, ohne E-Mail-Benachrichtigung.</p>
                    <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={() => setConfirmSpamOpen(true)}>
                      <Trash2 />
                      Alle löschen
                    </Button>
                  </div>
                  <SubmissionTable rows={spam} showForm={!formKey} formOf={formOf} onOpen={openSubmission} />
                </>
              ) : (
                <EmptyState
                  icon={ShieldCheck}
                  title="Kein Spam"
                  description="Verdächtige Nachrichten landen hier statt im Posteingang, zum Beispiel solche mit vielen Links oder von Bots, die das Formular automatisch ausfüllen."
                />
              )}
            </Card>
          </TabPanel>
        </Tabs>
      </div>

      <Dialog open={dialogOpen && Boolean(open)} onOpenChange={setDialogOpen}>
        {open && (
          <SubmissionDialog
            onResent={(patch) => setItems((list) => list.map((s) => (s.id === open.id ? { ...s, ...patch } : s)))}
            submission={open}
            form={formOf(open.form)}
            notifyOn={Boolean(settings[open.form]?.notify && settings[open.form]?.recipients.length)}
            replyHref={(() => {
              const form = formOf(open.form);
              const formSettings = settings[open.form];
              return form && formSettings
                ? replyMailto({ form, data: open.data, siteName: kern.site.name, createdAt: open.createdAt }, formSettings)
                : null;
            })()}
            onDelete={() => setConfirmOpen(true)}
            onSpam={() => {
              change([open.id], { spam: !open.spam, read: true }, open.spam ? "In den Posteingang verschoben" : "Als Spam markiert");
              setDialogOpen(false);
            }}
            onArchive={() => {
              change([open.id], { archived: !open.archived }, open.archived ? "In den Posteingang verschoben" : "Archiviert");
              setDialogOpen(false);
            }}
            onUnread={() => {
              change([open.id], { read: false }, "Als ungelesen markiert");
              setDialogOpen(false);
            }}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Nachricht löschen?"
        description="Die Nachricht wird endgültig gelöscht. Das lässt sich nicht rückgängig machen."
        confirmLabel="Löschen"
        danger
        onConfirm={() => open && remove([open.id])}
      />
      <ConfirmDialog
        open={confirmSpamOpen}
        onOpenChange={setConfirmSpamOpen}
        title={`${spam.length === 1 ? "Eine Spam-Nachricht" : `${spam.length} Spam-Nachrichten`} löschen?`}
        description="Sie werden endgültig gelöscht. Das lässt sich nicht rückgängig machen."
        confirmLabel="Löschen"
        danger
        onConfirm={() => remove(spam.map((s) => s.id))}
      />
    </PageContainer>
  );
}

function SubmissionTable({
  rows,
  showForm,
  formOf,
  onOpen,
}: {
  rows: Submission[];
  showForm: boolean;
  formOf: (key: string) => FormDef | undefined;
  onOpen: (id: string) => void;
}) {
  // The table adapts to its own width (container query), not the window: wide shows every
  // column, medium drops "Formular", narrow becomes a two-line list.
  return (
    <div className="@container">
      <Table className="table-fixed">
        <thead>
          <tr>
            <Th className="w-10 pr-0" aria-label="Gelesen" />
            <Th className="@xl:w-48 @4xl:w-60">Absender</Th>
            <Th className="hidden @xl:table-cell">Betreff</Th>
            {showForm && <Th className="hidden w-44 @4xl:table-cell">Formular</Th>}
            <Th className="hidden w-36 @xl:table-cell @4xl:w-40">Eingegangen</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const form = formOf(row.form);
            const { sender, email, subject } = summarize(row, form);
            return (
              <tr key={row.id} onClick={() => onOpen(row.id)} className="cursor-pointer transition-colors hover:bg-subtle/50">
                <Td className="pr-0">
                  <span className={cn("block size-2.5 rounded-full", row.read ? "bg-transparent" : "bg-accent")} aria-label={row.read ? "Gelesen" : "Ungelesen"} />
                </Td>
                <Td className="py-2.5">
                  <button
                    type="button"
                    className={cn(
                      "flex w-full min-w-0 flex-col rounded-md text-left outline-none focus-visible:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                      !row.read && "font-semibold",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(row.id);
                    }}
                  >
                    <span className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate">{sender}</span>
                      {/* Narrow: the date sits next to the name. */}
                      <span suppressHydrationWarning className="shrink-0 text-sm font-normal whitespace-nowrap text-muted @xl:hidden">
                        {formatWhen(row.createdAt)}
                      </span>
                    </span>
                    {email && email !== sender && <span className="truncate text-sm font-normal text-muted">{email}</span>}
                    {/* Narrow: the subject goes under the sender. */}
                    <span className={cn("truncate text-sm @xl:hidden", row.read ? "font-normal text-muted" : "font-semibold")}>{subject}</span>
                  </button>
                </Td>
                <Td className={cn("hidden truncate @xl:table-cell", !row.read && "font-semibold")}>{subject}</Td>
                {showForm && <Td className="hidden truncate text-muted @4xl:table-cell">{form?.label ?? row.form}</Td>}
                <Td suppressHydrationWarning className="hidden whitespace-nowrap text-muted @xl:table-cell">
                  {formatWhen(row.createdAt)}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

function MailStatus({ submission, notifyOn, onResent }: { submission: Submission; notifyOn: boolean; onResent: (patch: Partial<Submission>) => void }) {
  const [pending, startTransition] = useTransition();
  const resend = () =>
    startTransition(async () => {
      const result = await resendSubmissionMail(submission.id);
      if (!result.ok) {
        toast.error("Nicht verschickt", { description: result.error });
        onResent({ mailStatus: "failed", mailError: result.error });
        return;
      }
      toast.success("Benachrichtigung verschickt");
      onResent({ mailStatus: "sent", mailError: null, mailedAt: new Date().toISOString() });
    });

  if (submission.mailStatus === "sent") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <CircleCheck className="size-4 text-success" strokeWidth={2} />
        Benachrichtigung per E-Mail verschickt
      </p>
    );
  }
  if (submission.mailStatus === "failed") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
        <CircleAlert className="size-4 shrink-0" strokeWidth={2} />
        <span className="min-w-0 flex-1">Benachrichtigung fehlgeschlagen{submission.mailError ? `: ${submission.mailError}` : ""}</span>
        <Button variant="secondary" size="sm" onClick={resend} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Erneut senden
        </Button>
      </div>
    );
  }
  // E.g. moved out of spam: no mail went out, but notifications are on now.
  if (notifyOn) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <BellOff className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">Keine Benachrichtigung verschickt</span>
        <Button variant="secondary" size="sm" onClick={resend} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Jetzt senden
        </Button>
      </div>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-muted">
      <BellOff className="size-4" strokeWidth={1.75} />
      Keine E-Mail-Benachrichtigung eingerichtet
    </p>
  );
}

function SubmissionDialog({
  submission,
  form,
  onDelete,
  onArchive,
  onUnread,
  onSpam,
  onResent,
  replyHref,
  notifyOn,
}: {
  submission: Submission;
  form: FormDef | undefined;
  replyHref: string | null;
  onDelete: () => void;
  onArchive: () => void;
  onUnread: () => void;
  onSpam: () => void;
  notifyOn: boolean;
  onResent: (patch: Partial<Submission>) => void;
}) {
  const { subject, email } = summarize(submission, form);
  const href = replyHref ?? (email ? `mailto:${email}?subject=${encodeURIComponent(`Re: ${subject}`)}` : null);
  const known = new Set(form?.fields.map((f) => f.name));
  const rows = [
    ...(form?.fields ?? []).map((f) => {
      const raw = submission.data[f.name] ?? "";
      return { key: f.name, label: cleanLabel(f.label), value: raw ? displayValue(form, f.name, raw) : "" };
    }),
    ...Object.entries(submission.data)
      .filter(([key]) => !known.has(key) && !key.startsWith("_"))
      .map(([key, value]) => ({ key, label: key, value })),
  ];
  return (
    <DialogContent
      title={subject}
      description={`${form?.label ?? submission.form} · ${formatWhen(submission.createdAt)}${submission.page ? ` · von ${submission.page}` : ""}`}
      size="lg"
      footer={
        <>
          <div className="mr-auto flex items-center gap-1">
            <Tooltip label="Löschen" side="top">
              <Button variant="ghost" size="icon" className="text-danger hover:bg-danger-soft" onClick={onDelete} aria-label="Löschen">
                <Trash2 />
              </Button>
            </Tooltip>
            <Tooltip label={submission.archived ? "Zurück in den Posteingang" : "Archivieren"} side="top">
              <Button variant="ghost" size="icon" onClick={onArchive} aria-label={submission.archived ? "Zurück in den Posteingang" : "Archivieren"}>
                {submission.archived ? <ArchiveRestore /> : <Archive />}
              </Button>
            </Tooltip>
            <Tooltip label={submission.spam ? "Kein Spam" : "Als Spam markieren"} side="top">
              <Button variant="ghost" size="icon" onClick={onSpam} aria-label={submission.spam ? "Kein Spam" : "Als Spam markieren"}>
                {submission.spam ? <ShieldCheck /> : <ShieldAlert />}
              </Button>
            </Tooltip>
            <Tooltip label="Als ungelesen markieren" side="top">
              <Button variant="ghost" size="icon" onClick={onUnread} aria-label="Als ungelesen markieren">
                <MailOpen />
              </Button>
            </Tooltip>
          </div>
          {href && (
            <a href={href} className={buttonStyles()}>
              <Reply />
              Per Mail antworten
            </a>
          )}
        </>
      }
    >
      <div className="mb-4">
        {submission.spam ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
            <ShieldAlert className="size-4 shrink-0" strokeWidth={2} />
            <span className="min-w-0 flex-1">Als Spam erkannt{submission.spamReason ? `: ${submission.spamReason}` : ""}</span>
            <Button variant="secondary" size="sm" onClick={onSpam}>
              Kein Spam
            </Button>
          </div>
        ) : (
          <MailStatus submission={submission} notifyOn={notifyOn} onResent={onResent} />
        )}
      </div>
      <dl className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {rows.map((field) => (
          <div key={field.key} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm font-medium text-muted">{field.label}</dt>
            <dd className={cn("text-[15px] leading-relaxed whitespace-pre-line", !field.value && "text-muted")}>{field.value || "–"}</dd>
          </div>
        ))}
      </dl>
    </DialogContent>
  );
}

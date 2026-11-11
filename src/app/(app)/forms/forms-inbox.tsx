"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, ChevronDown, Download, Inbox, Mail, MailOpen, Reply, Trash2 } from "lucide-react";
import { refreshStatus } from "@/components/history/use-status";
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
import { deleteSubmissions, updateSubmissions } from "@/server/actions/site";

type Submission = {
  id: string;
  form: string;
  data: Record<string, string>;
  page: string | null;
  read: boolean;
  archived: boolean;
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

export function FormsInbox({ forms, initial }: { forms: FormDef[]; initial: Submission[] }) {
  const kern = useKern();
  const [items, setItems] = useState(initial);
  const [formKey, setFormKey] = useState<string | null>(null);
  const [tab, setTab] = useState<"inbox" | "archive">("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [, startTransition] = useTransition();

  const formOf = (key: string) => forms.find((f) => f.key === key);
  const open = items.find((s) => s.id === openId);
  const inForm = items.filter((s) => !formKey || s.form === formKey);
  const inbox = inForm.filter((s) => !s.archived);
  const archive = inForm.filter((s) => s.archived);
  const unread = (key?: string | null) => items.filter((s) => !s.archived && !s.read && (!key || s.form === key)).length;

  function change(ids: string[], patch: { read?: boolean; archived?: boolean }, message?: string) {
    const before = items;
    setItems((list) => list.map((s) => (ids.includes(s.id) ? { ...s, ...patch } : s)));
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

  const endpoint = `/api/public/${kern.site.key}/forms/${formKey ?? forms[0]?.key ?? "<formular>"}`;

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
          exportForms.length === 1 ? (
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
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
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
                  {count > 0 && (
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-2 text-xs font-semibold text-accent-foreground">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </Card>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "inbox" | "archive")}>
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
          </TabsList>
          <TabPanel value="inbox" className="pt-5">
            <Card>
              {inbox.length ? (
                <SubmissionTable rows={inbox} showForm={!formKey} formOf={formOf} onOpen={openSubmission} />
              ) : items.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="Noch keine Nachrichten"
                  description={`Die Website schickt Formulare per POST an ${endpoint} (JSON oder FormData, Feld „_gotcha“ leer lassen). Neue Einsendungen erscheinen dann hier.`}
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
        </Tabs>
      </div>

      <Dialog open={dialogOpen && Boolean(open)} onOpenChange={setDialogOpen}>
        {open && (
          <SubmissionDialog
            submission={open}
            form={formOf(open.form)}
            onDelete={() => setConfirmOpen(true)}
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
  return (
    <Table>
      <thead>
        <tr>
          <Th className="w-0 pr-0" aria-label="Gelesen" />
          <Th>Absender</Th>
          <Th>Betreff</Th>
          {showForm && <Th className="hidden md:table-cell">Formular</Th>}
          <Th>Eingegangen</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const form = formOf(row.form);
          const { sender, email, subject } = summarize(row, form);
          return (
            <tr key={row.id} onClick={() => onOpen(row.id)} className="cursor-pointer transition-colors hover:bg-subtle/50">
              <Td className="w-0 pr-0">
                <span className={cn("block size-2.5 rounded-full", row.read ? "bg-transparent" : "bg-accent")} aria-label={row.read ? "Gelesen" : "Ungelesen"} />
              </Td>
              <Td>
                <button
                  type="button"
                  className={cn(
                    "flex flex-col rounded-md text-left outline-none focus-visible:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                    !row.read && "font-semibold",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(row.id);
                  }}
                >
                  <span>{sender}</span>
                  {email && email !== sender && <span className="text-sm font-normal text-muted">{email}</span>}
                </button>
              </Td>
              <Td className={cn("max-w-80 truncate", !row.read && "font-semibold")}>{subject}</Td>
              {showForm && <Td className="hidden text-muted md:table-cell">{form?.label ?? row.form}</Td>}
              <Td suppressHydrationWarning className="whitespace-nowrap text-muted">{formatWhen(row.createdAt)}</Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

function SubmissionDialog({
  submission,
  form,
  onDelete,
  onArchive,
  onUnread,
}: {
  submission: Submission;
  form: FormDef | undefined;
  onDelete: () => void;
  onArchive: () => void;
  onUnread: () => void;
}) {
  const { subject, email } = summarize(submission, form);
  const known = new Set(form?.fields.map((f) => f.name));
  const rows = [
    ...(form?.fields ?? []).map((f) => ({ key: f.name, label: f.label, value: submission.data[f.name] ?? "" })),
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
          <Button variant="ghost" className="mr-auto text-danger hover:bg-danger-soft" onClick={onDelete}>
            <Trash2 />
            Löschen
          </Button>
          <Button variant="secondary" onClick={onArchive}>
            {submission.archived ? <ArchiveRestore /> : <Archive />}
            {submission.archived ? "Zurück in den Posteingang" : "Archivieren"}
          </Button>
          <Button variant="secondary" onClick={onUnread}>
            <MailOpen />
            Ungelesen
          </Button>
          {email && (
            <a href={`mailto:${email}?subject=${encodeURIComponent(`Re: ${subject}`)}`} className={buttonStyles()}>
              <Reply />
              Antworten
            </a>
          )}
        </>
      }
    >
      <dl className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {rows.map((field) => (
          <div key={field.key} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
            <dt className="text-sm font-medium text-muted">{field.label}</dt>
            <dd className={cn("text-[15px] leading-relaxed whitespace-pre-line", !field.value && "text-muted")}>{field.value || "–"}</dd>
          </div>
        ))}
      </dl>
    </DialogContent>
  );
}

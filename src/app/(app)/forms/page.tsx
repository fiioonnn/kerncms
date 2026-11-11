"use client";

import { useState } from "react";
import { Download, Inbox, Mail, MailOpen, Reply, ShieldAlert, ShieldCheck, Trash2, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Form = { id: string; name: string; page: string; icon: LucideIcon };

const forms: Form[] = [
  { id: "contact", name: "Kontaktformular", page: "/kontakt", icon: Mail },
  { id: "catering", name: "Catering-Anfrage", page: "/catering", icon: UtensilsCrossed },
];

type Submission = {
  id: string;
  formId: string;
  name: string;
  email: string;
  subject: string;
  date: string;
  read: boolean;
  spam: boolean;
  fields: { label: string; value: string }[];
};

const initialSubmissions: Submission[] = [
  {
    id: "s1",
    formId: "catering",
    name: "Miriam Kraus",
    email: "m.kraus@kanzlei-kraus.de",
    subject: "Frühstück für 25 Personen",
    date: "Heute, 10:24",
    read: false,
    spam: false,
    fields: [
      { label: "Firma", value: "Kanzlei Kraus & Partner" },
      { label: "Datum der Veranstaltung", value: "4. Dezember 2026" },
      { label: "Personen", value: "25" },
      { label: "Nachricht", value: "Wir planen ein Team-Frühstück und hätten gerne belegte Brötchen, Croissants und Obst. Liefern Sie auch in die Innenstadt?" },
    ],
  },
  {
    id: "s2",
    formId: "contact",
    name: "Thomas Becker",
    email: "thomas.becker@web.de",
    subject: "Glutenfreie Brote?",
    date: "Heute, 08:51",
    read: false,
    spam: false,
    fields: [
      { label: "Telefon", value: "0171 2345678" },
      { label: "Nachricht", value: "Hallo, backen Sie auch glutenfreie Brote oder könnten Sie welche auf Bestellung machen? Viele Grüße" },
    ],
  },
  {
    id: "s3",
    formId: "contact",
    name: "Sabine Wolf",
    email: "sabine.wolf@gmx.de",
    subject: "Danke für die tolle Torte!",
    date: "Gestern, 17:12",
    read: true,
    spam: false,
    fields: [{ label: "Nachricht", value: "Die Hochzeitstorte war ein Traum. Alle Gäste waren begeistert – vielen Dank an das ganze Team!" }],
  },
  {
    id: "s4",
    formId: "catering",
    name: "Peter Neumann",
    email: "p.neumann@sportverein-nord.de",
    subject: "Vereinsfeier im Januar",
    date: "8. Nov., 14:03",
    read: true,
    spam: false,
    fields: [
      { label: "Firma", value: "SV Nord e. V." },
      { label: "Datum der Veranstaltung", value: "17. Januar 2027" },
      { label: "Personen", value: "60" },
      { label: "Nachricht", value: "Wir suchen ein Buffet mit herzhaften Snacks und Kuchen für unseren Neujahrsempfang." },
    ],
  },
  {
    id: "s5",
    formId: "contact",
    name: "Julia Richter",
    email: "julia.richter@posteo.de",
    subject: "Ausbildungsplatz 2027",
    date: "6. Nov., 09:30",
    read: true,
    spam: false,
    fields: [
      { label: "Telefon", value: "0152 9876543" },
      { label: "Nachricht", value: "Ich interessiere mich für eine Ausbildung zur Bäckereifachverkäuferin. An wen kann ich meine Bewerbung schicken?" },
    ],
  },
  {
    id: "s6",
    formId: "contact",
    name: "SEO Experts",
    email: "offer@seo-rank-fast.biz",
    subject: "Platz 1 bei Google garantiert!!!",
    date: "5. Nov., 03:12",
    read: false,
    spam: true,
    fields: [{ label: "Nachricht", value: "Wir bringen Ihre Website in 7 Tagen auf Platz 1. Jetzt Angebot sichern!" }],
  },
];

function SubmissionTable({
  rows,
  showForm,
  onOpen,
}: {
  rows: Submission[];
  showForm: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <Th className="w-0 pr-0" aria-label="Gelesen" />
          <Th>Absender</Th>
          <Th>Betreff</Th>
          {showForm && <Th>Formular</Th>}
          <Th>Datum</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            onClick={() => onOpen(row.id)}
            className="cursor-pointer transition-colors hover:bg-subtle/50"
          >
            <Td className="w-0 pr-0">
              <span
                className={cn("block size-2.5 rounded-full", row.read ? "bg-transparent" : "bg-accent")}
                aria-label={row.read ? "Gelesen" : "Ungelesen"}
              />
            </Td>
            <Td>
              <button
                type="button"
                className={cn("flex flex-col text-left outline-none focus-visible:text-accent", !row.read && "font-semibold")}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(row.id);
                }}
              >
                <span>{row.name}</span>
                <span className="text-sm font-normal text-muted">{row.email}</span>
              </button>
            </Td>
            <Td className={cn(!row.read && "font-semibold")}>{row.subject}</Td>
            {showForm && <Td className="text-muted">{forms.find((f) => f.id === row.formId)?.name}</Td>}
            <Td className="whitespace-nowrap text-muted">{row.date}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default function FormsPage() {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [formId, setFormId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const open = submissions.find((s) => s.id === openId);
  const inForm = submissions.filter((s) => !formId || s.formId === formId);
  const inbox = inForm.filter((s) => !s.spam);
  const spam = inForm.filter((s) => s.spam);
  const unread = (id?: string) => submissions.filter((s) => !s.spam && !s.read && (!id || s.formId === id)).length;

  function update(id: string, patch: Partial<Submission>) {
    setSubmissions((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function openSubmission(id: string) {
    setOpenId(id);
    setDialogOpen(true);
    update(id, { read: true });
  }

  const formButtons = [{ id: null, name: "Alle Formulare", page: "", icon: Inbox }, ...forms];

  return (
    <PageContainer>
      <PageHeader
        title="Formulare"
        description="Nachrichten, die Besucher über die Formulare deiner Website schicken."
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              toast.success("Export erstellt", {
                description: `${inForm.length} Einträge als CSV-Datei heruntergeladen.`,
              })
            }
          >
            <Download />
            Als CSV exportieren
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit p-2">
          <nav aria-label="Formulare" className="flex flex-col gap-1">
            {formButtons.map((form) => {
              const count = unread(form.id ?? undefined);
              const active = formId === form.id;
              return (
                <button
                  key={form.id ?? "all"}
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setFormId(form.id)}
                  className={cn(
                    "flex h-14 items-center gap-3 rounded-xl px-3 text-left transition-colors outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40",
                    active && "bg-subtle",
                  )}
                >
                  <form.icon className={cn("size-5 shrink-0", active ? "text-accent" : "text-muted")} strokeWidth={1.75} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-medium">{form.name}</span>
                    {form.page && <span className="font-mono text-xs text-muted">{form.page}</span>}
                  </span>
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

        <Tabs defaultValue="inbox">
          <TabsList>
            <Tab value="inbox">
              Posteingang
              {unread(formId ?? undefined) > 0 && <Badge tone="accent" className="h-6 px-2 text-xs">{unread(formId ?? undefined)}</Badge>}
            </Tab>
            <Tab value="spam">Spam</Tab>
          </TabsList>
          <TabPanel value="inbox" className="pt-5">
            <Card>
              {inbox.length ? (
                <SubmissionTable rows={inbox} showForm={!formId} onOpen={openSubmission} />
              ) : (
                <EmptyState icon={Inbox} title="Keine Nachrichten" description="Neue Einsendungen erscheinen hier automatisch." />
              )}
            </Card>
          </TabPanel>
          <TabPanel value="spam" className="pt-5">
            <Card>
              {spam.length ? (
                <SubmissionTable rows={spam} showForm={!formId} onOpen={openSubmission} />
              ) : (
                <EmptyState
                  icon={ShieldCheck}
                  title="Kein Spam"
                  description="Verdächtige Nachrichten werden automatisch aussortiert und landen hier."
                />
              )}
            </Card>
          </TabPanel>
        </Tabs>
      </div>

      <Dialog open={dialogOpen && Boolean(open)} onOpenChange={setDialogOpen}>
        {open && (
          <DialogContent
            title={open.subject}
            description={`${forms.find((f) => f.id === open.formId)?.name} · ${open.date}`}
            size="lg"
            footer={
              <>
                <Button
                  variant="ghost"
                  className="mr-auto text-danger hover:bg-danger-soft"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 />
                  Löschen
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    update(open.id, { spam: !open.spam });
                    setDialogOpen(false);
                    toast.success(open.spam ? "In den Posteingang verschoben" : "Als Spam markiert");
                  }}
                >
                  {open.spam ? <ShieldCheck /> : <ShieldAlert />}
                  {open.spam ? "Kein Spam" : "Spam"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    update(open.id, { read: false });
                    setDialogOpen(false);
                    toast.info("Als ungelesen markiert");
                  }}
                >
                  <MailOpen />
                  Ungelesen
                </Button>
                <a
                  href={`mailto:${open.email}?subject=${encodeURIComponent(`Re: ${open.subject}`)}`}
                  className={buttonStyles()}
                >
                  <Reply />
                  Antworten
                </a>
              </>
            }
          >
            <dl className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {[{ label: "Name", value: open.name }, { label: "E-Mail", value: open.email }, ...open.fields].map((field) => (
                <div key={field.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
                  <dt className="text-sm font-medium text-muted">{field.label}</dt>
                  <dd className="text-[15px] leading-relaxed whitespace-pre-line">{field.value}</dd>
                </div>
              ))}
            </dl>
          </DialogContent>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Nachricht löschen?"
        description="Die Nachricht wird in den Papierkorb verschoben und nach 30 Tagen endgültig gelöscht."
        confirmLabel="Löschen"
        danger
        onConfirm={() => {
          if (!open) return;
          setSubmissions((list) => list.filter((s) => s.id !== open.id));
          setDialogOpen(false);
          toast.success("Nachricht gelöscht");
        }}
      />
    </PageContainer>
  );
}

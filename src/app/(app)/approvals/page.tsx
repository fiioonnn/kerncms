"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, CircleCheck, CircleX, ExternalLink, Inbox, MessageSquare, X } from "lucide-react";
import { Diff, type Change } from "@/components/history/version-history";
import { PageContainer } from "@/components/layout/page-container";
import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Avatar, Badge, Card, PageHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Description, Field, Label, Textarea } from "@/components/ui/field";
import { Tab, Tabs, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { startDeploy } from "@/lib/deploy-store";
import { cn } from "@/lib/utils";

type Status = "open" | "approved" | "rejected";
type Comment = { author: string; when: string; text: string; system?: boolean };
type Request = {
  id: string;
  title: string;
  author: string;
  when: string;
  page: string;
  status: Status;
  changes: Change[];
  comments: Comment[];
};

const initialRequests: Request[] = [
  {
    id: "r-108",
    title: "Öffnungszeiten über Weihnachten",
    author: "Jonas Weber",
    when: "Heute, 10:15",
    page: "Öffnungszeiten",
    status: "open",
    changes: [
      { field: "Feiertage", before: "7:00 bis 12:00 Uhr", after: "24.–26. Dezember geschlossen, 31. Dezember 7:00 bis 11:00 Uhr" },
      { field: "Hinweis", after: "Vorbestellungen für Weihnachtsstollen bis 20. Dezember möglich." },
    ],
    comments: [{ author: "Jonas Weber", when: "Heute, 10:15", text: "Bitte vor Freitag live stellen, die Aushänge im Laden sind schon gedruckt." }],
  },
  {
    id: "r-107",
    title: "Neuer Beitrag „Stollenzeit 2026“",
    author: "Lena Hoffmann",
    when: "Heute, 08:31",
    page: "Beiträge",
    status: "open",
    changes: [
      { field: "Titel", after: "Stollenzeit 2026" },
      { field: "Teaser", after: "Unser Butterstollen reift vier Wochen, ab sofort vorbestellbar." },
      { field: "Titelbild", after: "stollen-2026.jpg" },
      { field: "Tags", after: "Saison, Weihnachten" },
    ],
    comments: [],
  },
  {
    id: "r-106",
    title: "Sortiment: Dinkelbrötchen ergänzt",
    author: "Jonas Weber",
    when: "Gestern, 15:48",
    page: "Sortiment",
    status: "open",
    changes: [
      { field: "Name", after: "Dinkel-Kürbiskern-Brötchen" },
      { field: "Preis", after: "0,95 €" },
      { field: "Kategorie", after: "Brötchen" },
    ],
    comments: [
      { author: "Jonas Weber", when: "Gestern, 15:48", text: "Foto kommt nächste Woche, bis dahin ohne Bild." },
      { author: "Anna Schmidt", when: "Gestern, 16:02", text: "Passt, dann bitte ohne Bild freigeben." },
    ],
  },
  {
    id: "r-104",
    title: "Hero-Text der Startseite",
    author: "Lena Hoffmann",
    when: "8. Nov., 08:50",
    page: "Startseite",
    status: "approved",
    changes: [
      { field: "Hero · Text", before: "Seit 1962 backen wir.", after: "Seit 1962 backen wir mit Zeit, Handwerk und regionalem Mehl." },
      { field: "Hero · Button-Link", before: "/produkte", after: "/sortiment" },
    ],
    comments: [{ author: "Anna Schmidt", when: "8. Nov., 09:14", text: "Freigegeben und veröffentlicht.", system: true }],
  },
  {
    id: "r-102",
    title: "Kontaktseite: neue Telefonnummer",
    author: "Jonas Weber",
    when: "4. Nov., 13:12",
    page: "Kontakt",
    status: "rejected",
    changes: [{ field: "Telefon", before: "0711 123456", after: "0711 654321" }],
    comments: [
      {
        author: "Anna Schmidt",
        when: "4. Nov., 14:40",
        text: "Die neue Nummer ist erst ab Januar geschaltet. Bitte dann nochmal einreichen.",
        system: true,
      },
    ],
  },
];

const tabs: { value: Status; label: string }[] = [
  { value: "open", label: "Offen" },
  { value: "approved", label: "Freigegeben" },
  { value: "rejected", label: "Abgelehnt" },
];

function StatusBadge({ status }: { status: Status }) {
  if (status === "open")
    return (
      <Badge tone="warning" dot>
        Offen
      </Badge>
    );
  return status === "approved" ? (
    <Badge tone="success">
      <CircleCheck className="size-3.5" />
      Freigegeben
    </Badge>
  ) : (
    <Badge tone="danger">
      <CircleX className="size-3.5" />
      Abgelehnt
    </Badge>
  );
}

const me = "Anna Schmidt";

export default function ApprovalsPage() {
  const [requests, setRequests] = useState(initialRequests);
  const [tab, setTab] = useState<Status>("open");
  const [selectedId, setSelectedId] = useState<string>();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [comment, setComment] = useState("");

  const list = requests.filter((r) => r.status === tab);
  const selected = list.find((r) => r.id === selectedId) ?? list[0];

  function update(id: string, patch: (r: Request) => Request) {
    setRequests((all) => all.map((r) => (r.id === id ? patch(r) : r)));
  }

  function approve(r: Request) {
    update(r.id, (x) => ({
      ...x,
      status: "approved",
      comments: [...x.comments, { author: me, when: "Gerade eben", text: "Freigegeben und veröffentlicht.", system: true }],
    }));
    startDeploy(r.changes.length);
    toast.success("Freigegeben", { description: `„${r.title}“ wird jetzt veröffentlicht.` });
    setSelectedId(undefined);
  }

  function reject(r: Request) {
    update(r.id, (x) => ({
      ...x,
      status: "rejected",
      comments: [...x.comments, { author: me, when: "Gerade eben", text: rejectReason.trim(), system: true }],
    }));
    toast.info("Abgelehnt", { description: `${r.author} wird benachrichtigt.` });
    setRejectReason("");
    setSelectedId(undefined);
  }

  function addComment(r: Request) {
    if (!comment.trim()) return;
    update(r.id, (x) => ({ ...x, comments: [...x.comments, { author: me, when: "Gerade eben", text: comment.trim() }] }));
    setComment("");
  }

  return (
    <PageContainer>
      <PageHeader
        title="Freigaben"
        description="Änderungen von Redakteuren prüfen, bevor sie veröffentlicht werden."
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Status);
          setSelectedId(undefined);
        }}
      >
        <TabsList className="mb-5">
          {tabs.map((t) => {
            const count = requests.filter((r) => r.status === t.value).length;
            return (
              <Tab key={t.value} value={t.value}>
                {t.label}
                <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted">{count}</span>
              </Tab>
            );
          })}
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden">
        {!selected ? (
          <EmptyState
            icon={Inbox}
            className="py-20"
            title={tab === "open" ? "Alles geprüft" : "Keine Änderungen"}
            description={
              tab === "open"
                ? "Neue Einreichungen von Redakteuren erscheinen hier."
                : tab === "approved"
                  ? "Freigegebene Änderungen erscheinen hier."
                  : "Abgelehnte Änderungen erscheinen hier."
            }
          />
        ) : (
          <div className="grid min-h-[560px] md:grid-cols-[340px_1fr]">
            <ol className="flex flex-col gap-1 overflow-y-auto border-border p-2 md:border-r">
              {list.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={cn(
                      "flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                      r.id === selected.id ? "bg-accent-soft" : "hover:bg-subtle",
                    )}
                  >
                    <Avatar name={r.author} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn("truncate text-[15px] font-medium", r.id === selected.id && "text-accent")}>
                        {r.title}
                      </span>
                      <span className="truncate text-sm text-muted">
                        {r.page} · {r.changes.length} {r.changes.length === 1 ? "Änderung" : "Änderungen"}
                      </span>
                      <span className="truncate text-sm text-muted">
                        {r.author} · {r.when}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="flex min-w-0 flex-col gap-6 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-tight">{selected.title}</h2>
                    <StatusBadge status={selected.status} />
                  </div>
                  <span className="text-sm text-muted">
                    {selected.author} · {selected.when} · {selected.page}
                  </span>
                </div>
                <Link href="/editor" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  <ExternalLink />
                  Vorschau
                </Link>
              </div>

              <div className="flex flex-col gap-3">
                {selected.changes.map((change) => (
                  <Diff key={change.field} change={change} />
                ))}
              </div>

              {selected.status === "open" && (
                <div className="flex flex-wrap justify-end gap-3">
                  <Button variant="secondary" onClick={() => setRejectOpen(true)}>
                    <X />
                    Ablehnen
                  </Button>
                  <Button onClick={() => approve(selected)}>
                    <Check />
                    Freigeben und veröffentlichen
                  </Button>
                </div>
              )}

              <section className="flex flex-col gap-4 border-t border-border pt-6">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <MessageSquare className="size-5 text-muted" strokeWidth={1.75} />
                  Kommentare
                </h3>
                {selected.comments.length === 0 && <p className="text-[15px] text-muted">Noch keine Kommentare.</p>}
                <ol className="flex flex-col gap-4">
                  {selected.comments.map((c, i) => (
                    <li key={i} className="flex gap-3">
                      <Avatar name={c.author} size="sm" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-sm">
                          <span className="font-medium">{c.author}</span>
                          <span className="text-muted"> · {c.when}</span>
                        </span>
                        <p
                          className={cn(
                            "rounded-xl px-4 py-2.5 text-[15px] leading-relaxed",
                            c.system && selected.status === "rejected"
                              ? "bg-danger-soft text-foreground"
                              : c.system
                                ? "bg-success-soft text-foreground"
                                : "bg-subtle",
                          )}
                        >
                          {c.text}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="flex gap-3">
                  <Avatar name={me} size="sm" />
                  <div className="flex flex-1 flex-col gap-3">
                    <Textarea
                      rows={2}
                      aria-label="Kommentar schreiben"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="self-end"
                      disabled={!comment.trim()}
                      onClick={() => addComment(selected)}
                    >
                      Kommentieren
                    </Button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </Card>

      {selected && (
        <Dialog
          open={rejectOpen}
          onOpenChange={(open) => {
            setRejectOpen(open);
            if (!open) setRejectReason("");
          }}
        >
          <DialogContent
            title="Änderung ablehnen"
            description={`${selected.author} sieht deinen Kommentar und kann die Änderung überarbeiten.`}
            size="sm"
            footer={
              <>
                <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
                <DialogClose
                  className={buttonStyles({ variant: "danger" })}
                  disabled={!rejectReason.trim()}
                  onClick={() => reject(selected)}
                >
                  Ablehnen
                </DialogClose>
              </>
            }
          >
            <Field>
              <Label>Begründung</Label>
              <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} autoFocus required />
              <Description>Pflichtfeld. Was soll geändert werden?</Description>
            </Field>
          </DialogContent>
        </Dialog>
      )}
    </PageContainer>
  );
}

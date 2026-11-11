"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, CircleCheck, CircleX, ExternalLink, Inbox, Send, X } from "lucide-react";
import { RemoteFileDiff, useFileLabel } from "@/components/history/version-history";
import { useCan, useKern } from "@/components/kern/kern-provider";
import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Avatar, Badge, Card, PageHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { Tab, Tabs, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { requestApproval, reviewApproval } from "@/server/actions/site";

type Status = "open" | "approved" | "rejected";

export type ApprovalRow = {
  id: string;
  title: string;
  note: string;
  files: string[];
  commit: string;
  status: Status;
  comment: string | null;
  requestedBy: string | null;
  reviewedBy: string | null;
  created: string;
  reviewed: string | null;
};

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

export function ApprovalsView({ requests, pendingFiles }: { requests: ApprovalRow[]; pendingFiles: string[] }) {
  const { role } = useKern();
  const canReview = useCan("admin");
  const router = useRouter();
  const label = useFileLabel();
  const [tab, setTab] = useState<Status>("open");
  const [selectedId, setSelectedId] = useState<string>();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [pending, startTransition] = useTransition();

  const list = requests.filter((r) => r.status === tab);
  const selected = list.find((r) => r.id === selectedId) ?? list[0];

  function review(r: ApprovalRow, decision: "approved" | "rejected", comment?: string) {
    startTransition(async () => {
      const result = await reviewApproval(r.id, decision, comment);
      if (!result.ok) return void toast.error("Das hat nicht geklappt", { description: result.error });
      if (decision === "approved") toast.success("Freigegeben", { description: `„${r.title}“ wird jetzt veröffentlicht.` });
      else toast.info("Abgelehnt", { description: `${r.requestedBy ?? "Die Person"} wird benachrichtigt.` });
      setRejectReason("");
      setSelectedId(undefined);
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Freigaben"
        description="Änderungen von Redakteuren prüfen, bevor sie veröffentlicht werden."
        actions={role === "editor" && pendingFiles.length > 0 && <RequestApprovalDialog files={pendingFiles} />}
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Status);
          setSelectedId(undefined);
        }}
      >
        <TabsList className="mb-5">
          {tabs.map((t) => (
            <Tab key={t.value} value={t.value}>
              {t.label}
              <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted">
                {requests.filter((r) => r.status === t.value).length}
              </span>
            </Tab>
          ))}
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden">
        {!selected ? (
          <EmptyState
            icon={Inbox}
            className="py-20"
            title={tab === "open" ? "Alles geprüft" : "Keine Anfragen"}
            description={
              tab === "open"
                ? "Neue Einreichungen von Redakteuren erscheinen hier."
                : tab === "approved"
                  ? "Freigegebene Anfragen erscheinen hier."
                  : "Abgelehnte Anfragen erscheinen hier."
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
                    <Avatar name={r.requestedBy ?? "?"} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn("truncate text-[15px] font-medium", r.id === selected.id && "text-accent")}>{r.title}</span>
                      <span className="truncate text-sm text-muted">
                        {r.files.length} {r.files.length === 1 ? "Datei" : "Dateien"}
                      </span>
                      <span className="truncate text-sm text-muted">
                        {r.requestedBy ?? "Unbekannt"} · {r.created}
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
                    {selected.requestedBy ?? "Unbekannt"} · {selected.created} · Version{" "}
                    <code className="font-mono">{selected.commit.slice(0, 7)}</code>
                  </span>
                </div>
                {selected.status === "open" && (
                  <Link href="/editor" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    <ExternalLink />
                    Vorschau
                  </Link>
                )}
              </div>

              {selected.note && <p className="rounded-xl bg-subtle px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap">{selected.note}</p>}

              <div className="flex flex-col gap-3">
                <h3 className="text-base font-semibold">Geänderte Dateien</h3>
                {selected.files.map((file) => (
                  <div key={file} className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">{label(file)}</span>
                    <RemoteFileDiff file={file} query={{ compare: "live", head: selected.commit }} />
                  </div>
                ))}
              </div>

              {selected.status !== "open" && (
                <div
                  className={cn(
                    "flex gap-3 rounded-xl px-4 py-3",
                    selected.status === "rejected" ? "bg-danger-soft" : "bg-success-soft",
                  )}
                >
                  <Avatar name={selected.reviewedBy ?? "?"} size="sm" />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm">
                      <span className="font-medium">{selected.reviewedBy ?? "Unbekannt"}</span>
                      <span className="text-muted">
                        {" "}
                        · {selected.status === "approved" ? "freigegeben" : "abgelehnt"}
                        {selected.reviewed && ` · ${selected.reviewed}`}
                      </span>
                    </span>
                    {selected.comment && <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{selected.comment}</p>}
                  </span>
                </div>
              )}

              {selected.status === "open" && canReview && (
                <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-6">
                  <Button variant="secondary" onClick={() => setRejectOpen(true)} disabled={pending}>
                    <X />
                    Ablehnen
                  </Button>
                  <Button onClick={() => review(selected, "approved")} disabled={pending}>
                    <Check />
                    Freigeben und veröffentlichen
                  </Button>
                </div>
              )}
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
            description={`${selected.requestedBy ?? "Die Person"} sieht deinen Kommentar und kann die Änderung überarbeiten.`}
            size="sm"
            footer={
              <>
                <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
                <DialogClose
                  className={buttonStyles({ variant: "danger" })}
                  disabled={!rejectReason.trim() || pending}
                  onClick={() => review(selected, "rejected", rejectReason)}
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
    </>
  );
}

function RequestApprovalDialog({ files }: { files: string[] }) {
  const router = useRouter();
  const label = useFileLabel();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await requestApproval({ title, note });
      if (!result.ok) return void toast.error("Senden fehlgeschlagen", { description: result.error });
      toast.success("Zur Freigabe gesendet", { description: "Ein Admin prüft deine Änderungen." });
      setOpen(false);
      setTitle("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Send />
        Zur Freigabe senden
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Zur Freigabe senden"
          description="Ungespeicherte Änderungen werden dabei gespeichert. Ein Admin prüft sie und veröffentlicht sie."
          footer={
            <>
              <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
              <Button type="submit" form="request-approval-form" disabled={pending || !title.trim()}>
                {pending ? "Wird gesendet…" : "Senden"}
              </Button>
            </>
          }
        >
          <form id="request-approval-form" onSubmit={submit} className="flex flex-col gap-6">
            <Field>
              <Label>Titel</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
              <Description>Kurz, worum es geht, zum Beispiel „Öffnungszeiten über Weihnachten“.</Description>
            </Field>
            <Field>
              <Label>Nachricht</Label>
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              <Description>Optional. Hinweise für die Person, die prüft.</Description>
            </Field>
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-medium">
                {files.length} {files.length === 1 ? "geänderte Datei" : "geänderte Dateien"}
              </span>
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-2">
                {files.map((file) => (
                  <li key={file} className="truncate rounded-lg px-2 py-1 text-sm" title={file}>
                    {label(file)}
                  </li>
                ))}
              </ul>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

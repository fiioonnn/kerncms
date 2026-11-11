"use client";

import { useState } from "react";
import { Camera, LogOut, Monitor, Smartphone, Trash2, UploadCloud } from "lucide-react";
import { SaveButton } from "@/components/actions/common";
import { PageContainer } from "@/components/layout/page-container";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, Badge, Card, CardContent, CardHeader, PageHeader } from "@/components/ui/display";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/toggles";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const languages = [
  { label: "Deutsch", value: "de" },
  { label: "Englisch", value: "en" },
];

const notifications = [
  { label: "Freigabe angefragt", description: "Ein Redakteur reicht Änderungen zur Freigabe ein.", on: true },
  { label: "Änderung freigegeben oder abgelehnt", description: "Deine eingereichten Änderungen wurden geprüft.", on: true },
  { label: "Veröffentlichung abgeschlossen", description: "Die Website ist mit neuen Inhalten live.", on: false },
  { label: "Build fehlgeschlagen", description: "Beim Bauen der Website ist ein Fehler aufgetreten.", on: true },
  { label: "Kommentare", description: "Jemand antwortet auf deinen Kommentar.", on: true },
  { label: "Wöchentlicher Bericht", description: "Besucher und Änderungen der letzten sieben Tage, jeden Montag.", on: false },
];

type Session = { id: string; device: string; browser: string; location: string; lastActive: string; mobile?: boolean; current?: boolean };

const initialSessions: Session[] = [
  { id: "s1", device: "MacBook Pro", browser: "Chrome 142", location: "Stuttgart, Deutschland", lastActive: "Jetzt aktiv", current: true },
  { id: "s2", device: "iPhone 16", browser: "Safari", location: "Stuttgart, Deutschland", lastActive: "Heute, 07:12", mobile: true },
  { id: "s3", device: "Windows-PC", browser: "Edge 141", location: "Esslingen, Deutschland", lastActive: "6. Nov., 14:30" },
  { id: "s4", device: "iPad", browser: "Safari", location: "München, Deutschland", lastActive: "29. Okt., 19:05", mobile: true },
];

export default function ProfilePage() {
  const [name, setName] = useState("Anna Schmidt");
  const [email, setEmail] = useState("anna@baeckerei-mueller.de");
  const [avatar, setAvatar] = useState<string>();
  const [sessions, setSessions] = useState(initialSessions);

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Profil" description="Deine persönlichen Angaben, Benachrichtigungen und Anmeldungen." />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Persönliche Angaben" description="So sehen dich andere im Team." />
          <CardContent className="flex flex-col gap-6">
            <div className="flex items-center gap-5">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                <img src={avatar} alt="" className="size-20 shrink-0 rounded-full object-cover" />
              ) : (
                <Avatar name={name || "?"} className="size-20 text-2xl" />
              )}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <AvatarDialog onSave={setAvatar} />
                  {avatar && (
                    <Button variant="ghost" size="sm" onClick={() => setAvatar(undefined)}>
                      Entfernen
                    </Button>
                  )}
                </div>
                <span className="text-sm text-muted">JPG oder PNG, mindestens 256 × 256 Pixel.</span>
              </div>
            </div>
            <Field>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field>
              <Label>E-Mail</Label>
              <div className="flex gap-3">
                <Input value={email} readOnly className="bg-subtle/50" />
                <EmailDialog current={email} onChange={setEmail} />
              </div>
              <Description>Hierhin schicken wir Anmeldelinks und Benachrichtigungen.</Description>
            </Field>
            <Select label="Sprache der Oberfläche" items={languages} defaultValue="de" />
            <div className="flex justify-end border-t border-border pt-6">
              <SaveButton message="Profil gespeichert" description="Die Änderungen gelten sofort." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Benachrichtigungen" description="Per E-Mail, für alle Websites, auf die du Zugriff hast." />
          <CardContent className="flex flex-col gap-7">
            {notifications.map((n) => (
              <Switch key={n.label} label={n.label} description={n.description} defaultChecked={n.on} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Aktive Sitzungen"
            description="Geräte, auf denen du gerade angemeldet bist."
            action={
              sessions.length > 1 && (
                <ConfirmDialog
                  trigger={
                    <>
                      <LogOut />
                      Alle anderen abmelden
                    </>
                  }
                  triggerClassName={buttonStyles({ variant: "secondary", size: "sm" })}
                  title="Alle anderen Sitzungen abmelden?"
                  description="Du bleibst nur auf diesem Gerät angemeldet. Auf allen anderen ist eine neue Anmeldung nötig."
                  confirmLabel="Abmelden"
                  danger
                  onConfirm={() => {
                    setSessions((list) => list.filter((s) => s.current));
                    toast.success("Andere Sitzungen abgemeldet");
                  }}
                />
              )
            }
          />
          <CardContent className="pt-3">
            <ul className="flex flex-col divide-y divide-border">
              {sessions.map((s) => {
                const Icon = s.mobile ? Smartphone : Monitor;
                return (
                  <li key={s.id} className="flex items-center gap-4 py-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2 text-[15px] font-medium">
                        {s.device} · {s.browser}
                        {s.current && <Badge tone="success">Dieses Gerät</Badge>}
                      </span>
                      <span className="truncate text-sm text-muted">
                        {s.location} · {s.lastActive}
                      </span>
                    </span>
                    {!s.current && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSessions((list) => list.filter((x) => x.id !== s.id));
                          toast.success("Sitzung abgemeldet", { description: `${s.device} · ${s.browser}` });
                        }}
                      >
                        Abmelden
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-danger/30">
          <CardHeader title="Konto löschen" description="Dein Zugang zu allen Websites wird entfernt. Inhalte und Verlauf bleiben erhalten." />
          <CardContent className="flex justify-end">
            <DeleteAccountDialog email={email} />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function AvatarDialog({ onSave }: { onSave: (url: string) => void }) {
  const [preview, setPreview] = useState<string>();
  const [dragging, setDragging] = useState(false);

  function pick(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    setPreview(URL.createObjectURL(file));
  }

  return (
    <Dialog onOpenChange={(open) => !open && setPreview(undefined)}>
      <DialogTrigger className={buttonStyles({ variant: "secondary", size: "sm" })}>
        <Camera />
        Bild ändern
      </DialogTrigger>
      <DialogContent
        title="Profilbild ändern"
        size="sm"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <DialogClose
              className={buttonStyles()}
              disabled={!preview}
              onClick={() => {
                if (!preview) return;
                onSave(preview);
                toast.success("Profilbild aktualisiert");
              }}
            >
              Übernehmen
            </DialogClose>
          </>
        }
      >
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-accent bg-accent-soft text-accent" : "border-border-strong text-muted hover:border-accent hover:text-accent",
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt="" className="size-32 rounded-full object-cover" />
          ) : (
            <UploadCloud className="size-10" strokeWidth={1.5} />
          )}
          <span className="text-base font-medium text-foreground">{preview ? "Anderes Bild wählen" : "Bild hierher ziehen"}</span>
          {!preview && <span className="text-[15px]">oder klicken, um es auszuwählen</span>}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      </DialogContent>
    </Dialog>
  );
}

function EmailDialog({ current, onChange }: { current: string; onChange: (email: string) => void }) {
  const [value, setValue] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value !== current;

  return (
    <Dialog onOpenChange={(open) => !open && setValue("")}>
      <DialogTrigger className={buttonStyles({ variant: "secondary" })}>E-Mail ändern</DialogTrigger>
      <DialogContent
        title="E-Mail ändern"
        description="Wir schicken einen Bestätigungslink an die neue Adresse. Bis du ihn öffnest, bleibt die alte aktiv."
        size="sm"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <DialogClose
              className={buttonStyles()}
              disabled={!valid}
              onClick={() => {
                onChange(value);
                toast.success("Bestätigungslink verschickt", { description: value });
              }}
            >
              Bestätigungslink senden
            </DialogClose>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <Field>
            <Label>Aktuelle E-Mail</Label>
            <Input value={current} readOnly disabled />
          </Field>
          <Field>
            <Label>Neue E-Mail</Label>
            <Input type="email" autoComplete="email" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountDialog({ email }: { email: string }) {
  const [value, setValue] = useState("");

  return (
    <Dialog onOpenChange={(open) => !open && setValue("")}>
      <DialogTrigger className={buttonStyles({ variant: "danger" })}>
        <Trash2 />
        Konto löschen
      </DialogTrigger>
      <DialogContent
        title="Konto endgültig löschen?"
        description="Das lässt sich nicht rückgängig machen. Deine Änderungen bleiben im Verlauf der Websites sichtbar."
        size="sm"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <DialogClose
              className={buttonStyles({ variant: "danger" })}
              disabled={value.trim() !== email}
              onClick={() => toast.success("Konto gelöscht", { description: "Du wirst jetzt abgemeldet." })}
            >
              Konto löschen
            </DialogClose>
          </>
        }
      >
        <Field>
          <Label>Zur Bestätigung deine E-Mail eingeben</Label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
          <Description>
            <span className="font-mono">{email}</span>
          </Description>
        </Field>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Plus, UserPlus } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

const templates = [
  { label: "Leere Seite", value: "blank" },
  { label: "Inhaltsseite mit Hero", value: "content" },
  { label: "Kontaktseite", value: "contact" },
];

const roles = [
  { label: "Redakteur", value: "editor" },
  { label: "Admin", value: "admin" },
  { label: "Nur lesen", value: "viewer" },
];

export function NewPageDialog() {
  return (
    <Dialog>
      <DialogTrigger className={buttonStyles()}>
        <Plus />
        Neue Seite
      </DialogTrigger>
      <DialogContent
        title="Neue Seite"
        description="Die Seite wird als Entwurf angelegt und erst mit dem nächsten Veröffentlichen sichtbar."
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <DialogClose
              className={buttonStyles()}
              onClick={() => toast.success("Seite angelegt", { description: "Sie liegt jetzt im Entwurf." })}
            >
              Seite anlegen
            </DialogClose>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <Field>
            <Label>Titel</Label>
            <Input autoFocus />
          </Field>
          <Field>
            <Label>Pfad</Label>
            <Input className="font-mono" />
            <Description>Wird aus dem Titel vorgeschlagen, wenn du ihn leer lässt.</Description>
          </Field>
          <Select label="Vorlage" items={templates} defaultValue="content" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InviteDialog() {
  return (
    <Dialog>
      <DialogTrigger className={buttonStyles()}>
        <UserPlus />
        Einladen
      </DialogTrigger>
      <DialogContent
        title="Person einladen"
        description="Wir schicken eine E-Mail mit einem Anmeldelink."
        size="sm"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <DialogClose className={buttonStyles()} onClick={() => toast.success("Einladung verschickt")}>
              Einladen
            </DialogClose>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <Field>
            <Label>E-Mail</Label>
            <Input type="email" autoFocus />
          </Field>
          <Select label="Rolle" items={roles} defaultValue="editor" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

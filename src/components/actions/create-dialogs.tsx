"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, UserPlus } from "lucide-react";
import { slugify } from "@/components/collections/format";
import { useCan, useKern } from "@/components/kern/kern-provider";
import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { createPage } from "@/server/actions/content";

const BLANK = "__blank";

const roles = [
  { label: "Redakteur", value: "editor" },
  { label: "Admin", value: "admin" },
  { label: "Nur lesen", value: "viewer" },
];

export function NewPageDialog({ trigger }: { trigger?: React.ReactNode } = {}) {
  const { pages } = useKern();
  const canEdit = useCan("editor");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [pathTouched, setPathTouched] = useState(false);
  const [copyFrom, setCopyFrom] = useState(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  const templates = [
    { label: "Leere Seite", value: BLANK },
    ...pages.map((p) => ({ label: `${p.title} (${p.path})`, value: p.name })),
  ];

  function reset() {
    setTitle("");
    setPath("");
    setPathTouched(false);
    setCopyFrom(BLANK);
    setErrors({});
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return setErrors({ title: "Bitte gib einen Titel ein." });
    startTransition(async () => {
      const result = await createPage({
        title: title.trim(),
        path: path.trim(),
        copyFrom: copyFrom === BLANK ? undefined : copyFrom,
      });
      if (!result.ok) {
        setErrors(result.errors ?? {});
        toast.error("Seite nicht angelegt", { description: result.error });
        return;
      }
      toast.success("Seite angelegt", { description: `${result.data.path} liegt jetzt im Entwurf.` });
      setOpen(false);
      reset();
      router.push(`/editor?page=${encodeURIComponent(result.data.name)}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger className={buttonStyles()}>
        {trigger ?? (
          <>
            <Plus />
            Neue Seite
          </>
        )}
      </DialogTrigger>
      <DialogContent
        title="Neue Seite"
        description="Die Seite wird als Entwurf angelegt und erst mit dem nächsten Veröffentlichen sichtbar."
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <Button type="submit" form="new-page-form" disabled={pending}>
              {pending ? "Wird angelegt…" : "Seite anlegen"}
            </Button>
          </>
        }
      >
        <form id="new-page-form" onSubmit={submit} className="flex flex-col gap-6">
          <Field>
            <Label>Titel</Label>
            <Input
              autoFocus
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!pathTouched) setPath(e.target.value.trim() ? `/${slugify(e.target.value)}` : "");
              }}
            />
            {errors.title && <p className="text-sm font-medium text-danger">{errors.title}</p>}
          </Field>
          <Field>
            <Label>Pfad</Label>
            <Input
              className="font-mono"
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setPathTouched(true);
              }}
            />
            <Description>Optional. Wird aus dem Titel vorgeschlagen.</Description>
            {errors.path && <p className="text-sm font-medium text-danger">{errors.path}</p>}
          </Field>
          <div className="flex flex-col gap-2">
            <Select label="Vorlage" items={templates} value={copyFrom} onValueChange={setCopyFrom} />
            <p className="text-sm text-muted">Übernimmt die Blöcke einer bestehenden Seite.</p>
          </div>
        </form>
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

"use client";

import { useState } from "react";
import { ImageIcon, Link2, Trash2 } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";

export function MediaTile({ name, size }: { name: string; size: string }) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const url = `/uploads/${name}`;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-card transition-shadow outline-none hover:shadow-popover focus-visible:ring-4 focus-visible:ring-accent/20">
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-subtle text-border-strong">
            <ImageIcon className="size-10" strokeWidth={1.25} />
          </div>
          <div className="flex flex-col px-4 py-3.5">
            <span className="truncate text-[15px] font-medium">{name}</span>
            <span className="text-sm text-muted">{size}</span>
          </div>
        </DialogTrigger>
        <DialogContent
          title={name}
          description={`${size} · hochgeladen am 8. Nov.`}
          size="lg"
          footer={
            <>
              <Button variant="ghost" className="mr-auto text-danger hover:bg-danger-soft" onClick={() => setConfirmOpen(true)}>
                <Trash2 />
                Löschen
              </Button>
              <DialogClose className={buttonStyles({ variant: "secondary" })}>Schließen</DialogClose>
              <DialogClose className={buttonStyles()} onClick={() => toast.success("Gespeichert")}>
                Speichern
              </DialogClose>
            </>
          }
        >
          <div className="grid gap-7 sm:grid-cols-[1fr_260px]">
            <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-subtle text-border-strong">
              <ImageIcon className="size-16" strokeWidth={1} />
            </div>
            <div className="flex flex-col gap-6">
              <Field>
                <Label>Alternativtext</Label>
                <Input />
                <Description>Beschreibt das Bild für Screenreader und Suchmaschinen.</Description>
              </Field>
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(url);
                  toast.success("Link kopiert", { description: url });
                }}
              >
                <Link2 />
                Link kopieren
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`„${name}“ löschen?`}
        description="Seiten, die das Bild verwenden, zeigen danach eine Lücke."
        confirmLabel="Löschen"
        danger
        onConfirm={() => {
          setOpen(false);
          toast.success(`„${name}“ gelöscht`);
        }}
      />
    </>
  );
}

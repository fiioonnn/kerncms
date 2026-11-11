"use client";

import { useState } from "react";
import { CopyPlus, Monitor, MoreHorizontal, Pencil, Smartphone, Tablet, Trash2 } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Label } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Popover, PopoverContent, PopoverTrigger, SegmentedControl, Tooltip } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";

function Demo({ title, rule, children }: { title: string; rule: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted">{rule}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function InteractionDemos() {
  const [range, setRange] = useState("30");
  const [device, setDevice] = useState("desktop");

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Demo title="Menü" rule="Für Aktionen zu einem Eintrag. Gefährliche Aktionen ganz unten, rot und mit Bestätigung.">
        <Menu>
          <MenuTrigger className={buttonStyles({ variant: "secondary" })}>
            <MoreHorizontal />
            Aktionen
          </MenuTrigger>
          <MenuContent align="start">
            <MenuItem icon={Pencil}>Bearbeiten</MenuItem>
            <MenuItem icon={CopyPlus} onClick={() => toast.success("Dupliziert")}>
              Duplizieren
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={Trash2} danger>
              Löschen
            </MenuItem>
          </MenuContent>
        </Menu>
      </Demo>

      <Demo title="Dialog" rule="Für kurze Formulare. Primäre Aktion rechts unten, Abbrechen daneben.">
        <Dialog>
          <DialogTrigger className={buttonStyles()}>Dialog öffnen</DialogTrigger>
          <DialogContent
            title="Neue Seite"
            description="Beispiel für einen Formular-Dialog."
            footer={
              <>
                <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
                <DialogClose className={buttonStyles()} onClick={() => toast.success("Angelegt")}>
                  Anlegen
                </DialogClose>
              </>
            }
          >
            <Field>
              <Label>Titel</Label>
              <Input />
            </Field>
          </DialogContent>
        </Dialog>
        <ConfirmDialog
          trigger="Bestätigung"
          triggerClassName={buttonStyles({ variant: "secondary" })}
          title="Wirklich löschen?"
          description="Bestätigungen nur für Aktionen, die sich nicht leicht rückgängig machen lassen."
          confirmLabel="Löschen"
          danger
          onConfirm={() => toast.success("Gelöscht")}
        />
      </Demo>

      <Demo title="Toasts" rule="Kurze Rückmeldung nach einer Aktion. Verschwinden nach 4 Sekunden von selbst.">
        <Button variant="secondary" onClick={() => toast.success("Gespeichert", { description: "Die Änderung liegt im Entwurf." })}>
          Erfolg
        </Button>
        <Button variant="secondary" onClick={() => toast.info("Website verbinden", { description: "Kommt bald." })}>
          Hinweis
        </Button>
        <Button variant="secondary" onClick={() => toast.error("Speichern fehlgeschlagen", { description: "Bitte erneut versuchen." })}>
          Fehler
        </Button>
      </Demo>

      <Demo title="Tooltip und Popover" rule="Tooltips benennen Icon-Buttons. Popover zeigen kurze Zusatzinfos ohne Seitenwechsel.">
        <Tooltip label="Bearbeiten">
          <Button variant="secondary" size="icon" aria-label="Bearbeiten">
            <Pencil />
          </Button>
        </Tooltip>
        <Popover>
          <PopoverTrigger className={buttonStyles({ variant: "secondary" })}>Popover öffnen</PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-5">
            <h4 className="text-base font-semibold">Offene Änderungen</h4>
            <p className="mt-1 text-[15px] text-muted">3 Änderungen sind noch nicht veröffentlicht.</p>
          </PopoverContent>
        </Popover>
      </Demo>

      <Demo title="Segmented Control" rule="Für 2 bis 4 gleichwertige Ansichten, z. B. Zeitraum oder Gerät.">
        <SegmentedControl
          label="Zeitraum"
          value={range}
          onValueChange={setRange}
          items={[
            { value: "7", label: "7 Tage" },
            { value: "30", label: "30 Tage" },
            { value: "365", label: "12 Monate" },
          ]}
        />
        <SegmentedControl
          label="Gerät"
          value={device}
          onValueChange={setDevice}
          items={[
            { value: "desktop", label: "Desktop", icon: Monitor },
            { value: "tablet", label: "Tablet", icon: Tablet },
            { value: "mobile", label: "Smartphone", icon: Smartphone },
          ]}
        />
      </Demo>
    </div>
  );
}

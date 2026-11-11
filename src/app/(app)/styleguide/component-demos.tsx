"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { ImageField, MediaPickerDialog } from "@/components/media/media-picker";
import { SampleImage } from "@/components/media/sample-image";
import { Button } from "@/components/ui/button";
import { DatePicker, timeOptions } from "@/components/ui/date-picker";
import { LinkField, type LinkValue } from "@/components/ui/link-field";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { TagInput } from "@/components/ui/tag-input";
import { Switch } from "@/components/ui/toggles";
import { mediaFiles } from "@/lib/example-content";
import { Demo } from "./interaction-demos";

/** Slider, date, tags, link and controlled switch. */
export function InputDemos() {
  const [brightness, setBrightness] = useState(0);
  const [opacity, setOpacity] = useState(80);
  const [link, setLink] = useState<LinkValue>({ type: "page", path: "/kontakt" });
  const [notify, setNotify] = useState(true);

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Demo
        title="Slider"
        rule="Für Werte, bei denen das Gefühl zählt (Helligkeit, Deckkraft). Doppelklick auf den Wert setzt zurück. Für exakte Zahlen ein Feld nehmen."
      >
        <div className="flex w-full flex-col gap-5">
          <Slider label="Helligkeit" min={-100} max={100} value={brightness} onValueChange={setBrightness} />
          <Slider label="Deckkraft" value={opacity} onValueChange={setOpacity} format={(v) => `${v} %`} />
        </div>
      </Demo>

      <Demo
        title="Datum und Uhrzeit"
        rule="Datum immer mit dem DatePicker, Uhrzeit mit Select in 30-Minuten-Schritten. Nie native Datums- oder Zeitfelder."
      >
        <div className="grid w-full gap-4 sm:grid-cols-[1fr_160px]">
          <DatePicker label="Veröffentlichen am" defaultValue={new Date(2026, 10, 12)} />
          <Select label="Uhrzeit" items={timeOptions} defaultValue="09:00" />
        </div>
      </Demo>

      <Demo
        title="Tags"
        rule="Für freie Schlagworte. Enter oder Komma fügt hinzu, Rücktaste entfernt das letzte. Vorschläge kommen aus vorhandenen Tags."
      >
        <TagInput
          label="Schlagworte"
          defaultValue={["Brot", "Saisonal"]}
          suggestions={["Brot", "Gebäck", "Saisonal", "Rezept", "Veranstaltung", "Vegan"]}
          description="Werden auf der Website als Filter angezeigt."
          className="w-full"
        />
      </Demo>

      <Demo
        title="Link-Ziel"
        rule="Für Buttons und Verweise. Interne Seiten aus der Liste wählen, externe Adressen nur mit https://, mailto: oder tel:."
      >
        <div className="w-full">
          <LinkField label="Button-Ziel" value={link} onChange={setLink} />
        </div>
      </Demo>

      <Demo
        title="Schalter (gesteuert)"
        rule="Switch gibt es ungesteuert mit defaultChecked oder gesteuert mit checked und onCheckedChange."
        className="md:col-span-2"
      >
        <div className="flex w-full flex-col gap-2">
          <Switch
            label="E-Mail bei neuen Formulareingängen"
            description={notify ? "Ist eingeschaltet." : "Ist ausgeschaltet."}
            checked={notify}
            onCheckedChange={setNotify}
          />
        </div>
      </Demo>
    </div>
  );
}

const richTextSample =
  '<h2>Neue Sauerteigbrote</h2><p>Ab Mai backen wir jeden <strong>Freitag</strong> drei neue Sorten. Mehr dazu unter <a href="/sortiment">Sortiment</a>.</p><ul><li>Roggen-Vollkorn</li><li>Dinkel mit Saaten</li></ul>';

export function RichTextDemo() {
  return (
    <RichTextEditor
      label="Beitragstext"
      defaultValue={richTextSample}
    />
  );
}

export function MediaDemos() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<string | undefined>();

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Demo
        title="Bildfeld"
        rule="Jedes Bild im Inhalt ist ein ImageField: Vorschau, Bearbeiten, Ändern, Entfernen. Leer zeigt es eine große Fläche zum Wählen."
      >
        <div className="grid w-full gap-5 sm:grid-cols-2">
          <ImageField label="Titelbild" defaultValue={mediaFiles[0].name} />
          <ImageField label="Vorschaubild" description="Optional, sonst das Titelbild." />
        </div>
      </Demo>

      <Demo
        title="Mediathek-Dialog"
        rule="MediaPickerDialog direkt nur, wenn ein Bild ohne Feld gewählt wird (z. B. aus der Werkzeugleiste). Sonst ImageField nehmen."
      >
        <div className="flex w-full flex-col items-start gap-4">
          <Button variant="secondary" onClick={() => setPickerOpen(true)}>
            <ImageIcon strokeWidth={1.75} />
            Bild aus Mediathek wählen
          </Button>
          {picked ? (
            <div className="flex items-center gap-3">
              <SampleImage name={picked} className="size-14 rounded-lg" />
              <span className="text-[15px]">{picked}</span>
            </div>
          ) : (
            <p className="text-[15px] text-muted">Noch kein Bild gewählt.</p>
          )}
        </div>
        <MediaPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onSelect={setPicked} current={picked} />
      </Demo>
    </div>
  );
}

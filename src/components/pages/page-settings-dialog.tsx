"use client";

import { useState } from "react";
import { ImageField } from "@/components/media/media-picker";
import { SampleImage } from "@/components/media/sample-image";
import { buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/toggles";
import { sitePages } from "@/lib/example-content";
import { cn } from "@/lib/utils";

const DOMAIN = "baeckerei-mueller.de";

function Counter({ value, ideal }: { value: string; ideal: [number, number] }) {
  const n = value.length;
  const ok = n >= ideal[0] && n <= ideal[1];
  return (
    <span className={cn("text-sm tabular-nums", n === 0 ? "text-muted" : ok ? "text-success" : "text-warning")}>
      {n} / {ideal[1]}
    </span>
  );
}

export function PageSettingsDialog({
  open,
  onOpenChange,
  title,
  path,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  path: string;
}) {
  const [seoTitle, setSeoTitle] = useState(`${title} · Bäckerei Müller`);
  const [seoDescription, setSeoDescription] = useState(
    "Handwerklich gebackenes Brot aus regionalem Mehl. Seit 1962 in München, jeden Morgen frisch.",
  );
  const parents = [{ label: "Keine (oberste Ebene)", value: "none" }, ...sitePages.filter((p) => p.value !== path)];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Einstellungen: ${title}`}
        description="Gilt für diese Seite. Änderungen landen im Entwurf."
        size="lg"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <DialogClose
              className={buttonStyles()}
              onClick={() => toast.success("Seiteneinstellungen gespeichert", { description: "Die Änderung liegt im Entwurf." })}
            >
              Speichern
            </DialogClose>
          </>
        }
      >
        <Tabs defaultValue="general">
          <TabsList className="-mt-2">
            <Tab value="general">Allgemein</Tab>
            <Tab value="seo">Suchmaschinen</Tab>
            <Tab value="social">Social Media</Tab>
          </TabsList>

          <TabPanel value="general" className="flex flex-col gap-5 pt-5">
            <Field>
              <Label>Titel</Label>
              <Input defaultValue={title} />
            </Field>
            <Field>
              <Label>Pfad</Label>
              <div className="flex items-center rounded-xl border border-border-strong bg-subtle/60 pl-4 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
                <span className="shrink-0 text-[15px] whitespace-nowrap text-muted">{DOMAIN}</span>
                <Input defaultValue={path} className="rounded-l-none border-0 bg-surface font-mono focus:ring-0" />
              </div>
              <Description>Wenn du den Pfad änderst, wird automatisch eine Weiterleitung vom alten Pfad angelegt.</Description>
            </Field>
            <Select label="Übergeordnete Seite" items={parents} defaultValue="none" />
            <div className="flex flex-col gap-5 border-t border-border pt-5">
              <Switch label="Im Menü anzeigen" description="Die Seite erscheint in der Hauptnavigation." defaultChecked />
              <Switch label="Seite ist öffentlich" description="Ausgeschaltet ist die Seite nur für angemeldete Nutzer sichtbar." defaultChecked />
            </div>
          </TabPanel>

          <TabPanel value="seo" className="flex flex-col gap-5 pt-5">
            <Field>
              <div className="flex items-center justify-between">
                <Label>Titel in Suchergebnissen</Label>
                <Counter value={seoTitle} ideal={[30, 60]} />
              </div>
              <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
            </Field>
            <Field>
              <div className="flex items-center justify-between">
                <Label>Beschreibung</Label>
                <Counter value={seoDescription} ideal={[70, 160]} />
              </div>
              <Textarea rows={3} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />
              <Description>Ideal sind 70 bis 160 Zeichen. Google kürzt längere Texte.</Description>
            </Field>

            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-medium">Vorschau bei Google</span>
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-full bg-subtle text-[10px] font-bold">BM</span>
                  <span className="flex flex-col leading-tight">
                    <span className="text-sm">Bäckerei Müller</span>
                    <span className="text-xs text-muted">
                      https://{DOMAIN}
                      {path === "/" ? "" : path}
                    </span>
                  </span>
                </div>
                <p className="mt-2 truncate text-lg text-[#1a0dab]">{seoTitle || title}</p>
                <p className="line-clamp-2 text-sm text-[#4d5156]">{seoDescription || "Keine Beschreibung angegeben."}</p>
              </div>
            </div>

            <Switch label="Von Suchmaschinen ausschließen" description="Setzt „noindex“. Die Seite bleibt erreichbar, erscheint aber nicht bei Google." />
          </TabPanel>

          <TabPanel value="social" className="flex flex-col gap-5 pt-5">
            <ImageField
              label="Vorschaubild"
              description="Wird beim Teilen auf WhatsApp, Facebook oder LinkedIn angezeigt. Ideal: 1200 × 630 px."
              defaultValue="hero-brot.jpg"
              aspect="aspect-[1200/630]"
            />
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-medium">Vorschau beim Teilen</span>
              <div className="overflow-hidden rounded-xl border border-border">
                <SampleImage name="hero-brot.jpg" className="aspect-[1200/630] w-full" />
                <div className="flex flex-col gap-0.5 bg-subtle/60 px-4 py-3">
                  <span className="text-xs text-muted uppercase">{DOMAIN}</span>
                  <span className="truncate text-[15px] font-semibold">{seoTitle || title}</span>
                  <span className="line-clamp-1 text-sm text-muted">{seoDescription}</span>
                </div>
              </div>
            </div>
          </TabPanel>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

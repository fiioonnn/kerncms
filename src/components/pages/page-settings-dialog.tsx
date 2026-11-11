"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useKern, mediaSrc } from "@/components/kern/kern-provider";
import { ImageField } from "@/components/media/media-picker";
import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/toggles";
import type { PageSeo } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { updatePageSettings } from "@/server/actions/content";

export type PageSettingsInput = { name: string; title: string; path: string; seo: PageSeo };

function Counter({ value, ideal }: { value: string; ideal: [number, number] }) {
  const n = value.length;
  const ok = n >= ideal[0] && n <= ideal[1];
  return (
    <span className={cn("text-sm tabular-nums", n === 0 ? "text-muted" : ok ? "text-success" : "text-warning")}>
      {n} / {ideal[1]}
    </span>
  );
}

function ErrorText({ error }: { error?: string }) {
  return error ? <p className="text-sm font-medium text-danger">{error}</p> : null;
}

/** Title, path and SEO settings of a page. Saves with `updatePageSettings` (one commit). */
export function PageSettingsDialog({
  open,
  onOpenChange,
  page,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: PageSettingsInput;
  /** Called after a successful save with the stored path. */
  onSaved?: (result: { title: string; path: string; seo: PageSeo }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <SettingsForm page={page} onDone={() => onOpenChange(false)} onSaved={onSaved} />}
    </Dialog>
  );
}

function SettingsForm({
  page,
  onDone,
  onSaved,
}: {
  page: PageSettingsInput;
  onDone: () => void;
  onSaved?: (result: { title: string; path: string; seo: PageSeo }) => void;
}) {
  const { site, mediaPrefix } = useKern();
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [path, setPath] = useState(page.path);
  const [seoTitle, setSeoTitle] = useState(page.seo.title ?? "");
  const [seoDescription, setSeoDescription] = useState(page.seo.description ?? "");
  const [seoImage, setSeoImage] = useState(page.seo.image ?? "");
  const [noindex, setNoindex] = useState(page.seo.noindex ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const isHome = page.path === "/";
  const domain = site.liveUrl ? site.liveUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "") : site.name;
  const shownTitle = seoTitle || title;

  function save() {
    const seo: PageSeo = { title: seoTitle.trim(), description: seoDescription.trim(), image: seoImage, noindex };
    startTransition(async () => {
      const result = await updatePageSettings(page.name, { title, path: isHome ? "/" : path, seo });
      if (!result.ok) {
        setErrors(result.errors ?? {});
        toast.error("Speichern fehlgeschlagen", { description: result.error });
        return;
      }
      toast.success("Seiteneinstellungen gespeichert", { description: "Die Änderung liegt im Entwurf." });
      onSaved?.({ title: title.trim(), path: result.data.path, seo });
      router.refresh();
      onDone();
    });
  }

  return (
    <DialogContent
      title={`Einstellungen: ${page.title}`}
      description="Gilt für diese Seite. Änderungen landen im Entwurf."
      size="lg"
      footer={
        <>
          <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
          <Button onClick={save} disabled={pending || !title.trim()}>
            {pending ? "Speichert…" : "Speichern"}
          </Button>
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
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            <ErrorText error={errors.title} />
          </Field>
          <Field>
            <Label>Pfad</Label>
            <div className="flex items-center rounded-xl border border-border-strong bg-subtle/60 pl-4 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
              <span className="shrink-0 text-[15px] whitespace-nowrap text-muted">{domain}</span>
              <Input
                value={path}
                disabled={isHome}
                onChange={(e) => setPath(e.target.value)}
                className="rounded-l-none border-0 bg-surface font-mono focus:ring-0"
              />
            </div>
            <Description>
              {isHome
                ? "Die Startseite liegt immer unter „/“."
                : "Links auf den alten Pfad funktionieren danach nicht mehr. Lege bei Bedarf eine Weiterleitung an."}
            </Description>
            <ErrorText error={errors.path} />
          </Field>
        </TabPanel>

        <TabPanel value="seo" className="flex flex-col gap-5 pt-5">
          <Field>
            <div className="flex items-center justify-between">
              <Label>Titel in Suchergebnissen</Label>
              <Counter value={seoTitle} ideal={[30, 60]} />
            </div>
            <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
            <Description>Leer lassen, um den Seitentitel zu verwenden.</Description>
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
              <span className="flex flex-col leading-tight">
                <span className="text-sm">{site.name}</span>
                <span className="text-xs text-muted">
                  https://{domain}
                  {isHome ? "" : path}
                </span>
              </span>
              <p className="mt-2 truncate text-lg text-[#1a0dab]">{shownTitle}</p>
              <p className="line-clamp-2 text-sm text-[#4d5156]">{seoDescription || "Keine Beschreibung angegeben."}</p>
            </div>
          </div>

          <Switch
            label="Von Suchmaschinen ausschließen"
            description="Setzt „noindex“. Die Seite bleibt erreichbar, erscheint aber nicht bei Google."
            checked={noindex}
            onCheckedChange={setNoindex}
          />
        </TabPanel>

        <TabPanel value="social" className="flex flex-col gap-5 pt-5">
          <ImageField
            label="Vorschaubild"
            description="Wird beim Teilen auf WhatsApp, Facebook oder LinkedIn angezeigt. Ideal: 1200 × 630 px."
            value={seoImage || undefined}
            onChange={(next) => setSeoImage(next ?? "")}
            aspect="aspect-[1200/630]"
          />
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-medium">Vorschau beim Teilen</span>
            <div className="overflow-hidden rounded-xl border border-border">
              {seoImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaSrc(seoImage, mediaPrefix)} alt="" className="aspect-[1200/630] w-full object-cover" />
              ) : (
                <div className="flex aspect-[1200/630] w-full items-center justify-center bg-subtle text-sm text-muted">
                  Kein Vorschaubild
                </div>
              )}
              <div className="flex flex-col gap-0.5 bg-subtle/60 px-4 py-3">
                <span className="text-xs text-muted uppercase">{domain}</span>
                <span className="truncate text-[15px] font-semibold">{shownTitle}</span>
                <span className="line-clamp-1 text-sm text-muted">{seoDescription}</span>
              </div>
            </div>
          </div>
        </TabPanel>
      </Tabs>
    </DialogContent>
  );
}

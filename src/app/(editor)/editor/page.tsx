"use client";

import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  History,
  Settings2,
  Eye,
  Images,
  LayoutTemplate,
  Monitor,
  MessageSquareQuote,
  Plus,
  Redo2,
  Smartphone,
  Tablet,
  Text,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { PublishButton } from "@/components/actions/publish";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/display";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { SegmentedControl, Tooltip } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ImageField } from "@/components/media/media-picker";
import { SampleImage } from "@/components/media/sample-image";
import { VersionHistory } from "@/components/history/version-history";
import { PageSettingsDialog } from "@/components/pages/page-settings-dialog";
import { cn } from "@/lib/utils";
import { EditorLoader } from "./editor-loader";

/* ---------- Example content ---------- */

const pages = [
  { label: "Startseite", value: "home" },
  { label: "Über uns", value: "about" },
  { label: "Sortiment", value: "products" },
  { label: "Kontakt", value: "contact" },
];

const layouts = [
  { label: "Text links", value: "left" },
  { label: "Zentriert", value: "center" },
];

const marks = [
  { id: "accent", label: "Akzent", className: "text-accent" },
  { id: "marker", label: "Marker", className: "bg-warning-soft box-decoration-clone px-1" },
  { id: "wavy", label: "Wellenlinie", className: "underline decoration-wavy decoration-accent decoration-2 underline-offset-[6px]" },
] as const;

type MarkId = (typeof marks)[number]["id"];

const devices = [
  { value: "desktop", label: "Desktop", icon: Monitor, width: undefined },
  { value: "tablet", label: "Tablet", icon: Tablet, width: 820 },
  { value: "mobile", label: "Smartphone", icon: Smartphone, width: 390 },
];

const blockTypes: { label: string; description: string; icon: LucideIcon }[] = [
  { label: "Hero", description: "Große Überschrift mit Text und Button", icon: LayoutTemplate },
  { label: "Text", description: "Fließtext mit Zwischenüberschriften", icon: Text },
  { label: "Galerie", description: "Bilder im Raster", icon: Images },
  { label: "Zitat", description: "Kundenstimme oder Zitat", icon: MessageSquareQuote },
];

type BlockId = "hero" | "categories";

/* ---------- Topbar ---------- */

function EditorPageTools() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <>
      <Tooltip label="Seiteneinstellungen und SEO">
        <Button variant="ghost" size="icon" aria-label="Seiteneinstellungen" onClick={() => setSettingsOpen(true)}>
          <Settings2 strokeWidth={1.75} />
        </Button>
      </Tooltip>
      <Tooltip label="Verlauf dieser Seite">
        <Button variant="ghost" size="icon" aria-label="Verlauf" onClick={() => setHistoryOpen(true)}>
          <History strokeWidth={1.75} />
        </Button>
      </Tooltip>
      <PageSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} title="Startseite" path="/" />
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent title="Verlauf: Startseite" description="Alle gespeicherten Versionen dieser Seite." size="xl" className="[&>div:nth-child(2)]:p-0">
          <VersionHistory scope="Startseite" className="h-[460px] border-t border-border" />
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditorTopbar({
  device,
  onDeviceChange,
  onPageChange,
}: {
  device: string;
  onDeviceChange: (value: string) => void;
  onPageChange: (value: string) => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
      <Tooltip label="Zurück zum CMS">
        <Link href="/pages" aria-label="Zurück zum CMS" className={buttonStyles({ variant: "ghost", size: "icon" })}>
          <ArrowLeft strokeWidth={1.75} />
        </Link>
      </Tooltip>
      <span className="h-8 w-px bg-border" />
      <Select items={pages} defaultValue="home" onValueChange={onPageChange} className="w-56" />
      <Badge tone="warning" dot>
        Entwurf
      </Badge>

      <SegmentedControl
        label="Gerät"
        items={devices.map(({ value, label, icon }) => ({ value, label, icon }))}
        value={device}
        onValueChange={onDeviceChange}
        className="mx-auto"
      />

      <div className="flex items-center gap-2">
        <EditorPageTools />
        <span className="mx-1 h-8 w-px bg-border" />
        <Tooltip label="Rückgängig (⌘Z)">
          <Button variant="ghost" size="icon" aria-label="Rückgängig" onClick={() => toast.info("Rückgängig gemacht")}>
            <Undo2 strokeWidth={1.75} />
          </Button>
        </Tooltip>
        <Tooltip label="Wiederholen (⇧⌘Z)">
          <Button variant="ghost" size="icon" aria-label="Wiederholen" onClick={() => toast.info("Wiederholt")}>
            <Redo2 strokeWidth={1.75} />
          </Button>
        </Tooltip>
        <span className="mx-1 h-8 w-px bg-border" />
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(`${location.origin}/preview/startseite`);
            toast.success("Vorschau-Link kopiert", { description: "Gültig für 7 Tage, ohne Anmeldung." });
          }}
        >
          <Eye />
          Vorschau
        </Button>
        <Button variant="secondary" onClick={() => toast.success("Gespeichert", { description: "Die Änderung liegt im Entwurf." })}>
          Speichern
        </Button>
        <PublishButton changes={1} />
      </div>
    </header>
  );
}

/* ---------- Properties sidebar ---------- */

function HeroFields({ mark, onMarkChange }: { mark: MarkId; onMarkChange: (mark: MarkId) => void }) {
  const active = marks.find((m) => m.id === mark)!;
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-medium">Überschrift</span>
        <div className="rounded-xl border border-accent ring-4 ring-accent/15">
          <div className="flex flex-wrap gap-1.5 border-b border-border p-2">
            {marks.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={m.id === mark}
                onClick={() => onMarkChange(m.id)}
                className={cn(
                  "h-9 rounded-lg px-3 text-sm font-medium transition-colors",
                  m.id === mark ? "bg-accent-soft text-accent" : "hover:bg-subtle",
                )}
              >
                <span className={m.className}>{m.label}</span>
              </button>
            ))}
          </div>
          <p className="px-4 py-3 text-[15px] leading-relaxed">
            Frisches Brot, <span className={cn("rounded", active.className)}>jeden Morgen</span> aus unserer Backstube
          </p>
        </div>
        <p className="text-sm text-muted">Markiere Wörter und wähle einen Stil.</p>
      </div>

      <Field>
        <Label>Text</Label>
        <Textarea rows={3} defaultValue="Seit 1962 backen wir mit Zeit, Handwerk und regionalem Mehl." />
      </Field>

      <div className="flex flex-col gap-5 border-t border-border pt-7">
        <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">Button</h3>
        <Field>
          <Label>Text</Label>
          <Input defaultValue="Zum Sortiment" />
        </Field>
        <Field>
          <Label>Link</Label>
          <Input defaultValue="/sortiment" />
          <Description>Interne Seite oder vollständige URL.</Description>
        </Field>
      </div>

      <div className="flex flex-col gap-5 border-t border-border pt-7">
        <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">Darstellung</h3>
        <Select label="Layout" items={layouts} defaultValue="left" />
        <ImageField label="Hintergrundbild" description="Optional. Wird hinter der Überschrift abgedunkelt angezeigt." />
      </div>
    </>
  );
}

function CategoryFields() {
  return (
    <>
      {["Brote", "Brötchen", "Kuchen"].map((label, i) => (
        <div key={label} className={cn("flex flex-col gap-5", i > 0 && "border-t border-border pt-7")}>
          <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">Kachel {i + 1}</h3>
          <ImageField label="Bild" aspect="aspect-[4/3]" defaultValue={["dinkelbrot.jpg", "croissants.jpg", "sauerteig.jpg"].at(i)} />
          <Field>
            <Label>Titel</Label>
            <Input defaultValue={label} />
          </Field>
          <Field>
            <Label>Link</Label>
            <Input defaultValue={`/sortiment#${label.toLowerCase()}`} />
          </Field>
        </div>
      ))}
    </>
  );
}

function PropertiesSidebar({
  block,
  mark,
  onMarkChange,
}: {
  block: BlockId;
  mark: MarkId;
  onMarkChange: (mark: MarkId) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const title = block === "hero" ? "Hero" : "Kategorien";

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex flex-col gap-1 border-b border-border px-6 py-5">
        <span className="flex items-center gap-1.5 text-sm text-muted">
          Startseite
          <ChevronRight className="size-3.5" />
          Block
        </span>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>

      <div key={block} className="flex flex-1 flex-col gap-7 overflow-y-auto px-6 py-6">
        {block === "hero" ? <HeroFields mark={mark} onMarkChange={onMarkChange} /> : <CategoryFields />}
      </div>

      <div className="border-t border-border p-4">
        <Button variant="ghost" className="w-full text-danger hover:bg-danger-soft" onClick={() => setConfirmOpen(true)}>
          <Trash2 />
          Block entfernen
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Block „${title}“ entfernen?`}
        description="Der Block verschwindet aus dem Entwurf. Mit Rückgängig holst du ihn zurück."
        confirmLabel="Entfernen"
        danger
        onConfirm={() => toast.success(`Block „${title}“ entfernt`)}
      />
    </aside>
  );
}

/* ---------- Canvas ---------- */

function AddBlockDialog() {
  return (
    <Dialog>
      <DialogTrigger className={buttonStyles({ variant: "secondary" })}>
        <Plus />
        Block hinzufügen
      </DialogTrigger>
      <DialogContent title="Block hinzufügen" description="Wähle, was unter dem letzten Block erscheinen soll." size="lg">
        <div className="grid gap-3 sm:grid-cols-2">
          {blockTypes.map((type) => (
            <DialogClose
              key={type.label}
              onClick={() => toast.success(`Block „${type.label}“ hinzugefügt`)}
              className="flex items-start gap-4 rounded-xl border border-border p-4 text-left transition-colors outline-none hover:border-accent hover:bg-accent-soft/50 focus-visible:ring-4 focus-visible:ring-accent/15"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-foreground">
                <type.icon className="size-5" strokeWidth={1.75} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-medium">{type.label}</span>
                <span className="text-sm text-muted">{type.description}</span>
              </span>
            </DialogClose>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Canvas({
  device,
  block,
  onSelect,
  mark,
}: {
  device: string;
  block: BlockId;
  onSelect: (block: BlockId) => void;
  mark: MarkId;
}) {
  const width = devices.find((d) => d.value === device)?.width;
  const narrow = device === "mobile";
  const markClass = marks.find((m) => m.id === mark)!.className;

  const blockClass = (id: BlockId) =>
    cn(
      "relative cursor-pointer rounded-xl outline-2 -outline-offset-2 transition-[outline-color]",
      block === id ? "outline-accent" : "outline-transparent hover:outline-accent/40",
    );

  return (
    <div className={cn("flex-1 overflow-auto", width ? "bg-background p-8" : "bg-white")}>
      <div
        className={cn("mx-auto bg-white transition-[max-width] duration-300", width && "overflow-hidden rounded-2xl border border-border")}
        style={{ maxWidth: width ?? "100%" }}
      >
        <div className={cn("flex items-center justify-between border-b border-neutral-100 py-6", narrow ? "px-6" : "px-12")}>
          <span className="text-lg font-bold">Bäckerei Müller</span>
          {narrow ? (
            <span className="flex flex-col gap-1">
              <span className="h-0.5 w-5 bg-neutral-800" />
              <span className="h-0.5 w-5 bg-neutral-800" />
              <span className="h-0.5 w-5 bg-neutral-800" />
            </span>
          ) : (
            <span className="flex gap-7 text-[15px] text-neutral-500">
              <span>Sortiment</span>
              <span>Über uns</span>
              <span>Kontakt</span>
            </span>
          )}
        </div>

        <div className={cn("m-3", blockClass("hero"))} onClick={() => onSelect("hero")}>
          {block === "hero" && (
            <span className="absolute -top-3 left-6 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-white">Hero</span>
          )}
          <div className={cn(narrow ? "px-5 py-10" : "px-9 py-16")}>
            <h1 className={cn("max-w-3xl leading-tight font-bold tracking-tight", narrow ? "text-4xl" : "text-5xl")}>
              Frisches Brot, <span className={markClass}>jeden Morgen</span> aus unserer Backstube
            </h1>
            <p className="mt-6 max-w-xl text-lg text-neutral-500">
              Seit 1962 backen wir mit Zeit, Handwerk und regionalem Mehl.
            </p>
            <span className="mt-8 inline-flex h-12 items-center rounded-full bg-neutral-900 px-6 text-[15px] font-medium text-white">
              Zum Sortiment
            </span>
          </div>
        </div>

        <div className={cn("m-3", blockClass("categories"))} onClick={() => onSelect("categories")}>
          {block === "categories" && (
            <span className="absolute -top-3 left-6 z-10 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-white">
              Kategorien
            </span>
          )}
          <div className={cn("grid gap-5 p-9", narrow ? "grid-cols-1 p-5" : "grid-cols-3")}>
            {[
              { label: "Brote", image: "dinkelbrot.jpg" },
              { label: "Brötchen", image: "croissants.jpg" },
              { label: "Kuchen", image: "sauerteig.jpg" },
            ].map((tile) => (
              <div key={tile.label} className="flex flex-col gap-3">
                <SampleImage name={tile.image} className="aspect-[4/3] rounded-xl" />
                <span className="text-[15px] font-medium">{tile.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center px-12 pt-4 pb-16">
          <AddBlockDialog />
        </div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function EditorPage() {
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState<string | undefined>();
  const [loadRun, setLoadRun] = useState(0);
  const [device, setDevice] = useState("desktop");
  const [block, setBlock] = useState<BlockId>("hero");
  const [mark, setMark] = useState<MarkId>("accent");
  const duration = loadingText ? 700 : 1200;

  // Simulates the site preview starting up; later this waits for the iframe.
  // Next.js keeps visited routes alive in a hidden <Activity>, so the cleanup
  // (which also runs when the route is hidden) puts the loader back: it then
  // shows again every time the editor is opened, not only on the first visit.
  useLayoutEffect(() => {
    const timer = setTimeout(() => setLoading(false), duration);
    return () => {
      clearTimeout(timer);
      setLoading(true);
    };
  }, [loadRun, duration]);

  // When the editor is left, the next visit should show the default loader text.
  useLayoutEffect(() => () => setLoadingText(undefined), []);

  return (
    <div className="flex h-dvh flex-col">
      <EditorLoader
        visible={loading}
        duration={duration}
        {...(loadingText && { title: `${loadingText} wird geladen`, detail: "Einen Moment…" })}
      />
      <EditorTopbar
        device={device}
        onDeviceChange={setDevice}
        onPageChange={(value) => {
          setLoadingText(pages.find((p) => p.value === value)?.label);
          setBlock("hero");
          setLoadRun((n) => n + 1);
        }}
      />
      <div className="flex min-h-0 flex-1">
        <PropertiesSidebar block={block} mark={mark} onMarkChange={setMark} />
        <Canvas device={device} block={block} onSelect={setBlock} mark={mark} />
      </div>
    </div>
  );
}

import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Eye,
  Monitor,
  Plus,
  Redo2,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/toggles";
import { cn } from "@/lib/utils";

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
  { label: "Akzent", className: "text-accent" },
  { label: "Marker", className: "bg-warning-soft" },
  { label: "Wellenlinie", className: "underline decoration-wavy decoration-accent underline-offset-4" },
];

const viewports = [
  { label: "Desktop", icon: Monitor },
  { label: "Tablet", icon: Tablet },
  { label: "Smartphone", icon: Smartphone },
];

function EditorTopbar() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
      <Link
        href="/pages"
        aria-label="Zurück zum CMS"
        className={buttonStyles({ variant: "ghost", size: "icon" })}
      >
        <ArrowLeft strokeWidth={1.75} />
      </Link>
      <span className="h-8 w-px bg-border" />
      <Select items={pages} defaultValue="home" className="w-56" />
      <Badge tone="warning" dot>
        Entwurf
      </Badge>

      <div className="mx-auto flex rounded-xl border border-border p-1">
        {viewports.map((viewport, i) => (
          <Button
            key={viewport.label}
            variant="ghost"
            size="icon"
            aria-label={viewport.label}
            className={cn("size-9 rounded-lg", i === 0 && "bg-subtle")}
          >
            <viewport.icon strokeWidth={1.75} />
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Rückgängig">
          <Undo2 strokeWidth={1.75} />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Wiederholen">
          <Redo2 strokeWidth={1.75} />
        </Button>
        <span className="mx-1 h-8 w-px bg-border" />
        <Button variant="secondary">
          <Eye />
          Vorschau
        </Button>
        <Button variant="secondary">Speichern</Button>
        <Button>Veröffentlichen</Button>
      </div>
    </header>
  );
}

function PropertiesSidebar() {
  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex flex-col gap-1 border-b border-border px-6 py-5">
        <span className="flex items-center gap-1.5 text-sm text-muted">
          Startseite
          <ChevronRight className="size-3.5" />
          Block
        </span>
        <h2 className="text-xl font-semibold tracking-tight">Hero</h2>
      </div>

      <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-6 py-6">
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-medium">Überschrift</span>
          <div className="rounded-xl border border-accent ring-4 ring-accent/15">
            <div className="flex flex-wrap gap-1.5 border-b border-border p-2">
              {marks.map((mark, i) => (
                <button
                  key={mark.label}
                  type="button"
                  className={cn(
                    "h-9 rounded-lg px-3 text-sm font-medium transition-colors",
                    i === 0 ? "bg-accent-soft text-accent" : "hover:bg-subtle",
                  )}
                >
                  <span className={mark.className}>{mark.label}</span>
                </button>
              ))}
            </div>
            <p className="px-4 py-3 text-[15px] leading-relaxed">
              Frisches Brot, <span className="rounded bg-accent-soft px-0.5 text-accent">jeden Morgen</span> aus
              unserer Backstube
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
          <Switch label="Hintergrundbild" description="Bild hinter der Überschrift anzeigen." />
        </div>
      </div>

      <div className="border-t border-border p-4">
        <Button variant="ghost" className="w-full text-danger hover:bg-danger-soft">
          <Trash2 />
          Block entfernen
        </Button>
      </div>
    </aside>
  );
}

function Canvas() {
  return (
    <div className="flex-1 overflow-auto bg-white">
      {/* Mock of the customer's site as it would appear in the iframe */}
      <div>
        <div className="flex items-center justify-between border-b border-neutral-100 px-12 py-6">
          <span className="text-lg font-bold">Bäckerei Müller</span>
          <span className="flex gap-7 text-[15px] text-neutral-500">
            <span>Sortiment</span>
            <span>Über uns</span>
            <span>Kontakt</span>
          </span>
        </div>

        <div className="relative m-4 rounded-xl px-8 py-16 outline-2 outline-accent">
          <span className="absolute -top-3 left-6 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-white">
            Hero
          </span>
          <h1 className="max-w-3xl text-5xl leading-tight font-bold tracking-tight">
            Frisches Brot, <span className="text-accent">jeden Morgen</span> aus unserer Backstube
          </h1>
          <p className="mt-6 max-w-xl text-lg text-neutral-500">
            Seit 1962 backen wir mit Zeit, Handwerk und regionalem Mehl.
          </p>
          <span className="mt-8 inline-flex h-12 items-center rounded-full bg-neutral-900 px-6 text-[15px] font-medium text-white">
            Zum Sortiment
          </span>
        </div>

        <div className="grid grid-cols-3 gap-5 px-12 pt-4 pb-10">
          {["Brote", "Brötchen", "Kuchen"].map((label) => (
            <div
              key={label}
              className="flex aspect-[4/3] items-end rounded-xl bg-neutral-100 p-4 text-[15px] font-medium outline-dashed outline-1 outline-transparent hover:outline-accent"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="flex justify-center px-12 pb-16">
          <Button variant="secondary">
            <Plus />
            Block hinzufügen
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function EditorPage() {
  return (
    <div className="flex h-dvh flex-col">
      <EditorTopbar />
      <div className="flex min-h-0 flex-1">
        <PropertiesSidebar />
        <Canvas />
      </div>
    </div>
  );
}

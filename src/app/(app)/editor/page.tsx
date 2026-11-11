import { Monitor, Plus, Smartphone, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const pages = [
  { label: "Startseite", value: "home" },
  { label: "Über uns", value: "about" },
  { label: "Sortiment", value: "products" },
  { label: "Kontakt", value: "contact" },
];

const marks = [
  { label: "Akzent", className: "text-accent" },
  { label: "Marker", className: "bg-warning-soft" },
  { label: "Wellenlinie", className: "underline decoration-wavy decoration-accent underline-offset-4" },
];

export default function EditorPage() {
  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0">
      {/* Canvas */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-6">
          <Select items={pages} defaultValue="home" className="w-56" />
          <div className="ml-auto flex rounded-xl border border-border p-1">
            {[Monitor, Tablet, Smartphone].map((Icon, i) => (
              <Button
                key={i}
                variant="ghost"
                size="icon"
                aria-label="Ansicht"
                className={cn("size-9 rounded-lg", i === 0 && "bg-subtle")}
              >
                <Icon strokeWidth={1.75} />
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-8">
          {/* Mock of the customer's site as it would appear in the iframe */}
          <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border bg-white shadow-popover">
            <div className="flex items-center justify-between border-b border-neutral-100 px-10 py-6">
              <span className="text-lg font-bold">Bäckerei Müller</span>
              <span className="flex gap-6 text-[15px] text-neutral-500">
                <span>Sortiment</span>
                <span>Über uns</span>
                <span>Kontakt</span>
              </span>
            </div>

            <div className="relative px-10 py-20">
              <div className="rounded-xl outline-2 outline-offset-8 outline-accent">
                <span className="absolute -mt-12 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-white">
                  Hero · Überschrift
                </span>
                <h1 className="text-5xl leading-tight font-bold tracking-tight">
                  Frisches Brot, <span className="text-accent">jeden Morgen</span> aus unserer Backstube
                </h1>
              </div>
              <p className="mt-6 max-w-xl text-lg text-neutral-500">
                Seit 1962 backen wir mit Zeit, Handwerk und regionalem Mehl.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-5 px-10 pb-16">
              {["Brote", "Brötchen", "Kuchen"].map((label) => (
                <div
                  key={label}
                  className="flex aspect-[4/3] items-end rounded-xl bg-neutral-100 p-4 text-[15px] font-medium outline-dashed outline-1 outline-transparent hover:outline-accent"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="mx-auto mt-6 flex max-w-4xl justify-center">
            <Button variant="secondary">
              <Plus />
              Block hinzufügen
            </Button>
          </div>
        </div>
      </div>

      {/* Inspector */}
      <aside className="flex w-96 shrink-0 flex-col border-l border-border bg-surface">
        <div className="flex h-16 items-center border-b border-border px-6">
          <h2 className="text-lg font-semibold">Hero</h2>
        </div>
        <div className="flex flex-1 flex-col gap-7 overflow-y-auto p-6">
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

          <Field>
            <Label>Button-Text</Label>
            <Input defaultValue="Zum Sortiment" />
          </Field>

          <Field>
            <Label>Button-Link</Label>
            <Input defaultValue="/sortiment" />
            <Description>Interne Seite oder vollständige URL.</Description>
          </Field>
        </div>
        <div className="flex gap-3 border-t border-border p-6">
          <Button variant="secondary" className="flex-1">
            Verwerfen
          </Button>
          <Button className="flex-1">Speichern</Button>
        </div>
      </aside>
    </div>
  );
}

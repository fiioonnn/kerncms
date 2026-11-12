import { Check, MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static SVG logo
  return <img src="/logo.svg" alt="kerncms" width={254} height={58} className={cn("dark:invert", className)} />;
}

/** Stylised preview of editing a page, drawn with markup so it stays crisp and light. */
function EditorIllustration() {
  return (
    <div aria-hidden className="relative w-full max-w-[520px] select-none">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-popover">
        {/* Browser bar */}
        <div className="flex h-10 items-center gap-2 border-b border-border bg-subtle/70 px-4">
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="ml-3 h-6 flex-1 rounded-md bg-surface px-3 text-[11px] leading-6 text-muted">baeckerei-mueller.de</span>
        </div>
        {/* Page */}
        <div className="flex flex-col gap-9 p-7">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Bäckerei Müller</span>
            <span className="flex gap-3 text-[11px] text-muted">
              <span>Sortiment</span>
              <span>Über uns</span>
              <span>Kontakt</span>
            </span>
          </div>
          <div className="relative rounded-xl outline-2 outline-offset-4 outline-accent">
            <span className="absolute -top-[30px] -left-1 rounded-t-md rounded-br-md bg-accent px-2 py-1 text-[11px] font-semibold text-white">Hero</span>
            <p className="text-[26px] leading-tight font-semibold tracking-tight">
              Frisches Brot,{" "}
              <span className="rounded bg-warning-soft px-1 box-decoration-clone">jeden Morgen</span> aus unserer Backstube
              <span className="ml-0.5 inline-block h-7 w-0.5 translate-y-1 animate-pulse bg-accent" />
            </p>
            <p className="mt-3 text-[13px] text-muted">Seit 1962 backen wir mit Zeit, Handwerk und regionalem Mehl.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {["#e8c9a0", "#d9a86c", "#c98f55"].map((color) => (
              <div key={color} className="aspect-[4/3] rounded-lg" style={{ background: `linear-gradient(135deg, ${color}, #f3e3cc)` }} />
            ))}
          </div>
        </div>
      </div>
      {/* Floating bits */}
      <MousePointer2 className="absolute top-[46%] left-[58%] size-6 fill-foreground text-surface drop-shadow" strokeWidth={1.5} />
      <div className="absolute -right-4 -bottom-5 flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 shadow-popover sm:-right-8">
        <span className="flex size-7 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-4" strokeWidth={2.5} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold">Veröffentlicht</span>
          <span className="text-[11px] text-muted">Startseite · gerade eben</span>
        </span>
      </div>
      <div className="absolute -top-16 -left-4 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-popover sm:-left-8">
        <span className="text-[11px] font-medium text-muted">Markierung</span>
        <span className="rounded-md bg-subtle px-2 py-1 text-[11px] font-medium text-accent">Akzent</span>
        <span className="rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white">Marker</span>
      </div>
    </div>
  );
}

const points = [
  "Texte und Bilder direkt auf der Seite ändern",
  "Jede Änderung als Version gesichert, alles umkehrbar",
  "Veröffentlichen mit einem Klick",
];

export function AuthShell({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12 lg:px-16">
        <Logo className="h-9 w-auto self-start" />
        <div className="flex flex-1 items-center py-12">
          <div className="mx-auto flex w-full max-w-[420px] flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-[32px] leading-tight font-semibold tracking-tight">{title}</h1>
              {description && <p className="text-base text-muted">{description}</p>}
            </div>
            {children}
          </div>
        </div>
        <p className="text-sm text-muted">Inhalte bleiben in deinem Git-Repository. Keine Passwörter, keine Tracking-Cookies.</p>
      </div>

      <div className="relative hidden overflow-hidden border-l border-border bg-accent-soft/60 lg:flex lg:flex-col lg:items-center lg:justify-center lg:gap-14 lg:px-16">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgb(47 91 234 / 0.14) 1px, transparent 0)", backgroundSize: "22px 22px" }}
        />
        <div className="relative flex w-full max-w-[520px] flex-col gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Deine Website, so einfach wie ein Dokument.</h2>
          <ul className="flex flex-col gap-2">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-2.5 text-[15px] text-foreground/80">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mt-6 w-full max-w-[520px]">
          <EditorIllustration />
        </div>
      </div>
    </div>
  );
}

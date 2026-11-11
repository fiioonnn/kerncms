import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Compass className="size-8" strokeWidth={1.75} />
      </span>
      <div className="flex max-w-md flex-col gap-2">
        <span className="text-sm font-semibold tracking-wider text-muted uppercase">Fehler 404</span>
        <h1 className="text-3xl font-semibold tracking-tight">Seite nicht gefunden</h1>
        <p className="text-base text-muted">
          Diese Adresse gibt es im CMS nicht. Vielleicht wurde die Seite verschoben oder der Link ist veraltet.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/" className={buttonStyles()}>
          <ArrowLeft />
          Zur Übersicht
        </Link>
        <Link href="/pages" className={buttonStyles({ variant: "secondary" })}>
          Alle Seiten
        </Link>
      </div>
    </div>
  );
}

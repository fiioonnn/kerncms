"use client";

import { useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approve, deny, type AuthorizeRequest } from "./actions";

export function ConsentForm({ app, host, request }: { app: string; host: string; request: AuthorizeRequest }) {
  const [pending, startTransition] = useTransition();
  const can = [
    "deine Websites und deine Rolle darin sehen",
    "Konfiguration, Seiten, Einträge und globale Inhalte lesen",
    "die kerncms-Anleitung zum Bauen von Astro-Seiten abrufen",
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <p className="text-[15px] font-medium">{app} darf dann:</p>
        <ul className="flex flex-col gap-2">
          {can.map((item) => (
            <li key={item} className="flex gap-2.5 text-[15px] text-muted">
              <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2.25} />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          Nichts wird veröffentlicht oder geändert. Du kannst den Zugriff jederzeit unter Profil → Verbundene Apps entfernen.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button className="flex-1" disabled={pending} onClick={() => startTransition(() => approve(request))}>
          {pending && <Loader2 className="animate-spin" />}
          Erlauben
        </Button>
        <Button variant="secondary" className="flex-1" disabled={pending} onClick={() => startTransition(() => deny(request))}>
          Ablehnen
        </Button>
      </div>
      <p className="text-sm text-muted">Danach geht es zurück zu {host}.</p>
    </div>
  );
}

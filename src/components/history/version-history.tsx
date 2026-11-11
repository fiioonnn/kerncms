"use client";

import { useState } from "react";
import { GitCommitHorizontal, RotateCcw } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Avatar, Badge } from "@/components/ui/display";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type Change = { field: string; before?: string; after?: string };
export type Version = {
  id: string;
  message: string;
  author: string;
  when: string;
  scope: string;
  published?: boolean;
  changes: Change[];
};

export const versions: Version[] = [
  {
    id: "a3f9c21",
    message: "Hero-Überschrift geändert",
    author: "Anna Schmidt",
    when: "Heute, 09:42",
    scope: "Startseite",
    changes: [
      {
        field: "Hero · Überschrift",
        before: "Frisches Brot aus unserer Backstube",
        after: "Frisches Brot, jeden Morgen aus unserer Backstube",
      },
      { field: "Hero · Stil „jeden Morgen“", before: undefined, after: "Akzent" },
    ],
  },
  {
    id: "7be20d4",
    message: "Neuer Beitrag „Neue Sauerteigbrote ab Mai“",
    author: "Anna Schmidt",
    when: "Heute, 07:55",
    scope: "Beiträge",
    changes: [
      { field: "Titel", after: "Neue Sauerteigbrote ab Mai" },
      { field: "Teaser", after: "Ab Mai gibt es drei neue Sauerteigbrote mit langer Teigführung." },
    ],
  },
  {
    id: "c41e8a0",
    message: "Menüpunkt „Online bestellen“ hinzugefügt",
    author: "Jonas Weber",
    when: "Gestern, 16:20",
    scope: "Navigation",
    changes: [{ field: "Menüpunkt 6", after: "Online bestellen → bestellen.baeckerei-mueller.de" }],
  },
  {
    id: "9d03b77",
    message: "Veröffentlicht",
    author: "Anna Schmidt",
    when: "8. Nov., 09:14",
    scope: "Startseite",
    published: true,
    changes: [
      { field: "Hero · Text", before: "Seit 1962 backen wir.", after: "Seit 1962 backen wir mit Zeit, Handwerk und regionalem Mehl." },
      { field: "Hero · Button-Link", before: "/produkte", after: "/sortiment" },
    ],
  },
  {
    id: "2f6aa18",
    message: "Öffnungszeiten für Feiertage ergänzt",
    author: "Lena Hoffmann",
    when: "5. Nov., 11:02",
    scope: "Öffnungszeiten",
    published: true,
    changes: [{ field: "Feiertage", before: "geschlossen", after: "7:00 bis 12:00 Uhr" }],
  },
];

export function Diff({ change }: { change: Change }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-subtle/60 px-4 py-2 text-sm font-medium">{change.field}</div>
      <div className="flex flex-col font-mono text-sm">
        {change.before !== undefined && (
          <div className="flex gap-3 bg-danger-soft px-4 py-2.5 text-danger">
            <span className="select-none">−</span>
            <span className="line-through decoration-danger/40">{change.before}</span>
          </div>
        )}
        {change.after !== undefined && (
          <div className="flex gap-3 bg-success-soft px-4 py-2.5 text-success">
            <span className="select-none">+</span>
            <span>{change.after}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** List of versions on the left, the selected version's changes on the right. */
export function VersionHistory({ scope, className }: { scope?: string; className?: string }) {
  const list = scope ? versions.filter((v) => v.scope === scope) : versions;
  const [selectedId, setSelectedId] = useState(list[0]?.id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const selected = list.find((v) => v.id === selectedId) ?? list[0];

  if (!selected) return <p className="p-8 text-center text-muted">Noch keine Änderungen.</p>;

  return (
    <div className={cn("grid min-h-0 md:grid-cols-[320px_1fr]", className)}>
      <ol className="flex flex-col gap-1 overflow-y-auto border-border p-2 md:border-r">
        {list.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => setSelectedId(v.id)}
              className={cn(
                "flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                v.id === selected.id ? "bg-accent-soft" : "hover:bg-subtle",
              )}
            >
              <Avatar name={v.author} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn("truncate text-[15px] font-medium", v.id === selected.id && "text-accent")}>{v.message}</span>
                <span className="truncate text-sm text-muted">
                  {v.scope} · {v.when}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="flex min-w-0 flex-col gap-5 overflow-y-auto p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold tracking-tight">{selected.message}</h3>
              {selected.published ? (
                <Badge tone="success" dot>
                  Veröffentlicht
                </Badge>
              ) : (
                <Badge tone="warning" dot>
                  Entwurf
                </Badge>
              )}
            </div>
            <span className="flex items-center gap-2 text-sm text-muted">
              {selected.author} · {selected.when}
              <GitCommitHorizontal className="size-4" />
              <code className="font-mono">{selected.id}</code>
            </span>
          </div>
          <button
            type="button"
            className={buttonStyles({ variant: "secondary", size: "sm" })}
            onClick={() => setConfirmOpen(true)}
          >
            <RotateCcw />
            Diese Version wiederherstellen
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {selected.changes.map((change) => (
            <Diff key={change.field} change={change} />
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Version wiederherstellen?"
        description={`„${selected.scope}“ wird auf den Stand vom ${selected.when} zurückgesetzt. Das wird als neue Änderung im Entwurf gespeichert, nichts geht verloren.`}
        confirmLabel="Wiederherstellen"
        onConfirm={() => toast.success("Version wiederhergestellt", { description: "Die Änderung liegt im Entwurf." })}
      />
    </div>
  );
}

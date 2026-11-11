"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Image as ImageIcon, LayoutPanelTop, Layers, RotateCcw, Trash2, type LucideIcon } from "lucide-react";
import { useCan } from "@/components/kern/kern-provider";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Avatar, Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { deleteFromTrash, emptyTrash, restoreFromTrash } from "@/server/actions/site";

const RETENTION_DAYS = 30;

const icons: Record<TrashRow["kind"], LucideIcon> = { page: LayoutPanelTop, media: ImageIcon, entry: Layers };

export type TrashRow = {
  id: string;
  kind: "page" | "entry" | "media";
  kindLabel: string;
  label: string;
  url: string | null;
  path: string;
  deletedBy: string | null;
  deletedAt: string;
  expiresAt: string;
  daysLeft: number;
};

function DaysLeft({ days, date }: { days: number; date: string }) {
  const tone = days <= 3 ? "danger" : days <= 10 ? "warning" : "neutral";
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone={tone}>{days === 0 ? "Heute" : days === 1 ? "Noch 1 Tag" : `Noch ${days} Tage`}</Badge>
      <span className="text-sm text-muted">{date}</span>
    </span>
  );
}

export function TrashView({ items }: { items: TrashRow[] }) {
  const canRestore = useCan("editor");
  const canDelete = useCan("admin");
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<TrashRow | null>(null);
  const [busy, startTransition] = useTransition();

  function act(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, description?: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) return void toast.error("Das hat nicht geklappt", { description: result.error });
      toast.success(success, description ? { description } : undefined);
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Papierkorb"
        description={`Gelöschte Inhalte bleiben ${RETENTION_DAYS} Tage hier und lassen sich bis dahin wiederherstellen.`}
        actions={
          canDelete &&
          items.length > 0 && (
            <ConfirmDialog
              trigger={
                <>
                  <Trash2 />
                  Papierkorb leeren
                </>
              }
              triggerClassName={buttonStyles({ variant: "secondary", className: "text-danger hover:bg-danger-soft" })}
              title="Papierkorb leeren?"
              description={`${items.length === 1 ? "Das Element wird" : `Alle ${items.length} Elemente werden`} endgültig gelöscht. Das lässt sich nicht rückgängig machen.`}
              confirmLabel="Endgültig löschen"
              danger
              onConfirm={() => act(emptyTrash, "Papierkorb geleert", `${items.length} ${items.length === 1 ? "Element" : "Elemente"} endgültig gelöscht.`)}
            />
          )
        }
      />

      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={Trash2}
            title="Der Papierkorb ist leer"
            description="Wenn du Seiten, Einträge oder Medien löschst, landen sie zuerst hier."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Pfad</Th>
                <Th>Gelöscht</Th>
                <Th>Läuft ab</Th>
                <Th className="w-0 pr-3 pl-0" aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const Icon = icons[item.kind];
                return (
                  <tr key={item.id} className="transition-colors hover:bg-subtle/50">
                    <Td>
                      <span className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-muted">
                          <Icon className="size-[18px]" strokeWidth={1.75} />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-base font-medium">{item.label}</span>
                          <span className="truncate text-sm text-muted">{item.kindLabel}</span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <span className="flex min-w-0 flex-col">
                        {item.url && <span className="font-mono text-sm">{item.url}</span>}
                        <span className="truncate font-mono text-sm text-muted">{item.path}</span>
                      </span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-3 whitespace-nowrap">
                        {item.deletedBy && <Avatar name={item.deletedBy} size="sm" />}
                        <span className="flex flex-col leading-tight">
                          <span>{item.deletedBy ?? "Unbekannt"}</span>
                          <span className="text-sm text-muted">{item.deletedAt}</span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <DaysLeft days={item.daysLeft} date={item.expiresAt} />
                    </Td>
                    <Td className="w-0 pr-3 pl-0">
                      <div className="flex items-center justify-end gap-1">
                        {canRestore && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              act(
                                () => restoreFromTrash(item.id),
                                `„${item.label}“ wiederhergestellt`,
                                "Der Inhalt ist wieder an seinem ursprünglichen Ort und liegt im Entwurf.",
                              )
                            }
                          >
                            <RotateCcw strokeWidth={1.75} />
                            Wiederherstellen
                          </Button>
                        )}
                        {canDelete && (
                          <Tooltip label="Endgültig löschen">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={busy}
                              aria-label={`„${item.label}“ endgültig löschen`}
                              className="text-muted hover:bg-danger-soft hover:text-danger"
                              onClick={() => setPendingDelete(item)}
                            >
                              <Trash2 strokeWidth={1.75} />
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`„${pendingDelete?.label ?? ""}“ endgültig löschen?`}
        description="Das lässt sich nicht rückgängig machen."
        confirmLabel="Endgültig löschen"
        danger
        onConfirm={() => {
          const item = pendingDelete;
          if (item) act(() => deleteFromTrash([item.id]), `„${item.label}“ endgültig gelöscht`);
        }}
      />
    </>
  );
}

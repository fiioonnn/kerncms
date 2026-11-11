"use client";

import { useState } from "react";
import { FileText, Image as ImageIcon, LayoutPanelTop, Layers, RotateCcw, Trash2, type LucideIcon } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Avatar, Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Kind = "page" | "post" | "media" | "entry";

const kinds: Record<Kind, { label: string; icon: LucideIcon }> = {
  page: { label: "Seite", icon: LayoutPanelTop },
  post: { label: "Beitrag", icon: FileText },
  media: { label: "Medium", icon: ImageIcon },
  entry: { label: "Eintrag", icon: Layers },
};

type TrashItem = {
  id: string;
  name: string;
  kind: Kind;
  detail: string;
  deletedBy: string;
  deletedAt: string;
  /** Days since deletion; items are removed for good after 30 days. */
  age: number;
};

const RETENTION_DAYS = 30;

const initialItems: TrashItem[] = [
  { id: "t1", name: "Sommeraktion 2026", kind: "page", detail: "/sommeraktion", deletedBy: "Anna Schmidt", deletedAt: "Heute, 09:12", age: 0 },
  { id: "t2", name: "Neue Öffnungszeiten im August", kind: "post", detail: "Neuigkeiten", deletedBy: "Jonas Weber", deletedAt: "6. Nov.", age: 5 },
  { id: "t3", name: "brot-alt-2019.jpg", kind: "media", detail: "1,1 MB", deletedBy: "Lena Hoffmann", deletedAt: "28. Okt.", age: 14 },
  { id: "t4", name: "Osterzopf", kind: "entry", detail: "Rezepte", deletedBy: "Anna Schmidt", deletedAt: "20. Okt.", age: 22 },
  { id: "t5", name: "Tag der offenen Backstube", kind: "entry", detail: "Events", deletedBy: "Jonas Weber", deletedAt: "15. Okt.", age: 27 },
];

function DaysLeft({ age }: { age: number }) {
  const left = Math.max(RETENTION_DAYS - age, 0);
  const tone = left <= 3 ? "danger" : left <= 10 ? "warning" : "neutral";
  return (
    <Badge tone={tone}>
      {left === 1 ? "Noch 1 Tag" : `Noch ${left} Tage`}
    </Badge>
  );
}

export default function TrashPage() {
  const [items, setItems] = useState(initialItems);
  const [pendingDelete, setPendingDelete] = useState<TrashItem | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function remove(id: string) {
    setItems((list) => list.filter((item) => item.id !== id));
  }

  return (
    <PageContainer>
      <PageHeader
        title="Papierkorb"
        description={`Gelöschte Inhalte bleiben ${RETENTION_DAYS} Tage hier und lassen sich bis dahin wiederherstellen.`}
        actions={
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
              description={`Alle ${items.length} Elemente werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.`}
              confirmLabel="Endgültig löschen"
              danger
              onConfirm={() => {
                const count = items.length;
                setItems([]);
                toast.success("Papierkorb geleert", { description: `${count} Elemente endgültig gelöscht.` });
              }}
            />
          )
        }
      />

      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={Trash2}
            title="Der Papierkorb ist leer"
            description="Wenn du Seiten, Beiträge, Medien oder Einträge löschst, landen sie zuerst hier."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Typ</Th>
                <Th>Gelöscht von</Th>
                <Th>Gelöscht am</Th>
                <Th>Endgültige Löschung</Th>
                <Th className="w-0" aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const { label, icon: Icon } = kinds[item.kind];
                return (
                  <tr key={item.id} className="transition-colors hover:bg-subtle/50">
                    <Td>
                      <span className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-muted">
                          <Icon className="size-[18px]" strokeWidth={1.75} />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-base font-medium">{item.name}</span>
                          <span className={cn("truncate text-sm text-muted", item.kind === "page" && "font-mono")}>
                            {item.detail}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td className="text-muted">{label}</Td>
                    <Td>
                      <span className="flex items-center gap-3 whitespace-nowrap">
                        <Avatar name={item.deletedBy} size="sm" />
                        {item.deletedBy}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-muted">{item.deletedAt}</Td>
                    <Td>
                      <DaysLeft age={item.age} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            remove(item.id);
                            toast.success(`„${item.name}“ wiederhergestellt`, {
                              description: "Der Inhalt ist wieder an seinem ursprünglichen Ort.",
                            });
                          }}
                        >
                          <RotateCcw strokeWidth={1.75} />
                          Wiederherstellen
                        </Button>
                        <Tooltip label="Endgültig löschen">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`„${item.name}“ endgültig löschen`}
                            className="text-muted hover:bg-danger-soft hover:text-danger"
                            onClick={() => {
                              setPendingDelete(item);
                              setConfirmOpen(true);
                            }}
                          >
                            <Trash2 strokeWidth={1.75} />
                          </Button>
                        </Tooltip>
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
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`„${pendingDelete?.name ?? ""}“ endgültig löschen?`}
        description="Das lässt sich nicht rückgängig machen."
        confirmLabel="Endgültig löschen"
        danger
        onConfirm={() => {
          if (!pendingDelete) return;
          remove(pendingDelete.id);
          toast.success(`„${pendingDelete.name}“ endgültig gelöscht`);
        }}
      />
    </PageContainer>
  );
}

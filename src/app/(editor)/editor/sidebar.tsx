"use client";

import { useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { ChevronRight, Trash2, X } from "lucide-react";
import { FieldInput } from "@/components/kern/field-renderer";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import type { BlockData, BlockDef, FieldDef, MarkDef, PageData, PageSeo } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { AddBlockDialog } from "./add-block-dialog";
import { BlockOutline } from "./block-outline";
import { useResizableWidth } from "./use-resizable-width";

export type SidebarTab = "properties" | "blocks" | "page";

const pageFields: FieldDef[] = [
  { name: "title", type: "text", label: "Titel", required: true },
  { name: "path", type: "text", label: "Pfad", description: "Adresse der Seite, z. B. /ueber-uns." },
];

const seoFields: FieldDef[] = [
  { name: "title", type: "text", label: "Titel für Suchmaschinen", description: "Leer lassen, um den Seitentitel zu verwenden." },
  { name: "description", type: "textarea", label: "Beschreibung", description: "Erscheint in Suchergebnissen unter dem Titel." },
  { name: "image", type: "image", label: "Vorschaubild", description: "Wird beim Teilen in sozialen Netzwerken angezeigt." },
  { name: "noindex", type: "boolean", label: "Nicht in Suchmaschinen anzeigen" },
];

export function EditorSidebar({
  tab,
  onTabChange,
  page,
  defs,
  blockDefs,
  marks,
  selected,
  revision,
  fieldRevs,
  canEdit,
  onSelect,
  onOpen,
  onFieldChange,
  onPageChange,
  onSeoChange,
  onAdd,
  onMove,
  onDuplicate,
  onRemove,
  drawer = false,
}: {
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  page: PageData;
  defs: Map<string, BlockDef>;
  blockDefs: BlockDef[];
  marks: MarkDef[];
  selected: BlockData | undefined;
  /** Bumped on undo/redo/discard so the fields remount with the restored values. */
  revision: number;
  /** Per-field remount counters (`blockId:field`), bumped when the preview changed a rich field. */
  fieldRevs: Record<string, number>;
  canEdit: boolean;
  onSelect: (id: string) => void;
  /** Select and show its properties. */
  onOpen: (id: string) => void;
  onFieldChange: (blockId: string, field: string, value: unknown) => void;
  onPageChange: (field: "title" | "path", value: string) => void;
  onSeoChange: (field: keyof PageSeo, value: unknown) => void;
  onAdd: (def: BlockDef) => void;
  onMove: (id: string, toIndex: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  /** Rendered inside the slide-over panel on small screens. */
  drawer?: boolean;
}) {
  // The target is kept after closing so the dialog text stays put during its exit animation.
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<BlockData | null>(null);
  const resize = useResizableWidth();
  const label = (block: BlockData | null | undefined) => (block ? (defs.get(block.type)?.label ?? block.type) : "");
  const askRemove = (block: BlockData | undefined) => {
    if (!block) return;
    setPendingRemove(block);
    setRemoveOpen(true);
  };

  const blocks = page.blocks;
  const def = selected ? defs.get(selected.type) : undefined;
  const Root = drawer ? "div" : "aside";

  return (
    <Root
      className={cn("relative flex flex-col bg-surface", drawer ? "min-h-0 flex-1" : "shrink-0 border-r border-border")}
      style={drawer ? undefined : { width: resize.width }}
    >
      {!drawer && (
        <>
          {/* Drag handle on the right edge; double-click resets the width. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Seitenleiste verbreitern"
            aria-valuenow={resize.width}
            aria-valuemin={resize.min}
            aria-valuemax={resize.max}
            tabIndex={0}
            onPointerDown={resize.startDrag}
            onKeyDown={resize.onKeyDown}
            onDoubleClick={resize.reset}
            className="group absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize outline-none"
          >
            <span
              className={cn(
                "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors",
                resize.dragging ? "bg-accent" : "bg-transparent group-hover:bg-accent/50 group-focus-visible:bg-accent",
              )}
            />
          </div>
          {/* While dragging, the preview iframe must not swallow pointer events. */}
          {resize.dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
        </>
      )}
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as SidebarTab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className={cn("px-4", drawer && "pr-16")}>
          <Tab value="properties">Eigenschaften</Tab>
          <Tab value="blocks">
            Blöcke
            <span className="rounded-full bg-subtle px-2 text-xs leading-5 font-semibold text-muted">{blocks.length}</span>
          </Tab>
          <Tab value="page">Seite</Tab>
        </TabsList>

        <TabPanel value="properties" className="flex min-h-0 flex-1 flex-col pt-0">
          {selected ? (
            <>
              <div className="flex flex-col gap-1 border-b border-border px-6 py-5">
                <span className="flex items-center gap-1.5 text-sm text-muted">
                  <span className="truncate">{page.title || "Seite"}</span>
                  <ChevronRight className="size-3.5 shrink-0" />
                  <span className="shrink-0">
                    Block {blocks.indexOf(selected) + 1} von {blocks.length}
                  </span>
                </span>
                <h2 className="text-xl font-semibold tracking-tight">{label(selected)}</h2>
              </div>

              <div key={`${selected.id}-${revision}`} className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
                {def ? (
                  def.fields
                    .filter((f) => f.type !== "blocks")
                    .map((field) => (
                      <FieldInput
                        key={`${field.name}-${fieldRevs[`${selected.id}:${field.name}`] ?? 0}`}
                        field={field}
                        value={selected[field.name]}
                        onChange={(value) => onFieldChange(selected.id, field.name, value)}
                        marks={marks}
                        compact
                      />
                    ))
                ) : (
                  <p className="text-[15px] text-muted">
                    Den Blocktyp „{selected.type}“ gibt es nicht in der kern.config.yaml. Er kann hier nicht bearbeitet werden.
                  </p>
                )}
              </div>

              {canEdit && (
                <div className="border-t border-border p-4">
                  <Button variant="ghost" className="w-full text-danger hover:bg-danger-soft" onClick={() => askRemove(selected)}>
                    <Trash2 />
                    Block entfernen
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
              <span className="text-base font-medium">Kein Block ausgewählt</span>
              <span className="text-[15px] text-muted">Wähle einen Block in der Vorschau oder füge einen neuen hinzu.</span>
            </div>
          )}
        </TabPanel>

        <TabPanel value="blocks" className="flex min-h-0 flex-1 flex-col pt-0">
          <div className="flex-1 overflow-y-auto p-3">
            <BlockOutline
              blocks={blocks}
              defs={defs}
              selectedId={selected?.id ?? null}
              onSelect={onSelect}
              onOpen={onOpen}
              onMove={onMove}
              onDuplicate={onDuplicate}
              onRemove={(id) => askRemove(blocks.find((b) => b.id === id))}
            />
            {blocks.length > 1 && (
              <p className="px-3 pt-3 text-sm text-muted">
                Ziehen oder Alt+Pfeiltasten, um die Reihenfolge zu ändern. Doppelklick öffnet die Eigenschaften.
              </p>
            )}
          </div>
          {canEdit && (
            <div className="border-t border-border p-4">
              <AddBlockDialog blocks={blockDefs} onAdd={onAdd} className="w-full" />
            </div>
          )}
        </TabPanel>

        <TabPanel value="page" className="flex min-h-0 flex-1 flex-col pt-0">
          <div key={revision} className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
            <h2 className="text-lg font-semibold tracking-tight">Seite</h2>
            {pageFields
              .filter((f) => f.name !== "path" || page.path !== "/")
              .map((field) => (
                <FieldInput
                  key={field.name}
                  field={field}
                  value={page[field.name]}
                  onChange={(value) => onPageChange(field.name as "title" | "path", typeof value === "string" ? value : "")}
                  compact
                />
              ))}
            {page.path === "/" && <p className="text-sm text-muted">Das ist die Startseite. Ihr Pfad ist immer „/“.</p>}
            <h2 className="mt-2 border-t border-border pt-6 text-lg font-semibold tracking-tight">Suchmaschinen</h2>
            {seoFields.map((field) => (
              <FieldInput
                key={field.name}
                field={field}
                value={page.seo?.[field.name as keyof PageSeo] ?? (field.type === "boolean" ? false : "")}
                onChange={(value) => onSeoChange(field.name as keyof PageSeo, value)}
                compact
              />
            ))}
            <p className="text-sm text-muted">Gespeichert wird zusammen mit der Seite.</p>
          </div>
        </TabPanel>
      </Tabs>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Block „${label(pendingRemove)}“ entfernen?`}
        description="Der Block verschwindet aus dem Entwurf. Endgültig wird es erst mit „Speichern“."
        confirmLabel="Entfernen"
        danger
        onConfirm={() => {
          if (!pendingRemove) return;
          onRemove(pendingRemove.id);
          toast.success(`Block „${label(pendingRemove)}“ entfernt`);
        }}
      />
    </Root>
  );
}

/** Slide-over for the sidebar below 1024 px, styled like the app's mobile navigation. */
export function SidebarDrawer({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/30 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <BaseDialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-[min(26rem,calc(100vw-2rem))] flex-col bg-surface shadow-popover outline-none transition-transform duration-200 ease-out data-ending-style:-translate-x-full data-starting-style:-translate-x-full">
          <BaseDialog.Title className="sr-only">Eigenschaften und Blöcke</BaseDialog.Title>
          <BaseDialog.Close
            aria-label="Schließen"
            className={buttonStyles({ variant: "ghost", size: "icon", className: "absolute top-1.5 right-2 z-10 size-10" })}
          >
            <X strokeWidth={1.75} />
          </BaseDialog.Close>
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

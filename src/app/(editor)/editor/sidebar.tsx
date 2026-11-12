"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { ArrowLeft, ArrowUpRight, Pencil, Trash2, X } from "lucide-react";
import { useKern } from "@/components/kern/kern-provider";
import { BlockIcon } from "./block-icons";
import { focusGroup } from "./focus-fields";
import { getAt } from "./paths";
import { FieldInput } from "@/components/kern/field-renderer";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/overlay";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import type { BlockData, BlockDef, FieldDef, MarkDef, PageData, PageSeo } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { AddBlockDialog } from "./add-block-dialog";
import { SourceEntries } from "./source-entries";
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
  onOpenGlobal,
  focusPath,
  onFocusPathChange,
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
  /** Opens a global in the editor's dialog. */
  onOpenGlobal: (key: string) => void;
  /** Path of the element clicked in the preview (e.g. "buttonLabel", "tiles.0.title"), or null for the whole block. */
  focusPath: string | null;
  onFocusPathChange: (path: string | null) => void;
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
  const focus = def && selected && focusPath ? focusGroup(def.fields, selected, focusPath) : null;
  const { config } = useKern();
  const sourceCollection = def?.source?.kind === "collection" ? config.collections.find((c) => c.key === def.source!.key) : undefined;
  const focusRef = useRef<HTMLDivElement>(null);
  // Put the cursor into the first field of what was clicked in the preview.
  useEffect(() => {
    if (!focusPath) return;
    // The clicked field (a tile's title) if it is shown, otherwise the first one.
    const root = focusRef.current;
    const target = root?.querySelector<HTMLElement>(`[data-focus-path="${CSS.escape(focusPath)}"]`) ?? root;
    const el = target?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, [contenteditable=true], button");
    el?.focus({ preventScroll: true });
  }, [focusPath, selected?.id]);
  // Tabs share the width so all three stay visible in a narrow sidebar.
  const tabClass = "min-w-0 flex-1 justify-center px-2";
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
        <TabsList className={cn("px-2", drawer && "pr-14")}>
          <Tab value="properties" className={tabClass}>
            Eigenschaften
          </Tab>
          <Tab value="blocks" className={tabClass}>
            Blöcke
            <span className="rounded-full bg-subtle px-2 text-xs leading-5 font-semibold text-muted">{blocks.length}</span>
          </Tab>
          <Tab value="page" className={tabClass}>
            Seite
          </Tab>
        </TabsList>

        <TabPanel value="properties" className="flex min-h-0 flex-1 flex-col pt-0">
          {selected ? (
            <>
              <div className="flex items-center gap-2 border-b border-border py-3 pr-6 pl-3">
                <Tooltip label="Alle Blöcke">
                  <Button variant="ghost" size="icon" className="size-9 shrink-0 rounded-lg" aria-label="Alle Blöcke" onClick={() => onTabChange("blocks")}>
                    <ArrowLeft className="size-4" />
                  </Button>
                </Tooltip>
                <h2 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{label(selected)}</h2>
                <span className="shrink-0 text-sm text-muted tabular-nums">
                  {blocks.indexOf(selected) + 1} von {blocks.length}
                </span>
              </div>

              {focus ? (
                /* Only what was clicked in the preview: e.g. a button's text and link. */
                <div key={`${selected.id}-${revision}-${focusPath}`} ref={focusRef} className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold tracking-wider text-accent uppercase">Ausgewählt</span>
                    <h3 className="text-lg font-semibold tracking-tight">{focus.title}</h3>
                    {focus.context && <span className="truncate text-sm text-muted">{focus.context}</span>}
                  </div>
                  {focus.fields.map(({ def: field, path }) => (
                    <div key={`${path}-${fieldRevs[`${selected.id}:${path.split(".")[0]}`] ?? 0}`} data-focus-path={path} className="contents">
                      <FieldInput
                        field={field}
                        value={getAt(selected, path)}
                        onChange={(value) => onFieldChange(selected.id, path, value)}
                        marks={marks}
                        compact
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => onFocusPathChange(null)}
                    className="-mx-2 mt-auto flex items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-sm font-medium text-muted transition-colors outline-none hover:bg-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Alle Felder von „{label(selected)}“ anzeigen
                  </button>
                </div>
              ) : (
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
                  ) : null}
                  {def?.source?.kind === "collection" && sourceCollection ? (
                    <SourceEntries
                      collection={sourceCollection}
                      value={selected.entries}
                      onChange={(value) => onFieldChange(selected.id, "entries", value)}
                      canEdit={canEdit}
                    />
                  ) : (
                    def?.source && <SourceCard source={def.source} onOpenGlobal={onOpenGlobal} />
                  )}
                  {!def && (
                    <p className="text-[15px] text-muted">
                      Den Blocktyp „{selected.type}“ gibt es nicht in der kern.config.yaml. Er kann hier nicht bearbeitet werden.
                    </p>
                  )}
                </div>
              )}

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
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-backdrop/30 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
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

/** For blocks that show entries of a collection or a global: where to edit that content. */
function SourceCard({ source, onOpenGlobal }: { source: NonNullable<BlockDef["source"]>; onOpenGlobal: (key: string) => void }) {
  const { config } = useKern();
  const target = source.kind === "collection" ? config.collections.find((c) => c.key === source.key) : config.globals.find((g) => g.key === source.key);
  if (!target) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-subtle/50 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
          <BlockIcon name={target.icon} className="size-[18px]" strokeWidth={1.75} />
        </span>
        <p className="text-sm leading-relaxed text-muted">
          {source.kind === "collection" ? (
            <>
              Die Einträge kommen aus <span className="font-medium text-foreground">„{target.label}“</span>. Neue Einträge erscheinen hier automatisch.
            </>
          ) : (
            <>
              Der Inhalt kommt aus <span className="font-medium text-foreground">„{target.label}“</span> und gilt für die ganze Website.
            </>
          )}
        </p>
      </div>
      {source.kind === "collection" ? (
        // A full navigation, so the editor can warn about unsaved changes.
        <a href={`/collections/${source.key}`} className={buttonStyles({ variant: "secondary", size: "sm", className: "w-full" })}>
          {target.label} bearbeiten
          <ArrowUpRight />
        </a>
      ) : (
        <Button variant="secondary" size="sm" className="w-full" onClick={() => onOpenGlobal(source.key)}>
          <Pencil />
          {target.label} bearbeiten
        </Button>
      )}
    </div>
  );
}

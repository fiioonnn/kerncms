"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, CheckSquare, Cloud, Copy, Download, Eye, FileText, Film, ImageIcon, Link2, MoreHorizontal, Search, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react";
import { formatBytes, UploadDialog } from "@/components/actions/common";
import { useCan } from "@/components/kern/kern-provider";
import { reloadMedia, uploadMedia, useMedia } from "@/components/kern/use-media";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ImageEditor } from "@/components/media/image-editor";
import { Badge, Card, PageHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { MediaItem } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { deleteMedia, duplicateMedia } from "@/server/actions/media";
import { MediaDetails } from "./media-details";

const typeFilters = [
  { value: "all", label: "Alle Dateitypen" },
  { value: "image", label: "Bilder" },
  { value: "svg", label: "Grafiken (SVG)" },
  { value: "pdf", label: "PDF" },
  { value: "video", label: "Videos" },
];

const usageFilters = [
  { value: "all", label: "Alle" },
  { value: "used", label: "Verwendet" },
  { value: "unused", label: "Unbenutzt" },
];

function matchesType(item: MediaItem, filter: string) {
  if (filter === "all") return true;
  if (filter === "svg") return item.type === "image/svg+xml";
  if (filter === "image") return item.type.startsWith("image/") && item.type !== "image/svg+xml";
  if (filter === "pdf") return item.type === "application/pdf";
  if (filter === "video") return item.type.startsWith("video/");
  return true;
}

/** Thumbnail for any media file; images use the cache-busted src from the list. */
export function MediaThumb({ item, className }: { item: MediaItem; className?: string }) {
  if (item.type === "application/pdf" || item.type.startsWith("video/")) {
    const Icon = item.type.startsWith("video/") ? Film : FileText;
    return (
      <div className={cn("flex items-center justify-center bg-subtle text-muted", className)}>
        <Icon className="size-10" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served from the site's draft checkout
    <img
      src={item.src}
      alt={item.alt}
      loading="lazy"
      draggable={false}
      className={cn("bg-subtle object-cover", item.type === "image/svg+xml" && "bg-white object-contain p-[8%]", className)}
      style={{ objectPosition: `${item.focusX}% ${item.focusY}%` }}
    />
  );
}

export function MediaLibrary() {
  const { items } = useMedia();
  const canEdit = useCan("editor");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [usage, setUsage] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Set when deleting one file from its menu instead of the selection. */
  const [deleteOne, setDeleteOne] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [deleting, startDelete] = useTransition();
  const dragDepth = useRef(0);

  const q = query.trim().toLowerCase();
  const filtered = (items ?? []).filter(
    (item) =>
      matchesType(item, type) &&
      (usage === "all" || (usage === "used" ? item.usedIn.length > 0 : item.usedIn.length === 0)) &&
      (!q ||
        item.name.toLowerCase().includes(q) ||
        item.alt.toLowerCase().includes(q) ||
        item.caption.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))),
  );
  const detailItem = items?.find((i) => i.name === detail) ?? null;
  const deleteTargets = deleteOne ? (items ?? []).filter((i) => i.name === deleteOne) : (items ?? []).filter((i) => selected.has(i.name));
  const selectedInUse = deleteTargets.filter((i) => i.usedIn.length > 0).length;
  const editingItem = items?.find((i) => i.name === editing) ?? null;

  // Drop files anywhere on the page to upload them.
  useEffect(() => {
    if (!canEdit) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e) || document.querySelector('[role="dialog"],[role="alertdialog"]')) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = 0;
      setDragging(false);
      // Already handled by a drop zone (e.g. the upload dialog), or a dialog is open.
      if (e.defaultPrevented || document.querySelector('[role="dialog"],[role="alertdialog"]')) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      setUploading(files.length);
      uploadMedia(files)
        .then((names) => toast.success(names.length === 1 ? `„${names[0]}“ hochgeladen` : `${names.length} Dateien hochgeladen`))
        .catch((err: Error) => toast.error("Hochladen fehlgeschlagen", { description: err.message }))
        .finally(() => setUploading(0));
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [canEdit]);

  function toggle(name: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function duplicate(name: string) {
    startDelete(async () => {
      const result = await duplicateMedia(name);
      if (!result.ok) {
        toast.error("Duplizieren fehlgeschlagen", { description: result.error });
        return;
      }
      await reloadMedia();
      toast.success(`„${result.data.name}“ angelegt`);
    });
  }

  function removeSelected() {
    const names = deleteOne ? [deleteOne] : [...selected];
    const single = Boolean(deleteOne);
    startDelete(async () => {
      const result = await deleteMedia(names);
      if (!result.ok) {
        toast.error("Löschen fehlgeschlagen", { description: result.error });
        return;
      }
      setSelected((s) => (single ? new Set([...s].filter((n) => !names.includes(n))) : new Set()));
      await reloadMedia();
      toast.success(names.length === 1 ? `„${names[0]}“ gelöscht` : `${names.length} Dateien gelöscht`, {
        description: "Im Papierkorb noch 30 Tage wiederherstellbar.",
      });
    });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Medien"
        description="Bilder und Dateien, die du in Seiten und Inhalten verwenden kannst."
        actions={canEdit && <UploadDialog />}
      />

      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" strokeWidth={1.75} />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Medien durchsuchen" placeholder="Name, Alt-Text oder Schlagwort" className="pl-11" />
        </div>
        <Select aria-label="Dateityp" items={typeFilters} value={type} onValueChange={setType} className="w-48" />
        <SegmentedControl label="Verwendung" items={usageFilters} value={usage} onValueChange={setUsage} />
        {items && (
          <span className="ml-auto text-sm text-muted">
            {filtered.length === items.length ? `${items.length} Dateien` : `${filtered.length} von ${items.length} Dateien`}
          </span>
        )}
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        // Floating at the bottom centre of the content area (the sidebar is 18rem wide from lg).
        <div
          role="toolbar"
          aria-label="Auswahl"
          className="fixed bottom-6 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-2 pl-5 shadow-popover lg:left-[calc(50%+9rem)] lg:max-w-[calc(100vw-20rem)]"
        >
          <span className="mr-1 text-[15px] font-medium whitespace-nowrap">{selected.size === 1 ? "1 Datei ausgewählt" : `${selected.size} Dateien ausgewählt`}</span>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(filtered.map((i) => i.name)))}>
            Alle sichtbaren auswählen
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
              <X />
              Auswahl aufheben
            </Button>
            <Button variant="danger" size="sm" disabled={deleting} onClick={() => setConfirmDelete(true)}>
              <Trash2 />
              Löschen
            </Button>
          </div>
        </div>
      )}

      {uploading > 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-[15px] text-accent">
          <UploadCloud className="size-5 animate-pulse" />
          {uploading === 1 ? "1 Datei wird hochgeladen…" : `${uploading} Dateien werden hochgeladen…`}
        </div>
      )}

      {items === null ? (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          {items.length === 0 ? (
            <EmptyState
              icon={ImageIcon}
              title="Noch keine Medien"
              description={canEdit ? "Ziehe Bilder einfach auf diese Seite oder lade sie über den Button hoch." : "Hier erscheinen Bilder, sobald jemand welche hochlädt."}
              action={canEdit && <UploadDialog />}
            />
          ) : (
            <EmptyState icon={Search} title="Keine Treffer" description="Ändere die Suche oder die Filter." />
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => {
            const isSelected = selected.has(item.name);
            const actions = (
              <MediaActions
                item={item}
                canEdit={canEdit}
                selected={isSelected}
                onOpen={() => setDetail(item.name)}
                onEdit={() => setEditing(item.name)}
                onDuplicate={() => duplicate(item.name)}
                onSelect={() => toggle(item.name)}
                onDelete={() => {
                  setDeleteOne(item.name);
                  setConfirmDelete(true);
                }}
              />
            );
            return (
              <ContextMenu key={item.name}>
              <ContextMenuTrigger
                className={cn(
                  // The focus ring sits on the card (outside the image) so it is not cut off.
                  "group relative flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-card transition-shadow hover:shadow-popover has-[[data-card-open]:focus-visible]:border-accent has-[[data-card-open]:focus-visible]:ring-4 has-[[data-card-open]:focus-visible]:ring-accent/30",
                  isSelected ? "border-accent ring-4 ring-accent/20" : "border-border",
                )}
              >
                <button
                  type="button"
                  data-card-open
                  onClick={() => (selected.size > 0 ? toggle(item.name) : setDetail(item.name))}
                  className="flex flex-col text-left outline-none"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden">
                    <MediaThumb item={item} className="size-full transition-transform duration-300 group-hover:scale-105" />
                  </div>
                  <div className="flex flex-col gap-0.5 py-3 pr-12 pl-4">
                    <span className="truncate text-[15px] font-medium">{item.name}</span>
                    <span className="flex items-center gap-2 text-sm text-muted">
                      <span className="truncate">
                        {item.width && item.height ? `${item.width} × ${item.height} · ` : ""}
                        {formatBytes(item.size)}
                      </span>
                      {item.usedIn.length === 0 && <span className="shrink-0 text-xs">· unbenutzt</span>}
                      {item.location !== "repo" && (
                        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs" title={item.location === "s3" ? "Liegt im eigenen S3-Speicher" : "Liegt im kerncms-Speicher"}>
                          <Cloud className="size-3.5" strokeWidth={2} />
                          {item.location === "s3" ? "S3" : "kerncms"}
                        </span>
                      )}
                    </span>
                  </div>
                </button>
                {item.status !== "live" && (
                  <Badge tone="warning" className="pointer-events-none absolute top-3 left-3 h-6 px-2 text-xs">
                    {item.status === "new" ? "Neu" : "Entwurf"}
                  </Badge>
                )}
                {canEdit && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`${item.name} auswählen`}
                    onClick={() => toggle(item.name)}
                    className={cn(
                      "absolute top-3 right-3 flex size-7 items-center justify-center rounded-md border-2 transition-opacity outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent",
                      isSelected
                        ? "border-accent bg-accent text-white opacity-100"
                        : "border-white bg-black/20 text-transparent opacity-0 group-hover:opacity-100",
                      selected.size > 0 && "opacity-100",
                    )}
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </button>
                )}
                {/* Same actions as the right-click menu, for touch and keyboard. */}
                <Menu>
                  <MenuTrigger
                    aria-label={`Aktionen für ${item.name}`}
                    className="absolute right-2 bottom-3 flex size-9 items-center justify-center rounded-lg text-muted transition-colors outline-none hover:bg-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent data-popup-open:bg-subtle"
                  >
                    <MoreHorizontal className="size-5" />
                  </MenuTrigger>
                  <MenuContent>{actions}</MenuContent>
                </Menu>
              </ContextMenuTrigger>
              <ContextMenuContent>{actions}</ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
      )}

      {detailItem && (
        <MediaDetails
          key={detailItem.name + detailItem.updatedAt}
          item={detailItem}
          canEdit={canEdit}
          open={detail !== null}
          onOpenChange={(open) => !open && setDetail(null)}
          onRenamed={(name) => setDetail(name)}
          tagSuggestions={[...new Set((items ?? []).flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b, "de"))}
        />
      )}

      {editingItem && (
        <ImageEditor
          key={editingItem.name + editingItem.updatedAt}
          item={editingItem}
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={() => void reloadMedia()}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          setConfirmDelete(open);
          if (!open) setTimeout(() => setDeleteOne(null), 200);
        }}
        title={deleteTargets.length === 1 ? `„${deleteTargets[0].name}“ löschen?` : `${deleteTargets.length} Dateien löschen?`}
        description={
          selectedInUse > 0
            ? `${selectedInUse === 1 ? "Eine Datei wird" : `${selectedInUse} Dateien werden`} noch verwendet. Diese Stellen zeigen danach kein Bild mehr. Gelöschtes liegt 30 Tage im Papierkorb.`
            : deleteTargets.length === 1
              ? "Die Datei landet im Papierkorb und kann 30 Tage lang wiederhergestellt werden."
              : "Die Dateien landen im Papierkorb und können 30 Tage lang wiederhergestellt werden."
        }
        confirmLabel="Löschen"
        danger
        onConfirm={removeSelected}
      />

      {/* Drop overlay */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-accent/10 p-8 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent bg-surface px-16 py-12 text-accent shadow-popover">
            <UploadCloud className="size-12" strokeWidth={1.5} />
            <span className="text-lg font-semibold">Zum Hochladen loslassen</span>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

const EDITABLE = /\.(jpe?g|png|webp|avif)$/i;

/** Entries of a file's menu (right-click and the ⋯ button). */
function MediaActions({
  item,
  canEdit,
  selected,
  onOpen,
  onEdit,
  onDuplicate,
  onSelect,
  onDelete,
}: {
  item: MediaItem;
  canEdit: boolean;
  selected: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <MenuItem icon={Eye} onClick={onOpen}>
        Details
      </MenuItem>
      {canEdit && EDITABLE.test(item.name) && (
        <MenuItem icon={SlidersHorizontal} onClick={onEdit}>
          Bild bearbeiten
        </MenuItem>
      )}
      {canEdit && (
        <MenuItem icon={Copy} onClick={onDuplicate}>
          Duplizieren
        </MenuItem>
      )}
      <MenuItem
        icon={Link2}
        onClick={() => {
          void navigator.clipboard?.writeText(item.value).then(() => toast.success("Adresse kopiert"));
        }}
      >
        Adresse kopieren
      </MenuItem>
      <MenuItem icon={Download} render={<a href={item.src} download={item.name} />}>
        Herunterladen
      </MenuItem>
      {canEdit && (
        <>
          <MenuItem icon={CheckSquare} onClick={onSelect}>
            {selected ? "Auswahl aufheben" : "Auswählen"}
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={Trash2} danger onClick={onDelete}>
            Löschen
          </MenuItem>
        </>
      )}
    </>
  );
}

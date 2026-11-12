"use client";

import { useState } from "react";
import { ChevronRight, Folder, FolderInput, FolderOpen, Home, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Label } from "@/components/ui/field";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/*
 * Folders in the media library exist only in the CMS: a file keeps its name and address
 * (/media/bild.jpg) wherever it is filed, so moving never breaks the website.
 */

/** Drag payload for files dragged inside the library (not files from the desktop). */
export const DRAG_TYPE = "application/x-kern-media";

export const folderName = (path: string) => path.split("/").at(-1) ?? path;
export const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");

/** Handlers that make an element a drop target for library files and desktop files. */
export function useDropTarget(onFiles: (names: string[]) => void, onUpload?: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  const accepts = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE) || (Boolean(onUpload) && e.dataTransfer.types.includes("Files"));
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_TYPE) ? "move" : "copy";
        if (!over) setOver(true);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        if (!accepts(e)) return;
        // Handled here: the page-wide upload drop must not upload again.
        e.preventDefault();
        const names = e.dataTransfer.getData(DRAG_TYPE);
        if (names) onFiles(JSON.parse(names) as string[]);
        else if (onUpload && e.dataTransfer.files.length) onUpload(Array.from(e.dataTransfer.files));
      },
    },
  };
}

/** "Alle Medien › Team › Portraits"; every step is a drop target. */
export function FolderPath({
  folder,
  onOpen,
  onMove,
  canEdit,
}: {
  folder: string;
  onOpen: (folder: string) => void;
  onMove: (names: string[], folder: string) => void;
  canEdit: boolean;
}) {
  const steps = ["", ...folder.split("/").filter(Boolean).map((_, i, all) => all.slice(0, i + 1).join("/"))];
  return (
    <nav aria-label="Ordnerpfad" className="flex min-w-0 flex-wrap items-center gap-1">
      {steps.map((step, i) => (
        <span key={step || "root"} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRight className="size-4 shrink-0 text-muted" />}
          <PathStep step={step} current={i === steps.length - 1} onOpen={onOpen} onMove={onMove} canEdit={canEdit} />
        </span>
      ))}
    </nav>
  );
}

function PathStep({
  step,
  current,
  onOpen,
  onMove,
  canEdit,
}: {
  step: string;
  current: boolean;
  onOpen: (folder: string) => void;
  onMove: (names: string[], folder: string) => void;
  canEdit: boolean;
}) {
  const drop = useDropTarget((names) => onMove(names, step));
  return (
    <button
      type="button"
      onClick={() => onOpen(step)}
      aria-current={current ? "page" : undefined}
      {...(canEdit && !current ? drop.props : {})}
      className={cn(
        "flex h-9 min-w-0 items-center gap-2 rounded-lg px-2.5 text-[15px] transition-colors outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent",
        current ? "font-semibold text-foreground" : "text-muted hover:text-foreground",
        drop.over && "bg-accent-soft text-accent ring-2 ring-accent",
      )}
    >
      {step === "" && <Home className="size-4 shrink-0" />}
      <span className="truncate">{step === "" ? "Alle Medien" : folderName(step)}</span>
    </button>
  );
}

/** A folder in the grid: open on click, drop files onto it, menu for rename and delete. */
export function FolderTile({
  path,
  count,
  canEdit,
  onOpen,
  onMove,
  onUpload,
  onRename,
  onDelete,
}: {
  path: string;
  count: number;
  canEdit: boolean;
  onOpen: () => void;
  onMove: (names: string[]) => void;
  onUpload: (files: File[]) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const drop = useDropTarget(onMove, onUpload);
  const actions = (
    <>
      <MenuItem icon={FolderOpen} onClick={onOpen}>
        Öffnen
      </MenuItem>
      {canEdit && (
        <>
          <MenuItem icon={Pencil} onClick={onRename}>
            Umbenennen
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={Trash2} danger onClick={onDelete}>
            Ordner auflösen
          </MenuItem>
        </>
      )}
    </>
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger
        {...(canEdit ? drop.props : {})}
        className={cn(
          "group relative flex items-center gap-3 rounded-2xl border bg-surface p-3 pr-12 shadow-card transition-[box-shadow,border-color] hover:shadow-popover has-[[data-folder-open]:focus-visible]:border-accent has-[[data-folder-open]:focus-visible]:ring-4 has-[[data-folder-open]:focus-visible]:ring-accent/30",
          drop.over ? "border-accent bg-accent-soft ring-4 ring-accent/20" : "border-border",
        )}
      >
        <button type="button" data-folder-open onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors",
              drop.over ? "bg-accent text-accent-foreground" : "bg-accent-soft text-accent",
            )}
          >
            {drop.over ? <FolderInput className="size-5" strokeWidth={1.75} /> : <Folder className="size-5" strokeWidth={1.75} />}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-medium">{folderName(path)}</span>
            <span className="text-sm text-muted">{drop.over ? "Hier ablegen" : count === 1 ? "1 Datei" : `${count} Dateien`}</span>
          </span>
        </button>
        <Menu>
          <MenuTrigger
            aria-label={`Aktionen für Ordner ${folderName(path)}`}
            className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors outline-none hover:bg-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent data-popup-open:bg-subtle"
          >
            <MoreHorizontal className="size-5" />
          </MenuTrigger>
          <MenuContent>{actions}</MenuContent>
        </Menu>
      </ContextMenuTrigger>
      <ContextMenuContent>{actions}</ContextMenuContent>
    </ContextMenu>
  );
}

/** Name a new folder or rename one. */
export function FolderNameDialog({
  open,
  onOpenChange,
  title,
  initial,
  parent,
  confirmLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: string;
  /** Shown as "in Team › Portraits". */
  parent: string;
  confirmLabel: string;
  onSubmit: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(initial);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (!name.trim() || pending) return;
    setPending(true);
    const ok = await onSubmit(name.trim().replace(/\//g, "-"));
    setPending(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={parent ? `In „${parent.split("/").join(" › ")}“` : "In „Alle Medien“"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => void submit()} disabled={!name.trim() || pending}>
              {pending && <Loader2 className="animate-spin" />}
              {confirmLabel}
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ROOT = "__root__";

/** Pick the folder for one or more files. */
export function MoveDialog({
  open,
  onOpenChange,
  count,
  folders,
  current,
  onMove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  folders: string[];
  current: string;
  onMove: (folder: string) => Promise<boolean>;
}) {
  const [target, setTarget] = useState(current || ROOT);
  const [pending, setPending] = useState(false);
  const items = [
    { value: ROOT, label: "Alle Medien (oberste Ebene)" },
    ...folders.map((f) => ({ value: f, label: f.split("/").join(" › ") })),
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={count === 1 ? "Datei verschieben" : `${count} Dateien verschieben`}
        description="Die Adresse der Dateien bleibt gleich, auf der Website ändert sich nichts."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const ok = await onMove(target === ROOT ? "" : target);
                setPending(false);
                if (ok) onOpenChange(false);
              }}
            >
              {pending && <Loader2 className="animate-spin" />}
              Verschieben
            </Button>
          </>
        }
      >
        <Select label="Ordner" items={items} value={target} onValueChange={setTarget} />
      </DialogContent>
    </Dialog>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, CopyPlus, Link2, Loader2, MoreHorizontal, Pencil, Trash2, Upload, UploadCloud } from "lucide-react";
import { uploadMedia } from "@/components/kern/use-media";
import { Button, buttonStyles, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";

/* ---------- Row actions: ⋯ menu with edit / duplicate / copy link / delete ---------- */

export function RowActions({
  name,
  editHref,
  path,
  deleteLabel = "Löschen",
}: {
  name: string;
  editHref?: string;
  path?: string;
  deleteLabel?: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <Menu>
        <Tooltip label="Weitere Aktionen">
          <MenuTrigger
            aria-label={`Aktionen für ${name}`}
            className={buttonStyles({ variant: "ghost", size: "icon", className: "data-popup-open:bg-subtle" })}
          >
            <MoreHorizontal />
          </MenuTrigger>
        </Tooltip>
        <MenuContent>
          {editHref && (
            <MenuItem icon={Pencil} render={<Link href={editHref} />}>
              Bearbeiten
            </MenuItem>
          )}
          <MenuItem icon={CopyPlus} onClick={() => toast.success(`„${name}“ dupliziert`)}>
            Duplizieren
          </MenuItem>
          {path && (
            <MenuItem
              icon={Link2}
              onClick={() => {
                void navigator.clipboard?.writeText(path);
                toast.success("Pfad kopiert", { description: path });
              }}
            >
              Pfad kopieren
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem icon={Trash2} danger onClick={() => setConfirmOpen(true)}>
            {deleteLabel}
          </MenuItem>
        </MenuContent>
      </Menu>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`„${name}“ ${deleteLabel.toLowerCase()}?`}
        description="Das lässt sich bis zur nächsten Veröffentlichung noch rückgängig machen."
        confirmLabel={deleteLabel}
        danger
        onConfirm={() => toast.success(`„${name}“ entfernt`)}
      />
    </>
  );
}

/* ---------- Save button with toast ---------- */

export function SaveButton({
  label = "Speichern",
  message = "Gespeichert",
  description = "Die Änderung liegt im Entwurf.",
  variant = "primary",
  size = "md",
  className,
}: {
  label?: string;
  message?: string;
  description?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <Button variant={variant} size={size} className={className} onClick={() => toast.success(message, { description })}>
      {label}
    </Button>
  );
}

/* ---------- Copy to clipboard ---------- */

export function CopyButton({ value, label = "Kopieren" }: { value: string; label?: string }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        toast.success("In die Zwischenablage kopiert");
      }}
    >
      <Copy />
      {label}
    </Button>
  );
}

/* ---------- Upload dialog with drop zone ---------- */

export function UploadDialog({
  trigger,
  triggerClassName = buttonStyles(),
  onUploaded,
  accept = "image/*,.pdf,.svg,.mp4",
}: {
  trigger?: React.ReactNode;
  triggerClassName?: string;
  /** Called with the stored file names after a successful upload. */
  onUploaded?: (names: string[]) => void;
  accept?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    setUploading(true);
    setError(null);
    try {
      const names = await uploadMedia(files);
      toast.success(names.length === 1 ? `„${names[0]}“ hochgeladen` : `${names.length} Dateien hochgeladen`);
      onUploaded?.(names);
      setOpen(false);
      setFiles([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (uploading) return;
        setOpen(next);
        if (!next) {
          setFiles([]);
          setError(null);
        }
      }}
    >
      <DialogTrigger className={triggerClassName}>
        {trigger ?? (
          <>
            <Upload />
            Hochladen
          </>
        )}
      </DialogTrigger>
      <DialogContent
        title="Dateien hochladen"
        description="Bilder, PDFs und SVGs bis 20 MB."
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })} disabled={uploading}>
              Abbrechen
            </DialogClose>
            <Button onClick={upload} disabled={files.length === 0 || uploading}>
              {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
              {uploading ? "Wird hochgeladen…" : files.length > 1 ? `${files.length} Dateien hochladen` : "Hochladen"}
            </Button>
          </>
        }
      >
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            setFiles(Array.from(e.dataTransfer.files));
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15 ${
            dragging ? "border-accent bg-accent-soft text-accent" : "border-border-strong text-muted hover:border-accent hover:text-accent"
          }`}
        >
          <UploadCloud className="size-10" strokeWidth={1.5} />
          <span className="text-base font-medium text-foreground">Dateien hierher ziehen</span>
          <span className="text-[15px]">oder klicken, um sie auszuwählen</span>
          <input
            type="file"
            multiple
            accept={accept}
            className="sr-only"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-[15px] text-danger">
            {error}
          </p>
        )}
        {files.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1">
            {files.map((file) => (
              <li key={file.name} className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2 text-[15px]">
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-sm text-muted">{formatBytes(file.size)}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}

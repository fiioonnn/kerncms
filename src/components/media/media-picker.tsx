"use client";

import { useId, useState } from "react";
import { Check, ImagePlus, Pencil, Search, Upload, X } from "lucide-react";
import { formatBytes, UploadDialog } from "@/components/actions/common";
import { useOptionalKern } from "@/components/kern/kern-provider";
import { mediaItemByName, useMedia } from "@/components/kern/use-media";
import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ImageEditor } from "./image-editor";
import { MediaImage } from "./media-image";

const IMAGE = /\.(jpe?g|png|webp|avif|gif|svg)$/i;

/* ---------- Picker dialog ---------- */

export function MediaPickerDialog({
  open,
  onOpenChange,
  onSelect,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the value to store, e.g. /media/brot.jpg. */
  onSelect: (value: string) => void;
  current?: string;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | undefined>(current);
  const { items } = useMedia();
  const prefix = useOptionalKern()?.mediaPrefix ?? "/media/";
  const q = query.trim().toLowerCase();
  const files = (items ?? []).filter(
    (f) => IMAGE.test(f.name) && (f.name.toLowerCase().includes(q) || f.alt.toLowerCase().includes(q) || f.tags.some((t) => t.toLowerCase().includes(q))),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setSelected(current);
        else setQuery("");
      }}
    >
      <DialogContent
        title="Bild wählen"
        description="Aus der Mediathek wählen oder ein neues Bild hochladen."
        size="xl"
        footer={
          <>
            <UploadDialog
              accept="image/*"
              triggerClassName={buttonStyles({ variant: "ghost", className: "mr-auto" })}
              trigger={
                <>
                  <Upload />
                  Neues Bild hochladen
                </>
              }
              onUploaded={(names) => {
                const item = names[0];
                if (item) setSelected(mediaItemByName(item)?.value ?? prefix + item);
              }}
            />
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <DialogClose className={buttonStyles()} disabled={!selected} onClick={() => selected && onSelect(selected)}>
              Auswählen
            </DialogClose>
          </>
        }
      >
        <label className="mb-5 flex h-11 items-center gap-2.5 rounded-xl border border-border-strong px-3.5 text-muted focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
          <Search className="size-5" strokeWidth={1.75} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Medien durchsuchen"
            placeholder="Dateiname, Alt-Text oder Schlagwort…"
            className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted"
          />
        </label>
        {items === null ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full rounded-xl" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <p className="py-16 text-center text-[15px] text-muted">{q ? "Keine Bilder gefunden" : "Noch keine Bilder hochgeladen"}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {files.map((file) => {
              const isSelected = selected === file.value;
              return (
                <button
                  key={file.name}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelected(file.value)}
                  onDoubleClick={() => {
                    onSelect(file.value);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "relative flex flex-col overflow-hidden rounded-xl border text-left transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    isSelected ? "border-accent ring-4 ring-accent/20" : "border-border hover:shadow-popover",
                  )}
                >
                  <MediaImage value={file.value} alt={file.alt} focusX={file.focusX} focusY={file.focusY} className="aspect-[4/3] w-full" />
                  <span className="flex flex-col px-3 py-2">
                    <span className="truncate text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted">
                      {file.width && file.height ? `${file.width} × ${file.height} · ` : ""}
                      {formatBytes(file.size)}
                    </span>
                  </span>
                  {isSelected && (
                    <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-accent text-white">
                      <Check className="size-4" strokeWidth={3} aria-hidden />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Image field (thumbnail + choose / edit / remove) ---------- */

export function ImageField({
  label,
  description,
  defaultValue,
  value: controlledValue,
  onChange,
  aspect = "aspect-[16/9]",
}: {
  label: string;
  description?: string;
  defaultValue?: string;
  /** Controlled value; the field is controlled whenever `onChange` is passed (undefined = no image). */
  value?: string;
  onChange?: (value: string | undefined) => void;
  aspect?: string;
}) {
  const [innerValue, setInnerValue] = useState<string | undefined>(defaultValue);
  const controlled = onChange !== undefined;
  const value = controlled ? controlledValue : innerValue;
  const setValue = (next: string | undefined) => {
    if (!controlled) setInnerValue(next);
    onChange?.(next);
  };
  const id = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const { items } = useMedia();
  const kern = useOptionalKern();
  const item = items?.find((f) => f.value === value);
  const fileName = value?.split("/").pop() ?? "";

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
      <span id={`${id}-label`} className="text-[15px] font-medium">
        {label}
      </span>
      {value ? (
        <div className="overflow-hidden rounded-xl border border-border-strong">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-label={`Bild ändern: ${fileName}`}
            className={cn("block w-full outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset", aspect)}
          >
            <MediaImage value={value} alt={item?.alt} focusX={item?.focusX} focusY={item?.focusY} className="size-full" />
          </button>
          <div className="flex items-center gap-1 border-t border-border p-1.5 pl-3">
            <span className="min-w-0 flex-1 truncate text-sm">{fileName}</span>
            {item && kern && (
              <Button variant="ghost" size="sm" onClick={() => setEditorOpen(true)}>
                <Pencil />
                Bearbeiten
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setPickerOpen(true)}>
              Ändern
            </Button>
            <Button variant="ghost" size="sm" aria-label="Bild entfernen" onClick={() => setValue(undefined)}>
              <X />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong text-muted transition-colors outline-none hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:ring-4 focus-visible:ring-accent/15",
            aspect,
          )}
        >
          <ImagePlus className="size-7" strokeWidth={1.75} aria-hidden />
          <span className="text-[15px] font-medium">Bild wählen</span>
        </button>
      )}
      {description && <p className="text-sm text-muted">{description}</p>}

      <MediaPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onSelect={setValue} current={value} />
      {item && (
        <ImageEditor
          item={item}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          onSaved={(saved) => saved.value !== value && setValue(saved.value)}
        />
      )}
    </div>
  );
}

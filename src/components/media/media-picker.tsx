"use client";

import { useState } from "react";
import { Check, ImagePlus, Pencil, Search, Upload, X } from "lucide-react";
import { UploadDialog } from "@/components/actions/common";
import { Button, buttonStyles } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { mediaFiles } from "@/lib/example-content";
import { cn } from "@/lib/utils";
import { ImageEditor } from "./image-editor";
import { SampleImage } from "./sample-image";

/* ---------- Picker dialog ---------- */

export function MediaPickerDialog({
  open,
  onOpenChange,
  onSelect,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (name: string) => void;
  current?: string;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | undefined>(current);
  const files = mediaFiles.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()));

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
              triggerClassName={buttonStyles({ variant: "ghost", className: "mr-auto" })}
              trigger={
                <>
                  <Upload />
                  Neues Bild hochladen
                </>
              }
            />
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <DialogClose
              className={buttonStyles()}
              disabled={!selected}
              onClick={() => selected && onSelect(selected)}
            >
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
            placeholder="Dateiname suchen…"
            className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted"
          />
        </label>
        {files.length === 0 ? (
          <p className="py-16 text-center text-[15px] text-muted">Keine Bilder gefunden</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {files.map((file) => {
              const isSelected = selected === file.name;
              return (
                <button
                  key={file.name}
                  type="button"
                  onClick={() => setSelected(file.name)}
                  onDoubleClick={() => {
                    onSelect(file.name);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "relative flex flex-col overflow-hidden rounded-xl border text-left transition-shadow outline-none",
                    isSelected ? "border-accent ring-4 ring-accent/20" : "border-border hover:shadow-popover",
                  )}
                >
                  <SampleImage name={file.name} className="aspect-[4/3] w-full" />
                  <span className="truncate px-3 py-2 text-sm font-medium">{file.name}</span>
                  {isSelected && (
                    <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-accent text-white">
                      <Check className="size-4" strokeWidth={3} />
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const file = mediaFiles.find((f) => f.name === value);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[15px] font-medium">{label}</span>
      {value ? (
        <div className="overflow-hidden rounded-xl border border-border-strong">
          <button type="button" onClick={() => setPickerOpen(true)} className={cn("block w-full", aspect)} aria-label="Bild ändern">
            <SampleImage name={value} className="size-full" />
          </button>
          <div className="flex items-center gap-1 border-t border-border p-1.5 pl-3">
            <span className="min-w-0 flex-1 truncate text-sm">{value}</span>
            <Button variant="ghost" size="sm" onClick={() => setEditorOpen(true)}>
              <Pencil />
              Bearbeiten
            </Button>
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
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong text-muted transition-colors hover:border-accent hover:text-accent",
            aspect,
          )}
        >
          <ImagePlus className="size-7" strokeWidth={1.5} />
          <span className="text-[15px] font-medium">Bild wählen</span>
        </button>
      )}
      {description && <p className="text-sm text-muted">{description}</p>}

      <MediaPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onSelect={setValue} current={value} />
      {value && (
        <ImageEditor name={value} size={file?.size ?? ""} open={editorOpen} onOpenChange={setEditorOpen} />
      )}
    </div>
  );
}

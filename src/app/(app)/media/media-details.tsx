"use client";

import { useState, useTransition } from "react";
import { Crosshair, Link2, Loader2, Pencil, Trash2 } from "lucide-react";
import { formatBytes } from "@/components/actions/common";
import { describeFile } from "@/components/actions/publish";
import { useKern } from "@/components/kern/kern-provider";
import { reloadMedia } from "@/components/kern/use-media";
import { ImageEditor } from "@/components/media/image-editor";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/display";
import { Description, Field, Input, Label, Textarea } from "@/components/ui/field";
import { TagInput } from "@/components/ui/tag-input";
import { toast } from "@/components/ui/toast";
import type { MediaItem } from "@/lib/kern-types";
import { formatWhen } from "@/lib/admin-format";
import { cn } from "@/lib/utils";
import { deleteMedia, saveMediaMeta } from "@/server/actions/media";
import { MediaThumb } from "./media-library";

const EDITABLE = /\.(jpe?g|png|webp|avif)$/i;

export function MediaDetails({
  item,
  canEdit,
  open,
  onOpenChange,
  onRenamed,
  tagSuggestions,
}: {
  item: MediaItem;
  /** Tags used on other files. */
  tagSuggestions: string[];
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After "save as copy": show the new file. */
  onRenamed: (name: string) => void;
}) {
  const kern = useKern();
  const [alt, setAlt] = useState(item.alt);
  const [caption, setCaption] = useState(item.caption);
  const [tags, setTags] = useState(item.tags);
  const [focus, setFocus] = useState({ x: item.focusX, y: item.focusY });
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const isImage = item.type.startsWith("image/");
  const dirty =
    alt !== item.alt || caption !== item.caption || tags.join("|") !== item.tags.join("|") || focus.x !== item.focusX || focus.y !== item.focusY;

  function save() {
    startTransition(async () => {
      const result = await saveMediaMeta(item.name, { alt, caption, tags, focusX: focus.x, focusY: focus.y });
      if (!result.ok) {
        toast.error("Nicht gespeichert", { description: result.error });
        return;
      }
      await reloadMedia();
      toast.success("Gespeichert");
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteMedia([item.name]);
      if (!result.ok) {
        toast.error("Löschen fehlgeschlagen", { description: result.error });
        return;
      }
      onOpenChange(false);
      await reloadMedia();
      toast.success(`„${item.name}“ gelöscht`, { description: "Im Papierkorb noch 30 Tage wiederherstellbar." });
    });
  }

  function pickFocus(e: React.MouseEvent<HTMLDivElement>) {
    if (!canEdit || !isImage) return;
    const box = e.currentTarget.getBoundingClientRect();
    setFocus({
      x: Math.round(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100))),
      y: Math.round(Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100))),
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
        <DialogContent
          title={item.name}
          description={[item.width && item.height ? `${item.width} × ${item.height} px` : null, formatBytes(item.size), `geändert ${formatWhen(item.updatedAt)}`]
            .filter(Boolean)
            .join(" · ")}
          size="xl"
          footer={
            <>
              {canEdit && (
                <Button variant="ghost" className="mr-auto text-danger hover:bg-danger-soft" onClick={() => setConfirmDelete(true)} disabled={pending}>
                  <Trash2 />
                  Löschen
                </Button>
              )}
              {canEdit && EDITABLE.test(item.name) && (
                <Button variant="secondary" onClick={() => setEditorOpen(true)} disabled={pending}>
                  <Pencil />
                  Bild bearbeiten
                </Button>
              )}
              {canEdit ? (
                <Button onClick={save} disabled={!dirty || pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  Speichern
                </Button>
              ) : (
                <DialogClose className={buttonStyles()}>Schließen</DialogClose>
              )}
            </>
          }
        >
          <div className="grid gap-6 md:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-3">
              {isImage ? (
                <div
                  onClick={pickFocus}
                  className={cn("relative overflow-hidden rounded-xl border border-border bg-subtle", canEdit && "cursor-crosshair")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- served from the site's draft checkout */}
                  <img src={item.src} alt={alt} draggable={false} className="max-h-[52vh] w-full object-contain" />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute flex size-9 -translate-1/2 items-center justify-center rounded-full border-2 border-white bg-white/20 shadow-[0_0_0_2px_rgba(0,0,0,0.25)] transition-[left,top] duration-150"
                    style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
                  >
                    <span className="size-2 rounded-full bg-white" />
                  </span>
                </div>
              ) : (
                <MediaThumb item={item} className="aspect-[4/3] w-full rounded-xl border border-border" />
              )}
              {isImage && (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Crosshair className="size-4 shrink-0" />
                  Fokuspunkt {focus.x} % · {focus.y} %.{canEdit && " Klicke ins Bild, um ihn zu setzen. Er bleibt beim Zuschneiden sichtbar."}
                </p>
              )}
              {isImage && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Quadrat", ratio: "aspect-square" },
                    { label: "Hochformat", ratio: "aspect-[3/4]" },
                    { label: "Banner", ratio: "aspect-[16/9]" },
                  ].map((p) => (
                    <div key={p.label} className="flex flex-col gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element -- crop preview */}
                      <img src={item.src} alt="" className={cn("w-full rounded-lg bg-subtle object-cover", p.ratio)} style={{ objectPosition: `${focus.x}% ${focus.y}%` }} />
                      <span className="text-xs text-muted">{p.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-5">
              <Field>
                <Label>Alternativtext</Label>
                <Input value={alt} onChange={(e) => setAlt(e.target.value)} disabled={!canEdit} />
                <Description>Beschreibt das Bild für Screenreader und Suchmaschinen.</Description>
              </Field>
              <Field>
                <Label>Bildunterschrift</Label>
                <Textarea rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={!canEdit} />
              </Field>
              {canEdit ? (
                <TagInput label="Schlagwörter" defaultValue={item.tags} suggestions={tagSuggestions} onValueChange={setTags} />
              ) : (
                item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                )
              )}

              <div className="flex flex-col gap-2 border-t border-border pt-5">
                <span className="text-[15px] font-medium">Verwendet in</span>
                {item.usedIn.length === 0 ? (
                  <span className="text-sm text-muted">Nirgends. Die Datei kann gefahrlos gelöscht werden.</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {item.usedIn.map((file) => {
                      const d = describeFile(file, kern);
                      return (
                        <li key={file} className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2 text-[15px]" title={file}>
                          <span className="truncate">{d.label}</span>
                          <span className="shrink-0 text-sm text-muted">{d.kind}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-5">
                <span className="text-[15px] font-medium">Pfad auf der Website</span>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-subtle px-3 py-2 font-mono text-sm">{item.value}</code>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label="Pfad kopieren"
                    onClick={() => {
                      void navigator.clipboard?.writeText(item.value);
                      toast.success("Pfad kopiert");
                    }}
                  >
                    <Link2 />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {EDITABLE.test(item.name) && (
        <ImageEditor
          item={item}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          onSaved={(saved) => {
            if (saved.name !== item.name) onRenamed(saved.name);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`„${item.name}“ löschen?`}
        description={
          item.usedIn.length > 0
            ? `Die Datei wird noch an ${item.usedIn.length} ${item.usedIn.length === 1 ? "Stelle" : "Stellen"} verwendet, dort fehlt sie danach. Sie liegt 30 Tage im Papierkorb.`
            : "Die Datei landet im Papierkorb und kann 30 Tage lang wiederhergestellt werden."
        }
        confirmLabel="Löschen"
        danger
        onConfirm={remove}
      />
    </>
  );
}

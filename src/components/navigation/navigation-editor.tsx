"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/display";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { SegmentedControl, Tooltip } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { sitePages } from "@/lib/example-content";
import { cn } from "@/lib/utils";

type NavEntry = {
  id: string;
  label: string;
  kind: "page" | "url";
  target: string;
  depth: 0 | 1;
  newTab?: boolean;
};

const initialItems: NavEntry[] = [
  { id: "1", label: "Sortiment", kind: "page", target: "/sortiment", depth: 0 },
  { id: "2", label: "Brote", kind: "page", target: "/sortiment", depth: 1 },
  { id: "3", label: "Kuchen", kind: "page", target: "/sortiment", depth: 1 },
  { id: "4", label: "Catering", kind: "page", target: "/catering", depth: 0 },
  { id: "5", label: "Über uns", kind: "page", target: "/ueber-uns", depth: 0 },
  { id: "6", label: "Online bestellen", kind: "url", target: "https://bestellen.baeckerei-mueller.de", depth: 0, newTab: true },
  { id: "7", label: "Kontakt", kind: "page", target: "/kontakt", depth: 0 },
];

/* ---------- Add / edit dialog ---------- */

function EntryDialog({
  open,
  onOpenChange,
  entry,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: NavEntry;
  onSave: (entry: Omit<NavEntry, "id" | "depth">) => void;
}) {
  const [label, setLabel] = useState(entry?.label ?? "");
  const [kind, setKind] = useState<NavEntry["kind"]>(entry?.kind ?? "page");
  const [target, setTarget] = useState(entry?.target ?? sitePages[0].value);
  const [url, setUrl] = useState(entry?.kind === "url" ? entry.target : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={entry ? "Menüpunkt bearbeiten" : "Menüpunkt hinzufügen"}
        size="sm"
        footer={
          <>
            <DialogClose className={buttonStyles({ variant: "secondary" })}>Abbrechen</DialogClose>
            <DialogClose
              className={buttonStyles()}
              disabled={!label.trim() || (kind === "url" && !url.trim())}
              onClick={() => onSave({ label: label.trim(), kind, target: kind === "page" ? target : url.trim(), newTab: kind === "url" })}
            >
              {entry ? "Übernehmen" : "Hinzufügen"}
            </DialogClose>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Field>
            <Label>Bezeichnung</Label>
            <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-medium">Ziel</span>
            <SegmentedControl
              label="Ziel"
              value={kind}
              onValueChange={(v) => setKind(v as NavEntry["kind"])}
              items={[
                { value: "page", label: "Seite der Website" },
                { value: "url", label: "Externer Link" },
              ]}
              className="w-fit"
            />
          </div>
          {kind === "page" ? (
            <Select label="Seite" items={sitePages} defaultValue={target} onValueChange={setTarget} />
          ) : (
            <Field>
              <Label>Adresse</Label>
              <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
              <Description>Externe Links öffnen sich in einem neuen Tab.</Description>
            </Field>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Editor ---------- */

export function NavigationEditor() {
  const [items, setItems] = useState(initialItems);
  const [dialog, setDialog] = useState<{ open: boolean; entry?: NavEntry; key: number }>({ open: false, key: 0 });
  const [dragId, setDragId] = useState<string | null>(null);
  const nextId = useRef(100);
  const [announcement, setAnnouncement] = useState("");
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  /** Row to refocus after a keyboard move (React may drop focus when reordering nodes). */
  const refocusId = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!refocusId.current) return;
    const row = rowRefs.current.get(refocusId.current);
    refocusId.current = null;
    if (row && document.activeElement !== row) row.focus();
  });

  function move(fromId: string, toIndex: number) {
    setItems((list) => {
      const from = list.findIndex((i) => i.id === fromId);
      if (from === -1 || from === toIndex) return list;
      const copy = [...list];
      const [moved] = copy.splice(from, 1);
      copy.splice(toIndex, 0, moved);
      // A sub-item can't be first.
      if (copy[0].depth === 1) copy[0] = { ...copy[0], depth: 0 };
      return copy;
    });
  }

  function setDepth(id: string, depth: 0 | 1) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, depth } : i)));
  }

  /** Move one step up or down (buttons and Alt+Arrow keys) and announce the new position. */
  function moveBy(item: NavEntry, delta: -1 | 1, keepFocus = false) {
    const from = items.findIndex((i) => i.id === item.id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= items.length) return;
    move(item.id, to);
    if (keepFocus) refocusId.current = item.id;
    setAnnouncement(`„${item.label}“ ist jetzt an Position ${to + 1} von ${items.length}.`);
  }

  /** Indent (sub-item of the entry above) or outdent, with announcement. */
  function changeDepth(item: NavEntry, depth: 0 | 1) {
    const index = items.findIndex((i) => i.id === item.id);
    if (depth === item.depth || (depth === 1 && index <= 0)) return;
    setDepth(item.id, depth);
    if (depth === 1) {
      const parent = items.slice(0, index).findLast((i) => i.depth === 0);
      setAnnouncement(`„${item.label}“ ist jetzt Unterpunkt${parent ? ` von „${parent.label}“` : ""}.`);
    } else {
      setAnnouncement(`„${item.label}“ ist jetzt auf der Hauptebene.`);
    }
  }

  function onRowKeyDown(e: React.KeyboardEvent, item: NavEntry) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const actions: Record<string, () => void> = {
      ArrowUp: () => moveBy(item, -1, true),
      ArrowDown: () => moveBy(item, 1, true),
      ArrowRight: () => changeDepth(item, 1),
      ArrowLeft: () => changeDepth(item, 0),
    };
    const action = actions[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  }

  function remove(entry: NavEntry) {
    setItems((list) => list.filter((i) => i.id !== entry.id));
    toast.info(`„${entry.label}“ entfernt`);
    setAnnouncement(`„${entry.label}“ entfernt.`);
  }

  const pageLabel = (path: string) => sitePages.find((p) => p.value === path)?.label ?? path;

  return (
    <Card>
      <CardHeader
        title="Navigation"
        description="Ziehe Menüpunkte oder nutze die Pfeile, um sie zu sortieren und einzurücken."
        action={
          <Button variant="secondary" size="sm" onClick={() => setDialog({ open: true, key: Date.now() })}>
            <Plus />
            Menüpunkt
          </Button>
        }
      />
      <CardContent className="flex flex-col">
        <p id="navigation-keyboard-hint" className="sr-only">
          Alt und Pfeiltaste nach oben oder unten verschiebt den Menüpunkt. Alt und Pfeiltaste nach rechts macht ihn zum
          Unterpunkt, nach links zurück zur Hauptebene.
        </p>
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <ul aria-label="Menüpunkte" className="flex flex-col gap-1.5">
          {items.map((item, index) => (
            <li
              key={item.id}
              ref={(node) => {
                if (node) rowRefs.current.set(item.id, node);
                else rowRefs.current.delete(item.id);
              }}
              tabIndex={0}
              aria-label={`${item.label}, ${item.depth === 1 ? "Unterpunkt" : "Hauptebene"}, Position ${index + 1} von ${items.length}`}
              aria-describedby="navigation-keyboard-hint"
              onKeyDown={(e) => onRowKeyDown(e, item)}
              draggable
              onDragStart={(e) => {
                setDragId(item.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragId && dragId !== item.id) move(dragId, index);
              }}
              onDragEnd={() => setDragId(null)}
              className={cn(
                "group flex h-14 items-center gap-2 rounded-xl border bg-surface pr-2 pl-1 transition-[margin,opacity,box-shadow] outline-none focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 sm:gap-3",
                item.depth === 1 && "ml-6 sm:ml-10",
                dragId === item.id ? "border-accent opacity-60 shadow-popover" : "border-border hover:border-border-strong",
              )}
            >
              <span aria-hidden className="flex h-full w-8 shrink-0 cursor-grab items-center justify-center text-muted active:cursor-grabbing">
                <GripVertical className="size-5" strokeWidth={1.75} />
              </span>
              {item.kind === "page" ? (
                <FileText className="size-[18px] shrink-0 text-muted" strokeWidth={1.75} />
              ) : (
                <ExternalLink className="size-[18px] shrink-0 text-muted" strokeWidth={1.75} />
              )}
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[15px] font-medium">{item.label}</span>
                <span className="truncate text-sm text-muted">
                  {item.kind === "page" ? `${pageLabel(item.target)} · ${item.target}` : item.target}
                </span>
              </span>

              <div className="flex shrink-0 items-center opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <Tooltip label="Nach oben">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label={`„${item.label}“ nach oben`}
                    disabled={index === 0}
                    onClick={() => moveBy(item, -1)}
                  >
                    <ChevronUp strokeWidth={1.75} />
                  </Button>
                </Tooltip>
                <Tooltip label="Nach unten">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label={`„${item.label}“ nach unten`}
                    disabled={index === items.length - 1}
                    onClick={() => moveBy(item, 1)}
                  >
                    <ChevronDown strokeWidth={1.75} />
                  </Button>
                </Tooltip>
                {item.depth === 0 ? (
                  <Tooltip label="Zum Unterpunkt machen">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label="Zum Unterpunkt machen"
                      disabled={index === 0}
                      onClick={() => changeDepth(item, 1)}
                    >
                      <ArrowRightToLine />
                    </Button>
                  </Tooltip>
                ) : (
                  <Tooltip label="Zur Hauptebene">
                    <Button variant="ghost" size="icon" className="size-9" aria-label="Zur Hauptebene" onClick={() => changeDepth(item, 0)}>
                      <ArrowLeftToLine />
                    </Button>
                  </Tooltip>
                )}
                <Tooltip label="Bearbeiten">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label="Bearbeiten"
                    onClick={() => setDialog({ open: true, entry: item, key: Date.now() })}
                  >
                    <Pencil />
                  </Button>
                </Tooltip>
                <Tooltip label="Entfernen">
                  <Button variant="ghost" size="icon" className="size-9 text-danger" aria-label="Entfernen" onClick={() => remove(item)}>
                    <Trash2 />
                  </Button>
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-end gap-3 border-t border-border pt-5">
          <Button
            variant="secondary"
            onClick={() => {
              setItems(initialItems);
              toast.info("Navigation zurückgesetzt");
            }}
          >
            Zurücksetzen
          </Button>
          <Button onClick={() => toast.success("Navigation gespeichert", { description: "Die Änderung liegt im Entwurf." })}>
            Speichern
          </Button>
        </div>
      </CardContent>

      <EntryDialog
        key={dialog.key}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        entry={dialog.entry}
        onSave={(data) => {
          if (dialog.entry) {
            const id = dialog.entry.id;
            setItems((list) => list.map((i) => (i.id === id ? { ...i, ...data } : i)));
            toast.success("Menüpunkt geändert");
          } else {
            setItems((list) => [...list, { ...data, id: String(nextId.current++), depth: 0 }]);
            toast.success(`„${data.label}“ hinzugefügt`);
          }
        }}
      />
    </Card>
  );
}

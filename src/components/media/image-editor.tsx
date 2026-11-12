"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useId, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  Copy,
  Crop,
  Crosshair,
  FlipHorizontal2,
  FlipVertical2,
  Loader2,
  MoreHorizontal,
  Redo2,
  Replace,
  RotateCcw,
  RotateCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  SplitSquareHorizontal,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { formatBytes } from "@/components/actions/common";
import { reloadMedia } from "@/components/kern/use-media";
import { Button, buttonStyles } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/components/ui/toast";
import type { MediaItem } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { saveImageEdit, saveMediaMeta } from "@/server/actions/media";
import type { ImageEdit } from "@/server/media";

/* ---------- Model ---------- */

type Adjust = { brightness: number; contrast: number; saturation: number; warmth: number };
type FilterId = NonNullable<ImageEdit["filter"]>;
type CropRect = { left: number; top: number; width: number; height: number };
type Handle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const MIN_CROP = 8;
const FULL: CropRect = { left: 0, top: 0, width: 100, height: 100 };

type EditState = {
  aspect: string;
  /** Clockwise quarter turns in degrees: 0, 90, 180, 270. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  /** Crop frame in percent of the rotated image. */
  crop: CropRect;
  adjust: Adjust;
  filter: FilterId;
};

const initialState: EditState = {
  aspect: "free",
  rotation: 0,
  flipX: false,
  flipY: false,
  crop: FULL,
  adjust: { brightness: 0, contrast: 0, saturation: 0, warmth: 0 },
  filter: "none",
};

const aspects = [
  { value: "free", label: "Frei", ratio: undefined },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "3:2", label: "3:2", ratio: 3 / 2 },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "3:4", label: "3:4", ratio: 3 / 4 },
  { value: "9:16", label: "9:16", ratio: 9 / 16 },
];

/** The same presets the server applies (src/server/media.ts editImage), as multipliers and a warmth shift. */
const filters: { id: FilterId; label: string; saturation: number; contrast: number; warmth: number; mono?: boolean }[] = [
  { id: "none", label: "Original", saturation: 1, contrast: 0, warmth: 0 },
  { id: "warm", label: "Warm", saturation: 1, contrast: 0, warmth: 0.25 },
  { id: "cool", label: "Kühl", saturation: 1, contrast: 0, warmth: -0.25 },
  { id: "vivid", label: "Kräftig", saturation: 1.35, contrast: 0.1, warmth: 0 },
  { id: "fade", label: "Blass", saturation: 0.75, contrast: -0.15, warmth: 0 },
  { id: "vintage", label: "Vintage", saturation: 0.8, contrast: 0, warmth: 0.25 },
  { id: "mono", label: "Schwarzweiß", saturation: 1, contrast: 0, warmth: 0, mono: true },
];

const adjustments: { key: keyof Adjust; label: string }[] = [
  { key: "brightness", label: "Helligkeit" },
  { key: "contrast", label: "Kontrast" },
  { key: "saturation", label: "Sättigung" },
  { key: "warmth", label: "Wärme" },
];

const maxWidths = [
  { label: "Originalgröße", value: "original" },
  { label: "2560 px", value: "2560" },
  { label: "1920 px", value: "1920" },
  { label: "1280 px", value: "1280" },
  { label: "800 px", value: "800" },
];

type Tool = "crop" | "adjust" | "filter" | "focus" | "output";

const tools: { id: Tool; label: string; icon: LucideIcon }[] = [
  { id: "crop", label: "Zuschneiden", icon: Crop },
  { id: "adjust", label: "Anpassen", icon: SlidersHorizontal },
  { id: "filter", label: "Filter", icon: Sparkles },
  { id: "focus", label: "Fokus", icon: Crosshair },
  { id: "output", label: "Ausgabe", icon: Settings2 },
];

/** Live preview of the server pipeline: modulate → contrast → grayscale → warmth (SVG colour matrix). */
function previewFilter(s: Pick<EditState, "adjust" | "filter">, warmthFilterId: string) {
  const f = filters.find((x) => x.id === s.filter) ?? filters[0];
  const brightness = 1 + s.adjust.brightness / 100;
  const saturation = Math.max(0, (1 + s.adjust.saturation / 100) * f.saturation);
  const contrast = 1 + s.adjust.contrast / 100 + f.contrast;
  const parts = [`brightness(${brightness})`, `saturate(${saturation})`, `contrast(${contrast})`];
  if (f.mono) parts.push("grayscale(1)");
  if (s.adjust.warmth / 100 + f.warmth !== 0) parts.push(`url(#${warmthFilterId})`);
  return parts.join(" ");
}

function warmthOf(s: Pick<EditState, "adjust" | "filter">) {
  return s.adjust.warmth / 100 + (filters.find((x) => x.id === s.filter)?.warmth ?? 0);
}

/** Height/width factor in percent units for a locked aspect ratio, or undefined when free. */
function lockFactor(aspect: string, imageRatio: number) {
  const ratio = aspects.find((a) => a.value === aspect)?.ratio;
  return ratio ? imageRatio / ratio : undefined;
}

/** Largest centred crop frame for an aspect ratio. */
function fitCrop(aspect: string, imageRatio: number): CropRect {
  const k = lockFactor(aspect, imageRatio);
  if (!k) return FULL;
  let width = 100;
  let height = width * k;
  if (height > 100) {
    height = 100;
    width = height / k;
  }
  return { left: (100 - width) / 2, top: (100 - height) / 2, width, height };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** New frame after dragging `handle` by dx/dy (percent), respecting bounds and the aspect lock. */
function resizeCrop(r: CropRect, handle: Handle, dx: number, dy: number, k: number | undefined): CropRect {
  if (handle === "move") {
    return { ...r, left: clamp(r.left + dx, 0, 100 - r.width), top: clamp(r.top + dy, 0, 100 - r.height) };
  }
  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const right = r.left + r.width;
  const bottom = r.top + r.height;

  if (k) {
    // Locked: corners only. Width follows the pointer, height follows the ratio.
    const anchorX = east ? r.left : right;
    const anchorY = south ? r.top : bottom;
    const maxW = Math.min(east ? 100 - anchorX : anchorX, (south ? 100 - anchorY : anchorY) / k);
    const width = clamp(east ? r.width + dx : r.width - dx, MIN_CROP, maxW);
    const height = width * k;
    return { left: east ? anchorX : anchorX - width, top: south ? anchorY : anchorY - height, width, height };
  }

  const left = west ? clamp(r.left + dx, 0, right - MIN_CROP) : r.left;
  const newRight = east ? clamp(right + dx, r.left + MIN_CROP, 100) : right;
  const top = north ? clamp(r.top + dy, 0, bottom - MIN_CROP) : r.top;
  const newBottom = south ? clamp(bottom + dy, r.top + MIN_CROP, 100) : bottom;
  return { left, top, width: newRight - left, height: newBottom - top };
}

const isFull = (c: CropRect) => c.left <= 0.01 && c.top <= 0.01 && c.width >= 99.99 && c.height >= 99.99;

/* ---------- Component ---------- */

export function ImageEditor({
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  item: MediaItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the saved file (the same one, or the new copy). */
  onSaved?: (item: MediaItem) => void;
}) {
  const [tool, setTool] = useState<Tool>("crop");
  const [history, setHistory] = useState<EditState[]>([initialState]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<EditState>(initialState);
  const [compare, setCompare] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [dragging, setDragging] = useState(false);
  const [focus, setFocus] = useState({ x: item.focusX, y: item.focusY });
  const [width, setWidth] = useState("original");
  const [quality, setQuality] = useState(85);
  const [natural, setNatural] = useState({ w: item.width ?? 0, h: item.height ?? 0 });
  /** Below lg the tool panel is a bottom sheet; tapping the active tool collapses it. */
  const [panelOpen, setPanelOpen] = useState(true);
  const [saving, startSave] = useTransition();
  const [savingFocus, startFocus] = useTransition();
  const stageRef = useRef<HTMLDivElement>(null);
  const warmthId = `warmth-${useId().replace(/:/g, "")}`;

  const s = draft;
  const isPng = /\.png$/i.test(item.name);

  function preview(next: Partial<EditState>) {
    setDraft((d) => ({ ...d, ...next }));
  }

  function commit(next: Partial<EditState>) {
    const merged = { ...draft, ...next };
    setDraft(merged);
    const trimmed = history.slice(0, index + 1);
    setHistory([...trimmed, merged]);
    setIndex(trimmed.length);
  }

  function undo() {
    if (index === 0) return;
    setIndex(index - 1);
    setDraft(history[index - 1]);
  }

  function redo() {
    if (index >= history.length - 1) return;
    setIndex(index + 1);
    setDraft(history[index + 1]);
  }

  function reset() {
    commit(initialState);
    setZoom(100);
  }

  function close() {
    onOpenChange(false);
    setDraft(initialState);
    setHistory([initialState]);
    setIndex(0);
    setTool("crop");
    setPanelOpen(true);
    setCompare(false);
    setZoom(100);
    setWidth("original");
    setQuality(85);
    setFocus({ x: item.focusX, y: item.focusY });
  }

  function selectTool(next: Tool) {
    if (next === tool) setPanelOpen((o) => !o);
    else {
      setTool(next);
      setPanelOpen(true);
    }
  }

  const shown = compare ? initialState : s;
  const quarterTurn = shown.rotation % 180 === 90;
  const ratio = natural.w && natural.h ? natural.w / natural.h : 3 / 2;
  /** Aspect of what the stage shows: the rotated image. */
  const stageRatio = quarterTurn ? 1 / ratio : ratio;
  const rotatedPx = quarterTurn ? { w: natural.h, h: natural.w } : { w: natural.w, h: natural.h };
  const locked = lockFactor(s.aspect, stageRatio);
  const crop = s.crop;
  const hasEdits = index > 0 && JSON.stringify(s) !== JSON.stringify(initialState);
  const outputChanged = width !== "original" || (!isPng && quality !== 85);
  const focusChanged = focus.x !== item.focusX || focus.y !== item.focusY;

  function rotate(by: number) {
    const rotation = (((s.rotation + by) % 360) + 360) % 360;
    commit({ rotation, crop: FULL, aspect: "free" });
  }

  /** Drag a handle (or the frame itself); listeners live on window so fast moves don’t get lost. */
  function startCropDrag(handle: Handle, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const stage = (e.currentTarget as HTMLElement).closest("[data-crop-stage]");
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    const origin = { x: e.clientX, y: e.clientY };
    const startRect = crop;
    let latest = startRect;
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      latest = resizeCrop(startRect, handle, ((ev.clientX - origin.x) / box.width) * 100, ((ev.clientY - origin.y) / box.height) * 100, locked);
      preview({ crop: latest });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragging(false);
      if (latest !== startRect) commit({ crop: latest });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function onStageClick(e: React.MouseEvent) {
    if (tool !== "focus" || !stageRef.current) return;
    const box = stageRef.current.getBoundingClientRect();
    setFocus({
      x: Math.round(clamp(((e.clientX - box.left) / box.width) * 100, 0, 100)),
      y: Math.round(clamp(((e.clientY - box.top) / box.height) * 100, 0, 100)),
    });
  }

  function saveFocus() {
    startFocus(async () => {
      const result = await saveMediaMeta(item.name, { focusX: focus.x, focusY: focus.y });
      if (!result.ok) {
        toast.error("Fokuspunkt nicht gespeichert", { description: result.error });
        return;
      }
      await reloadMedia();
      toast.success("Fokuspunkt gespeichert");
    });
  }

  function save(saveAs: "replace" | "copy") {
    const a = s.adjust;
    const edit: ImageEdit = {
      saveAs,
      ...(s.rotation && { rotate: s.rotation }),
      ...(s.flipX && { flipH: true }),
      ...(s.flipY && { flipV: true }),
      ...(!isFull(s.crop) && { crop: s.crop }),
      ...(a.brightness && { brightness: a.brightness }),
      ...(a.contrast && { contrast: a.contrast }),
      ...(a.saturation && { saturation: a.saturation }),
      ...(a.warmth && { warmth: a.warmth }),
      ...(s.filter !== "none" && { filter: s.filter }),
      ...(width !== "original" && { width: Number(width) }),
      ...(!isPng && { quality }),
    };
    startSave(async () => {
      const result = await saveImageEdit(item.name, edit);
      if (!result.ok) {
        toast.error("Speichern fehlgeschlagen", { description: result.error });
        return;
      }
      const name = result.data.name;
      if (focusChanged) await saveMediaMeta(name, { focusX: focus.x, focusY: focus.y });
      await reloadMedia();
      const res = await fetch("/api/media/list", { cache: "no-store" });
      const list = res.ok ? ((await res.json()) as MediaItem[]) : [];
      const saved = list.find((m) => m.name === name) ?? { ...item, name, value: item.value.replace(item.name, name) };
      toast.success(saveAs === "copy" ? `Als „${name}“ gespeichert` : "Bild gespeichert", {
        description:
          saveAs === "copy"
            ? "Das Original bleibt unverändert."
            : item.location === "repo"
              ? "Die Änderung ist im Entwurf und geht beim Veröffentlichen live."
              : "Die Datei liegt im Speicher und ist sofort live.",
      });
      onSaved?.(saved);
      close();
    });
  }

  const imageFilter = compare ? undefined : previewFilter(s, warmthId);
  const warmth = warmthOf(s);
  const imageTransform = `translate(-50%, -50%) scale(${shown.flipX ? -1 : 1}, ${shown.flipY ? -1 : 1}) rotate(${shown.rotation}deg)`;

  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => (next ? onOpenChange(true) : !saving && close())}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-backdrop/40 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <BaseDialog.Popup className="fixed inset-0 z-50 flex flex-col overflow-hidden border-border bg-surface shadow-popover outline-none transition-[scale,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 lg:inset-4 lg:rounded-2xl lg:border">
          {/* Warmth needs per-channel scaling, which CSS filters cannot do. */}
          <svg aria-hidden className="absolute size-0">
            <filter id={warmthId} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={`${1 + warmth * 0.15} 0 0 0 0  0 1 0 0 0  0 0 ${1 - warmth * 0.15} 0 0  0 0 0 1 0`} />
            </filter>
          </svg>

          {/* Header */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-3 lg:gap-3 lg:px-4">
            <div className="flex min-w-0 flex-1 flex-col leading-tight lg:flex-none">
              <BaseDialog.Title className="truncate text-base font-semibold">{item.name}</BaseDialog.Title>
              <BaseDialog.Description className="truncate text-sm text-muted">
                {formatBytes(item.size)}
                {natural.w ? ` · ${natural.w} × ${natural.h} px` : ""}
              </BaseDialog.Description>
            </div>

            <div className="mx-auto hidden items-center gap-1 lg:flex">
              <Tooltip label="Rückgängig">
                <Button variant="ghost" size="icon" aria-label="Rückgängig" disabled={index === 0} onClick={undo}>
                  <Undo2 strokeWidth={1.75} />
                </Button>
              </Tooltip>
              <Tooltip label="Wiederholen">
                <Button variant="ghost" size="icon" aria-label="Wiederholen" disabled={index >= history.length - 1} onClick={redo}>
                  <Redo2 strokeWidth={1.75} />
                </Button>
              </Tooltip>
              <span className="mx-2 h-8 w-px bg-border" />
              <Tooltip label="Gedrückt halten für das Original">
                <Button
                  variant="ghost"
                  aria-label="Vorher/Nachher"
                  onPointerDown={() => setCompare(true)}
                  onPointerUp={() => setCompare(false)}
                  onPointerLeave={() => setCompare(false)}
                  className={cn(compare && "bg-subtle")}
                >
                  <SplitSquareHorizontal strokeWidth={1.75} />
                  Vorher / Nachher
                </Button>
              </Tooltip>
            </div>

            <Button variant="ghost" onClick={reset} disabled={!hasEdits || saving} className="max-lg:hidden">
              Zurücksetzen
            </Button>
            <Button variant="secondary" onClick={close} disabled={saving} className="max-lg:hidden">
              Abbrechen
            </Button>

            {/* Compact header: secondary actions live in a menu */}
            <Menu>
              <Tooltip label="Weitere Aktionen">
                <MenuTrigger
                  aria-label="Weitere Aktionen"
                  className={buttonStyles({ variant: "ghost", size: "icon", className: "data-popup-open:bg-subtle lg:hidden" })}
                >
                  <MoreHorizontal strokeWidth={1.75} />
                </MenuTrigger>
              </Tooltip>
              <MenuContent>
                <MenuItem icon={Undo2} disabled={index === 0} onClick={undo} closeOnClick={false}>
                  Rückgängig
                </MenuItem>
                <MenuItem icon={Redo2} disabled={index >= history.length - 1} onClick={redo} closeOnClick={false}>
                  Wiederholen
                </MenuItem>
                <MenuItem icon={SplitSquareHorizontal} onClick={() => setCompare((c) => !c)}>
                  {compare ? "Bearbeitung anzeigen" : "Original anzeigen"}
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={RotateCcw} disabled={!hasEdits} onClick={reset}>
                  Zurücksetzen
                </MenuItem>
                <MenuItem icon={X} onClick={close}>
                  Abbrechen
                </MenuItem>
              </MenuContent>
            </Menu>

            <Menu>
              <MenuTrigger
                disabled={saving || (!hasEdits && !outputChanged && !focusChanged)}
                className={buttonStyles({ className: "data-popup-open:bg-accent-hover" })}
              >
                {saving && <Loader2 className="animate-spin" />}
                Speichern
                <ChevronDown className="size-4" />
              </MenuTrigger>
              <MenuContent className="w-72">
                <MenuItem icon={Replace} onClick={() => save("replace")} className="h-auto py-2.5">
                  <span className="flex flex-col">
                    <span>Ersetzen</span>
                    <span className="text-sm text-muted">Überall, wo das Bild verwendet wird</span>
                  </span>
                </MenuItem>
                <MenuItem icon={Copy} onClick={() => save("copy")} className="h-auto py-2.5">
                  <span className="flex flex-col">
                    <span>Als Kopie speichern</span>
                    <span className="text-sm text-muted">Das Original bleibt unverändert</span>
                  </span>
                </MenuItem>
              </MenuContent>
            </Menu>
            <BaseDialog.Close aria-label="Schließen" disabled={saving} className={buttonStyles({ variant: "ghost", size: "icon" })}>
              <X strokeWidth={1.75} />
            </BaseDialog.Close>
          </header>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* Tool rail: left column on desktop, bottom bar below lg */}
            <nav
              aria-label="Werkzeuge"
              className="order-last flex shrink-0 gap-1 border-t border-border p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] lg:order-none lg:w-24 lg:flex-col lg:border-t-0 lg:border-r lg:p-2"
            >
              {tools.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tool === t.id}
                  aria-controls="image-editor-panel"
                  onClick={() => selectTool(t.id)}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60 lg:flex-none lg:gap-1.5 lg:py-3",
                    tool === t.id ? "bg-accent-soft text-accent" : "text-muted hover:bg-subtle hover:text-foreground",
                  )}
                >
                  <t.icon className="size-5" strokeWidth={1.75} />
                  {t.label}
                </button>
              ))}
            </nav>

            {/* Stage */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#1c1c1f]">
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 lg:p-8" style={{ containerType: "size" }}>
                {/* Largest box with the rotated image's aspect that fits */}
                <div
                  ref={stageRef}
                  data-crop-stage
                  onClick={onStageClick}
                  className={cn("relative transition-transform duration-200", tool === "focus" && "cursor-crosshair")}
                  style={{
                    aspectRatio: String(stageRatio),
                    width: `min(100cqw, ${stageRatio * 100}cqh)`,
                    transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
                  }}
                >
                  <div className="absolute inset-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element -- served from the site's draft checkout */}
                    <img
                      src={item.src}
                      alt={item.alt}
                      draggable={false}
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        if (img.naturalWidth && (img.naturalWidth !== natural.w || img.naturalHeight !== natural.h)) {
                          setNatural({ w: img.naturalWidth, h: img.naturalHeight });
                        }
                      }}
                      className="absolute top-1/2 left-1/2 max-w-none transition-transform duration-200 select-none"
                      style={{
                        width: quarterTurn ? `${ratio * 100}%` : "100%",
                        height: quarterTurn ? `${100 / ratio}%` : "100%",
                        transform: imageTransform,
                        filter: imageFilter,
                      }}
                    />
                  </div>

                  {/* Crop overlay */}
                  {tool === "crop" && !compare && (
                    <div
                      onPointerDown={(e) => startCropDrag("move", e)}
                      className={cn(
                        "absolute cursor-move touch-none border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]",
                        !dragging && "transition-[left,top,width,height] duration-200",
                      )}
                      style={{ left: `${crop.left}%`, top: `${crop.top}%`, width: `${crop.width}%`, height: `${crop.height}%` }}
                    >
                      <span className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/50" />
                      <span className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/50" />
                      <span className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/50" />
                      <span className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/50" />

                      {/* Corner handles: large hit area, visible L-shaped mark */}
                      {(
                        [
                          ["nw", "-top-3 -left-3 cursor-nwse-resize", "top-2 left-2 border-t-4 border-l-4"],
                          ["ne", "-top-3 -right-3 cursor-nesw-resize", "top-2 right-2 border-t-4 border-r-4"],
                          ["sw", "-bottom-3 -left-3 cursor-nesw-resize", "bottom-2 left-2 border-b-4 border-l-4"],
                          ["se", "-bottom-3 -right-3 cursor-nwse-resize", "bottom-2 right-2 border-b-4 border-r-4"],
                        ] as const
                      ).map(([handle, hit, mark]) => (
                        <span key={handle} aria-hidden onPointerDown={(e) => startCropDrag(handle, e)} className={cn("absolute z-10 size-9 touch-none", hit)}>
                          <span className={cn("absolute size-5 border-white", mark)} />
                        </span>
                      ))}

                      {/* Edge handles (only when the ratio is free) */}
                      {!locked &&
                        (
                          [
                            ["n", "-top-3 left-1/2 h-6 w-14 -translate-x-1/2 cursor-ns-resize", "h-1.5 w-8"],
                            ["s", "-bottom-3 left-1/2 h-6 w-14 -translate-x-1/2 cursor-ns-resize", "h-1.5 w-8"],
                            ["w", "top-1/2 -left-3 h-14 w-6 -translate-y-1/2 cursor-ew-resize", "h-8 w-1.5"],
                            ["e", "top-1/2 -right-3 h-14 w-6 -translate-y-1/2 cursor-ew-resize", "h-8 w-1.5"],
                          ] as const
                        ).map(([handle, hit, bar]) => (
                          <span
                            key={handle}
                            aria-hidden
                            onPointerDown={(e) => startCropDrag(handle, e)}
                            className={cn("absolute z-10 flex touch-none items-center justify-center", hit)}
                          >
                            <span className={cn("rounded-full bg-white shadow", bar)} />
                          </span>
                        ))}

                      {dragging && rotatedPx.w > 0 && (
                        <span className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 rounded-md bg-black/70 px-2 py-1 text-xs font-medium whitespace-nowrap text-white tabular-nums">
                          {Math.round((crop.width / 100) * rotatedPx.w)} × {Math.round((crop.height / 100) * rotatedPx.h)} px
                        </span>
                      )}
                    </div>
                  )}

                  {/* Focus point */}
                  {tool === "focus" && (
                    <span
                      className="pointer-events-none absolute flex size-10 -translate-1/2 items-center justify-center rounded-full border-2 border-white bg-white/20 shadow-[0_0_0_2px_rgba(0,0,0,0.25)] transition-[left,top] duration-200"
                      style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
                    >
                      <span className="size-2 rounded-full bg-white" />
                    </span>
                  )}

                  {compare && <span className="absolute top-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white">Original</span>}
                </div>
              </div>

              {/* Stage footer: zoom */}
              <div className="flex h-11 shrink-0 items-center justify-center gap-1 border-t border-white/10 text-sm text-white/80 lg:h-12">
                <Tooltip label="Verkleinern" side="top">
                  <button
                    type="button"
                    aria-label="Verkleinern"
                    disabled={zoom <= 50}
                    onClick={() => setZoom((z) => Math.max(50, z - 25))}
                    className="flex size-9 items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-40"
                  >
                    <ZoomOut className="size-[18px]" />
                  </button>
                </Tooltip>
                <button type="button" onClick={() => setZoom(100)} className="h-9 w-20 rounded-lg font-medium tabular-nums hover:bg-white/10" title="Auf 100 % setzen">
                  {zoom} %
                </button>
                <Tooltip label="Vergrößern" side="top">
                  <button
                    type="button"
                    aria-label="Vergrößern"
                    disabled={zoom >= 200}
                    onClick={() => setZoom((z) => Math.min(200, z + 25))}
                    className="flex size-9 items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-40"
                  >
                    <ZoomIn className="size-[18px]" />
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Tool panel: right column on desktop, scrollable bottom sheet below lg */}
            <aside
              id="image-editor-panel"
              aria-label="Werkzeugoptionen"
              className={cn(
                "flex max-h-[45vh] shrink-0 flex-col overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-surface shadow-[0_-8px_24px_rgba(0,0,0,0.12)] lg:max-h-none lg:w-80 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none",
                !panelOpen && "max-lg:hidden",
              )}
            >
              <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong lg:hidden" />
              {tool === "crop" && (
                <Panel title="Zuschneiden" hint="An Ecken und Kanten ziehen, um die Größe zu ändern. Den Rahmen selbst zum Verschieben ziehen.">
                  <div className="flex flex-col gap-2">
                    <span className="text-[15px] font-medium">Seitenverhältnis</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {aspects.map((a) => (
                        <button
                          key={a.value}
                          type="button"
                          onClick={() => commit({ aspect: a.value, crop: fitCrop(a.value, stageRatio) })}
                          className={cn(
                            "h-10 rounded-lg border text-sm font-medium transition-colors",
                            s.aspect === a.value ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-subtle",
                          )}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[15px] font-medium">Drehen und Spiegeln</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      <ToolButton label="Links drehen" icon={RotateCcw} onClick={() => rotate(-90)} />
                      <ToolButton label="Rechts drehen" icon={RotateCw} onClick={() => rotate(90)} />
                      <ToolButton label="Horizontal spiegeln" icon={FlipHorizontal2} active={s.flipX} onClick={() => commit({ flipX: !s.flipX })} />
                      <ToolButton label="Vertikal spiegeln" icon={FlipVertical2} active={s.flipY} onClick={() => commit({ flipY: !s.flipY })} />
                    </div>
                  </div>
                  {!isFull(crop) && (
                    <Button variant="secondary" onClick={() => commit({ crop: FULL, aspect: "free" })}>
                      Zuschnitt entfernen
                    </Button>
                  )}
                </Panel>
              )}

              {tool === "adjust" && (
                <Panel title="Anpassen" hint="Doppelklick auf einen Wert setzt ihn zurück.">
                  {adjustments.map((adj) => (
                    <Slider
                      key={adj.key}
                      label={adj.label}
                      min={-100}
                      max={100}
                      value={s.adjust[adj.key]}
                      onValueChange={(v) => preview({ adjust: { ...s.adjust, [adj.key]: v } })}
                      onValueCommitted={(v) => commit({ adjust: { ...s.adjust, [adj.key]: v } })}
                    />
                  ))}
                </Panel>
              )}

              {tool === "filter" && (
                <Panel title="Filter" hint="Filter werden zusätzlich zu den Anpassungen angewendet.">
                  <div className="grid grid-cols-3 gap-2">
                    {filters.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => commit({ filter: f.id })}
                        className={cn(
                          "flex flex-col gap-1.5 rounded-xl p-1.5 text-xs font-medium transition-colors",
                          s.filter === f.id ? "bg-accent-soft text-accent ring-2 ring-accent" : "hover:bg-subtle",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- filter preview */}
                        <img
                          src={item.src}
                          alt=""
                          draggable={false}
                          className="aspect-square w-full rounded-lg object-cover"
                          style={{
                            filter: previewFilter({ adjust: initialState.adjust, filter: f.id }, warmthId).replace(`url(#${warmthId})`, f.warmth > 0 ? "sepia(0.2)" : f.warmth < 0 ? "hue-rotate(10deg)" : ""),
                          }}
                        />
                        {f.label}
                      </button>
                    ))}
                  </div>
                </Panel>
              )}

              {tool === "focus" && (
                <Panel title="Fokuspunkt" hint="Klicke ins Bild. Wenn die Website das Bild beschneidet, bleibt dieser Punkt sichtbar.">
                  <div className="flex items-center justify-between rounded-xl bg-subtle px-4 py-3 text-[15px]">
                    <span className="text-muted">Position</span>
                    <span className="font-medium tabular-nums">
                      {focus.x} % · {focus.y} %
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[15px] font-medium">So wird es zugeschnitten</span>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Quadrat", ratio: "aspect-square" },
                        { label: "Hochformat", ratio: "aspect-[3/4]" },
                        { label: "Banner", ratio: "aspect-[16/9]" },
                      ].map((p) => (
                        <div key={p.label} className="flex flex-col gap-1">
                          {/* eslint-disable-next-line @next/next/no-img-element -- crop preview */}
                          <img
                            src={item.src}
                            alt=""
                            draggable={false}
                            className={cn("w-full rounded-lg object-cover", p.ratio)}
                            style={{ objectPosition: `${focus.x}% ${focus.y}%` }}
                          />
                          <span className="text-xs text-muted">{p.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button onClick={saveFocus} disabled={!focusChanged || savingFocus}>
                      {savingFocus && <Loader2 className="animate-spin" />}
                      Fokuspunkt speichern
                    </Button>
                    <Button variant="secondary" onClick={() => setFocus({ x: 50, y: 50 })}>
                      Zur Mitte zurücksetzen
                    </Button>
                  </div>
                </Panel>
              )}

              {tool === "output" && (
                <Panel title="Ausgabe" hint="Wie die bearbeitete Datei gespeichert wird.">
                  <Select label="Maximale Breite" items={maxWidths} value={width} onValueChange={setWidth} />
                  {isPng ? (
                    <p className="text-sm text-muted">PNG wird verlustfrei gespeichert.</p>
                  ) : (
                    <Slider label="Qualität" min={40} max={100} value={quality} format={(v) => `${v} %`} onValueChange={setQuality} />
                  )}
                  <p className="text-sm text-muted">
                    Das Format bleibt erhalten ({item.name.split(".").pop()?.toUpperCase()}). Kleinere Bilder werden nicht vergrößert.
                  </p>
                </Panel>
              )}
            </aside>
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/* ---------- Panel helpers ---------- */

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ToolButton({ label, icon: Icon, onClick, active }: { label: string; icon: LucideIcon; onClick: () => void; active?: boolean }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "flex h-11 items-center justify-center rounded-lg border transition-colors",
          active ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-subtle",
        )}
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </button>
    </Tooltip>
  );
}

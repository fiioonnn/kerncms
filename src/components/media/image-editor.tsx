"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useRef, useState } from "react";
import {
  Crop,
  Crosshair,
  FlipHorizontal2,
  FlipVertical2,
  Info,
  Link2,
  MoreHorizontal,
  Redo2,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  SplitSquareHorizontal,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Description, Field, Input, Label } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { SampleImage } from "./sample-image";

/* ---------- Model ---------- */

type Adjust = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  highlights: number;
  shadows: number;
  sharpness: number;
  vignette: number;
};

type CropRect = { left: number; top: number; width: number; height: number };
type Handle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const MIN_CROP = 8;
const IMAGE_PX = { w: 3000, h: 2000 };

type EditState = {
  aspect: string;
  rotation: number;
  straighten: number;
  flipX: boolean;
  flipY: boolean;
  /** Crop frame in percent of the image: left, top, width, height. */
  crop: CropRect;
  adjust: Adjust;
  filter: string;
  focus: { x: number; y: number };
};

const initialState: EditState = {
  aspect: "free",
  rotation: 0,
  straighten: 0,
  flipX: false,
  flipY: false,
  crop: { left: 6, top: 6, width: 88, height: 88 },
  adjust: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, highlights: 0, shadows: 0, sharpness: 0, vignette: 0 },
  filter: "none",
  focus: { x: 50, y: 50 },
};

const IMAGE_RATIO = 3 / 2;

const aspects = [
  { value: "free", label: "Frei", ratio: undefined },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "3:2", label: "3:2", ratio: 3 / 2 },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "3:4", label: "3:4", ratio: 3 / 4 },
  { value: "9:16", label: "9:16", ratio: 9 / 16 },
];

const filters = [
  { id: "none", label: "Original", css: "" },
  { id: "bright", label: "Hell", css: "brightness(1.15) contrast(0.95) saturate(1.05)" },
  { id: "warm", label: "Warm", css: "sepia(0.25) saturate(1.2) hue-rotate(-8deg)" },
  { id: "cool", label: "Kühl", css: "saturate(0.9) hue-rotate(12deg) brightness(1.03)" },
  { id: "vivid", label: "Kräftig", css: "saturate(1.5) contrast(1.15)" },
  { id: "matte", label: "Matt", css: "contrast(0.82) brightness(1.08) saturate(0.85)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.45) contrast(0.9) brightness(1.05) saturate(0.8)" },
  { id: "bw", label: "Schwarzweiß", css: "grayscale(1) contrast(1.1)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.45) brightness(0.9)" },
];

const adjustments: { key: keyof Adjust; label: string }[] = [
  { key: "brightness", label: "Helligkeit" },
  { key: "contrast", label: "Kontrast" },
  { key: "saturation", label: "Sättigung" },
  { key: "warmth", label: "Wärme" },
  { key: "highlights", label: "Lichter" },
  { key: "shadows", label: "Schatten" },
  { key: "sharpness", label: "Schärfe" },
  { key: "vignette", label: "Vignette" },
];

const formats = [
  { label: "Automatisch (WebP)", value: "webp" },
  { label: "AVIF", value: "avif" },
  { label: "JPEG", value: "jpeg" },
  { label: "Original beibehalten", value: "original" },
];

const maxWidths = [
  { label: "1280 px", value: "1280" },
  { label: "1920 px", value: "1920" },
  { label: "2560 px", value: "2560" },
  { label: "Originalgröße", value: "original" },
];

type Tool = "crop" | "adjust" | "filter" | "focus" | "details";

const tools: { id: Tool; label: string; icon: LucideIcon }[] = [
  { id: "crop", label: "Zuschneiden", icon: Crop },
  { id: "adjust", label: "Anpassen", icon: SlidersHorizontal },
  { id: "filter", label: "Filter", icon: Sparkles },
  { id: "focus", label: "Fokus", icon: Crosshair },
  { id: "details", label: "Details", icon: Info },
];

function filterCss(s: EditState) {
  const a = s.adjust;
  const preset = filters.find((f) => f.id === s.filter)?.css ?? "";
  const parts = [
    `brightness(${1 + a.brightness / 100 + a.highlights / 400 + a.shadows / 400})`,
    `contrast(${1 + a.contrast / 100 + a.sharpness / 300 - (a.highlights + a.shadows) / 600})`,
    `saturate(${1 + a.saturation / 100})`,
    a.warmth > 0 ? `sepia(${a.warmth / 250})` : `hue-rotate(${a.warmth / 5}deg)`,
  ];
  return [...parts, preset].join(" ");
}

/** Height/width factor in percent units for a locked aspect ratio, or undefined when free. */
function lockFactor(aspect: string) {
  const ratio = aspects.find((a) => a.value === aspect)?.ratio;
  return ratio ? IMAGE_RATIO / ratio : undefined;
}

/** Largest centred crop frame for an aspect ratio. */
function fitCrop(aspect: string): CropRect {
  const k = lockFactor(aspect);
  if (!k) return { left: 6, top: 6, width: 88, height: 88 };
  let width = 92;
  let height = width * k;
  if (height > 92) {
    height = 92;
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

/* ---------- Component ---------- */

export function ImageEditor({
  name,
  size,
  open,
  onOpenChange,
}: {
  name: string;
  size: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tool, setTool] = useState<Tool>("crop");
  const [history, setHistory] = useState<EditState[]>([initialState]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<EditState>(initialState);
  const [compare, setCompare] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  /** Below lg the tool panel is a bottom sheet; tapping the active tool collapses it. */
  const [panelOpen, setPanelOpen] = useState(true);

  const s = draft;

  /** Live change (e.g. while dragging a slider). */
  function preview(next: Partial<EditState>) {
    setDraft((d) => ({ ...d, ...next }));
  }

  /** Committed change: goes into the undo history. */
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
    toast.info("Alle Bearbeitungen zurückgesetzt");
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
  }

  function selectTool(next: Tool) {
    if (next === tool) setPanelOpen((o) => !o);
    else {
      setTool(next);
      setPanelOpen(true);
    }
  }

  const shown = compare ? initialState : s;
  const quarterTurn = Math.abs(shown.rotation) % 180 === 90;
  const fill = 1 + Math.abs(shown.straighten) / 30;
  const scale = (quarterTurn ? 1 / IMAGE_RATIO : 1) * fill * (zoom / 100);
  const transform = `rotate(${shown.rotation + shown.straighten}deg) scale(${shown.flipX ? -scale : scale}, ${shown.flipY ? -scale : scale})`;
  const crop = s.crop;
  const locked = lockFactor(s.aspect);

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
      latest = resizeCrop(
        startRect,
        handle,
        ((ev.clientX - origin.x) / box.width) * 100,
        ((ev.clientY - origin.y) / box.height) * 100,
        locked,
      );
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
    commit({
      focus: {
        x: Math.round(((e.clientX - box.left) / box.width) * 100),
        y: Math.round(((e.clientY - box.top) / box.height) * 100),
      },
    });
  }

  return (
    <>
      <BaseDialog.Root open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
        <BaseDialog.Portal>
          <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <BaseDialog.Popup className="fixed inset-0 z-50 flex flex-col overflow-hidden border-border bg-surface shadow-popover outline-none lg:inset-4 lg:rounded-2xl lg:border transition-[scale,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            {/* Header */}
            <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-3 lg:gap-3 lg:px-4">
              <div className="flex min-w-0 flex-1 flex-col leading-tight lg:flex-none">
                <BaseDialog.Title className="truncate text-base font-semibold">{name}</BaseDialog.Title>
                <BaseDialog.Description className="truncate text-sm text-muted">{size} · 3000 × 2000 px</BaseDialog.Description>
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

              <Button variant="ghost" onClick={reset} disabled={index === 0} className="max-lg:hidden">
                Zurücksetzen
              </Button>
              <Button variant="secondary" onClick={close} className="max-lg:hidden">
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
                  <MenuItem icon={RotateCcw} disabled={index === 0} onClick={reset}>
                    Zurücksetzen
                  </MenuItem>
                  <MenuItem icon={X} onClick={close}>
                    Abbrechen
                  </MenuItem>
                </MenuContent>
              </Menu>
              <Button
                onClick={() => {
                  toast.success("Neue Version gespeichert", { description: "Das Original bleibt erhalten." });
                  close();
                }}
              >
                Speichern
              </Button>
              <BaseDialog.Close aria-label="Schließen" className={buttonStyles({ variant: "ghost", size: "icon" })}>
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
                <div
                  className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 lg:p-8"
                  style={{ containerType: "size" }}
                >
                  {/* Largest 3:2 box that fits the available width and height */}
                  <div
                    ref={stageRef}
                    data-crop-stage
                    onClick={onStageClick}
                    className={cn("relative aspect-[3/2] max-w-4xl", tool === "focus" && "cursor-crosshair")}
                    style={{ width: "min(100cqw, 150cqh)" }}
                  >
                    <div className="absolute inset-0 overflow-hidden">
                      <div className="absolute inset-0 transition-transform duration-200" style={{ transform }}>
                        <SampleImage name={name} className="size-full" style={{ filter: compare ? undefined : filterCss(s) }} />
                        {!compare && s.adjust.vignette > 0 && (
                          <div
                            className="pointer-events-none absolute inset-0"
                            style={{
                              background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${s.adjust.vignette / 110}) 100%)`,
                            }}
                          />
                        )}
                      </div>
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
                          <span
                            key={handle}
                            aria-hidden
                            onPointerDown={(e) => startCropDrag(handle, e)}
                            className={cn("absolute z-10 size-9 touch-none", hit)}
                          >
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

                        {dragging && (
                          <span className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 rounded-md bg-black/70 px-2 py-1 text-xs font-medium whitespace-nowrap text-white tabular-nums">
                            {Math.round((crop.width / 100) * IMAGE_PX.w)} × {Math.round((crop.height / 100) * IMAGE_PX.h)} px
                          </span>
                        )}
                      </div>
                    )}

                    {/* Focus point */}
                    {tool === "focus" && (
                      <span
                        className="pointer-events-none absolute flex size-10 -translate-1/2 items-center justify-center rounded-full border-2 border-white bg-white/20 shadow-[0_0_0_2px_rgba(0,0,0,0.25)] transition-[left,top] duration-200"
                        style={{ left: `${s.focus.x}%`, top: `${s.focus.y}%` }}
                      >
                        <span className="size-2 rounded-full bg-white" />
                      </span>
                    )}

                    {compare && (
                      <span className="absolute top-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white">Original</span>
                    )}
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
                  <button
                    type="button"
                    onClick={() => setZoom(100)}
                    className="h-9 w-20 rounded-lg font-medium tabular-nums hover:bg-white/10"
                    title="Auf 100 % setzen"
                  >
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
                            onClick={() => commit({ aspect: a.value, crop: fitCrop(a.value) })}
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
                        <ToolButton label="Links drehen" icon={RotateCcw} onClick={() => commit({ rotation: s.rotation - 90 })} />
                        <ToolButton label="Rechts drehen" icon={RotateCw} onClick={() => commit({ rotation: s.rotation + 90 })} />
                        <ToolButton label="Horizontal spiegeln" icon={FlipHorizontal2} active={s.flipX} onClick={() => commit({ flipX: !s.flipX })} />
                        <ToolButton label="Vertikal spiegeln" icon={FlipVertical2} active={s.flipY} onClick={() => commit({ flipY: !s.flipY })} />
                      </div>
                    </div>
                    <Slider
                      label="Begradigen"
                      min={-15}
                      max={15}
                      value={s.straighten}
                      format={(v) => `${v > 0 ? "+" : ""}${v}°`}
                      onValueChange={(v) => preview({ straighten: v })}
                      onValueCommitted={(v) => commit({ straighten: v })}
                    />
                  </Panel>
                )}

                {tool === "adjust" && (
                  <Panel title="Anpassen" hint="Doppelklick auf einen Wert setzt ihn zurück.">
                    {adjustments.map((adj) => (
                      <Slider
                        key={adj.key}
                        label={adj.label}
                        min={adj.key === "vignette" || adj.key === "sharpness" ? 0 : -100}
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
                          <SampleImage name={name} className="aspect-square w-full rounded-lg" style={{ filter: f.css }} />
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </Panel>
                )}

                {tool === "focus" && (
                  <Panel title="Fokuspunkt" hint="Klicke ins Bild. Beim automatischen Zuschneiden für Mobilgeräte bleibt dieser Punkt sichtbar.">
                    <div className="flex items-center justify-between rounded-xl bg-subtle px-4 py-3 text-[15px]">
                      <span className="text-muted">Position</span>
                      <span className="font-medium tabular-nums">
                        {s.focus.x} % · {s.focus.y} %
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
                            <div className={cn("overflow-hidden rounded-lg", p.ratio)}>
                              <SampleImage
                                name={name}
                                className="h-full w-[150%]"
                                style={{ filter: filterCss(s), transform: `translateX(-${s.focus.x / 3}%)` }}
                              />
                            </div>
                            <span className="text-xs text-muted">{p.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Button variant="secondary" onClick={() => commit({ focus: { x: 50, y: 50 } })}>
                      Zur Mitte zurücksetzen
                    </Button>
                  </Panel>
                )}

                {tool === "details" && (
                  <Panel title="Details">
                    <Field>
                      <Label>Dateiname</Label>
                      <Input defaultValue={name} />
                    </Field>
                    <Field>
                      <Label>Alternativtext</Label>
                      <Input />
                      <Description>Beschreibt das Bild für Screenreader und Suchmaschinen.</Description>
                    </Field>
                    <Field>
                      <Label>Bildunterschrift</Label>
                      <Input />
                    </Field>
                    <div className="flex flex-col gap-5 border-t border-border pt-5">
                      <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">Auslieferung</h3>
                      <Select label="Format" items={formats} defaultValue="webp" />
                      <Select label="Maximale Breite" items={maxWidths} defaultValue="1920" />
                      <QualitySlider />
                    </div>
                    <div className="flex flex-col gap-2 border-t border-border pt-5">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          void navigator.clipboard?.writeText(`/uploads/${name}`);
                          toast.success("Link kopiert", { description: `/uploads/${name}` });
                        }}
                      >
                        <Link2 />
                        Link kopieren
                      </Button>
                      <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => setConfirmDelete(true)}>
                        <Trash2 />
                        Bild löschen
                      </Button>
                    </div>
                  </Panel>
                )}
              </aside>
            </div>
          </BaseDialog.Popup>
        </BaseDialog.Portal>
      </BaseDialog.Root>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`„${name}“ löschen?`}
        description="Seiten, die das Bild verwenden, zeigen danach eine Lücke."
        confirmLabel="Löschen"
        danger
        onConfirm={() => {
          close();
          toast.success(`„${name}“ gelöscht`);
        }}
      />
    </>
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

function ToolButton({
  label,
  icon: Icon,
  onClick,
  active,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
}) {
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

function QualitySlider() {
  const [quality, setQuality] = useState(82);
  return <Slider label="Qualität" min={40} max={100} value={quality} format={(v) => `${v} %`} onValueChange={setQuality} />;
}

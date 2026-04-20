"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import Compressor from "compressorjs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useProjects } from "@/components/project-context";
import { BucketSelector } from "@/components/bucket-selector";

const PAGE_SIZE = 40;
const COMPRESSIBLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp"]);
const IMAGE_TYPES_FOR_EFFECTS = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp"]);

type MediaFile = {
  id: string;
  name: string;
  type: string;
  size: string;
  dimensions: string;
  url: string;
  contentUrl?: string;
  uploadedAt: string;
  alt: string;
  isFolder?: boolean;
  previews?: string[];
};

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" x2="21" y1="6" y2="6" />
      <line x1="8" x2="21" y1="12" y2="12" />
      <line x1="8" x2="21" y1="18" y2="18" />
      <line x1="3" x2="3.01" y1="6" y2="6" />
      <line x1="3" x2="3.01" y1="12" y2="12" />
      <line x1="3" x2="3.01" y1="18" y2="18" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function CheckIcon({ checked }: { checked: boolean }) {
  return (
    <div className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
      checked ? "border-primary bg-primary text-primary-foreground" : "border-white/25 bg-transparent"
    }`}>
      {checked && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </div>
  );
}

function thumbUrl(url: string): string {
  if (!url || url.startsWith("/") || url.startsWith("blob:")) return url;
  return `/api/media/proxy?url=${encodeURIComponent(url)}`;
}

const mediaCache = new Map<string, { files: MediaFile[]; rootExists: boolean; ts: number }>();

function mediaCacheKey(folder: string, projectId?: string, bucketId?: string) {
  return `${projectId ?? ""}:${bucketId ?? ""}:${folder}`;
}

async function fetchMedia(folder: string, projectId?: string, bucketId?: string): Promise<{ files: MediaFile[]; rootExists: boolean }> {
  const params = new URLSearchParams({ folder });
  if (projectId) params.set("projectId", projectId);
  if (bucketId) params.set("bucketId", bucketId);
  const res = await fetch(`/api/media?${params}`);
  const data = await res.json();
  const result = { files: data.files ?? [], rootExists: data.rootExists !== false };
  mediaCache.set(mediaCacheKey(folder, projectId, bucketId), { ...result, ts: Date.now() });
  return result;
}

async function uploadFiles(files: File[], folder: string, projectId: string, bucketId?: string): Promise<void> {
  const formData = new FormData();
  formData.set("folder", folder);
  formData.set("projectId", projectId);
  if (bucketId) formData.set("bucketId", bucketId);
  for (const f of files) formData.append("files", f);
  await fetch("/api/media", { method: "POST", body: formData });
  await flushSync(projectId);
}

async function flushSync(projectId: string): Promise<void> {
  try {
    const res = await fetch(`/api/media/sync?projectId=${projectId}`);
    if (!res.ok) return;
    const { pending } = await res.json();
    if (pending > 0) {
      const syncRes = await fetch("/api/media/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!syncRes.ok) {
        const text = await syncRes.text().catch(() => "");
        let err: string;
        try { err = JSON.parse(text)?.error ?? text; } catch { err = text; }
        console.error("[media-sync] push failed:", syncRes.status, err);
      }
    }
  } catch (e) {
    console.error("[media-sync] flush error:", e);
  }
}

async function deleteMedia(paths: string[], projectId: string, bucketId?: string): Promise<void> {
  await fetch("/api/media", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths, projectId, ...(bucketId ? { bucketId } : {}) }),
  });
  await flushSync(projectId);
}

async function replaceMedia(existingPath: string, file: File, projectId: string, bucketId?: string): Promise<MediaFile | null> {
  const formData = new FormData();
  formData.set("projectId", projectId);
  formData.set("path", existingPath);
  formData.set("file", file);
  if (bucketId) formData.set("bucketId", bucketId);
  const res = await fetch("/api/media", { method: "PUT", body: formData });
  if (!res.ok) return null;
  const data = await res.json();
  await flushSync(projectId);
  return data.file ?? null;
}

async function createFolder(name: string, parent: string, projectId: string, bucketId?: string): Promise<boolean> {
  const res = await fetch("/api/media/folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parent, projectId, ...(bucketId ? { bucketId } : {}) }),
  });
  if (res.ok) await flushSync(projectId);
  return res.ok;
}

async function moveMedia(items: string[], destination: string, projectId: string, bucketId?: string): Promise<boolean> {
  const res = await fetch("/api/media", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, destination, projectId, ...(bucketId ? { bucketId } : {}) }),
  });
  if (res.ok) await flushSync(projectId);
  return res.ok;
}

async function renameMedia(item: string, newName: string, projectId: string, bucketId?: string): Promise<boolean> {
  const res = await fetch("/api/media", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rename: { item, newName }, projectId, ...(bucketId ? { bucketId } : {}) }),
  });
  if (res.ok) await flushSync(projectId);
  return res.ok;
}

type DialogMode = "default" | "crop" | "compress" | "customize" | "transform";

type EffectPreset = {
  id: string;
  label: string;
  filter: string;
  intensity: { min: number; max: number; default: number };
  buildFilter: (value: number) => string;
};

const EFFECT_PRESETS: EffectPreset[] = [
  { id: "brighten", label: "Brighten", filter: "brightness(1.4)", intensity: { min: 100, max: 200, default: 140 }, buildFilter: (v) => `brightness(${v / 100})` },
  { id: "darken", label: "Darken", filter: "brightness(0.6)", intensity: { min: 0, max: 100, default: 50 }, buildFilter: (v) => `brightness(${1 - v * 0.008})` },
  { id: "contrast", label: "Contrast", filter: "contrast(1.5)", intensity: { min: 100, max: 200, default: 150 }, buildFilter: (v) => `contrast(${v / 100})` },
  { id: "grayscale", label: "B&W", filter: "grayscale(1)", intensity: { min: 0, max: 100, default: 100 }, buildFilter: (v) => `grayscale(${v / 100})` },
  { id: "sepia", label: "Sepia", filter: "sepia(0.8)", intensity: { min: 0, max: 100, default: 80 }, buildFilter: (v) => `sepia(${v / 100})` },
  { id: "warm", label: "Warm", filter: "sepia(0.3) saturate(1.4)", intensity: { min: 0, max: 100, default: 60 }, buildFilter: (v) => `sepia(${v / 200}) saturate(${1 + v / 150})` },
  { id: "cool", label: "Cool", filter: "hue-rotate(30deg) saturate(0.8)", intensity: { min: 0, max: 100, default: 50 }, buildFilter: (v) => `hue-rotate(${v * 0.6}deg) saturate(${1 - v / 300})` },
  { id: "vintage", label: "Vintage", filter: "sepia(0.4) contrast(1.2) brightness(0.9)", intensity: { min: 0, max: 100, default: 70 }, buildFilter: (v) => `sepia(${v / 200}) contrast(${1 + v / 400}) brightness(${1 - v / 700})` },
  { id: "dramatic", label: "Dramatic", filter: "contrast(1.4) saturate(0.6) brightness(0.9)", intensity: { min: 0, max: 100, default: 70 }, buildFilter: (v) => `contrast(${1 + v / 200}) saturate(${1 - v / 250}) brightness(${1 - v / 600})` },
  { id: "blur", label: "Blur", filter: "blur(4px)", intensity: { min: 0, max: 20, default: 4 }, buildFilter: (v) => `blur(${v}px)` },
  { id: "invert", label: "Invert", filter: "invert(1)", intensity: { min: 0, max: 100, default: 100 }, buildFilter: (v) => `invert(${v / 100})` },
  { id: "hue", label: "Hue Shift", filter: "hue-rotate(180deg)", intensity: { min: 0, max: 360, default: 180 }, buildFilter: (v) => `hue-rotate(${v}deg)` },
];


function CompareSlider({ originalUrl, compressedUrl }: { originalUrl: string; compressedUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (dragging.current) updatePosition(e.clientX); };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [updatePosition]);

  return (
    <div ref={containerRef} className="relative h-full w-full select-none overflow-hidden cursor-col-resize" onMouseDown={(e) => { dragging.current = true; updatePosition(e.clientX); }}>
      <img src={compressedUrl} alt="Compressed" className="absolute inset-0 h-full w-full object-contain" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <img src={originalUrl} alt="Original" className="h-full w-full object-contain" />
      </div>
      <div className="absolute top-0 bottom-0" style={{ left: `${position}%` }}>
        <div className="absolute inset-y-0 -translate-x-1/2 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.5)]" />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-700"><path d="M18 8l4 4-4 4" /><path d="M6 8l-4 4 4 4" /></svg>
        </div>
      </div>
      <div className="absolute top-3 left-3 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">Original</div>
      <div className="absolute top-3 right-3 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">Compressed</div>
    </div>
  );
}

function SaveActions({ onReplace, onSaveNew, disabled, saving, onCancel }: { onReplace: () => void; onSaveNew: () => void; disabled?: boolean; saving?: boolean; onCancel: () => void }) {
  const isDisabled = disabled || saving;
  const spinner = <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>;
  return (
    <div className="mt-auto pt-4 flex flex-col gap-2">
      <div className="flex rounded-md border border-border">
        <button
          onClick={onReplace}
          disabled={isDisabled}
          className="group relative flex flex-1 items-center justify-center gap-1.5 rounded-l-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-foreground hover:bg-muted/50 disabled:hover:bg-transparent"
        >
          {saving ? spinner : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>}
          Replace
          {!saving && <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">Replace original file</span>}
        </button>
        <div className="w-px bg-border" />
        <button
          onClick={onSaveNew}
          disabled={isDisabled}
          className="group relative flex flex-1 items-center justify-center gap-1.5 rounded-r-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-foreground hover:bg-muted/50 disabled:hover:bg-transparent"
        >
          {saving ? spinner : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M12 18v-6" /><path d="M9 15h6" /></svg>}
          Save copy
          {!saving && <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">Save as new file</span>}
        </button>
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={onCancel} disabled={saving}>Cancel</Button>
    </div>
  );
}

const ASPECT_OPTIONS = [
  { label: "Free", value: undefined },
  { label: "1:1", value: 1 },
  { label: "16:9", value: 16 / 9 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
] as const;

function MediaPreviewDialog({ file, open, onOpenChange, onDelete, onSave, onRename, readOnly }: {
  file: MediaFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: string) => void;
  onSave: (blob: Blob, filename: string, replaceId: string | null) => void;
  onRename: (file: MediaFile, newName: string) => void;
  readOnly?: boolean;
}) {
  const lastFile = useRef(file);
  useEffect(() => { if (file) lastFile.current = file; }, [file]);
  const displayFile = file ?? lastFile.current;

  const [mode, setMode] = useState<DialogMode>("default");
  const imgRef = useRef<HTMLImageElement>(null);

  // Crop
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // Compress
  const [quality, setQuality] = useState(1);
  const [compressing, setCompressing] = useState(false);
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const compressedUrlRef = useRef<string | null>(null);
  compressedUrlRef.current = compressedUrl;
  const [saving, setSaving] = useState(false);

  // Inline rename
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback(() => {
    if (!displayFile) return;
    setNameValue(displayFile.name);
    setEditingName(true);
  }, [displayFile]);

  const commitRename = useCallback(() => {
    const trimmed = nameValue.trim();
    if (trimmed && displayFile && trimmed !== displayFile.name) {
      onRename(displayFile, trimmed);
    }
    setEditingName(false);
  }, [nameValue, displayFile, onRename]);

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      const dot = nameValue.lastIndexOf(".");
      nameInputRef.current.setSelectionRange(0, dot > 0 ? dot : nameValue.length);
    }
  }, [editingName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Customize — effects (multiple stacking)
  const [effects, setEffects] = useState<Record<string, number>>({});
  const [focusedEffect, setFocusedEffect] = useState<string | null>(null);
  const [effectPage, setEffectPage] = useState(0);
  const effectSliderRef = useRef<HTMLDivElement>(null);
  const effectDragRef = useRef<{ startX: number; startPage: number } | null>(null);

  const [detectedAsImage, setDetectedAsImage] = useState(false);

  useEffect(() => {
    if (!displayFile || displayFile.isFolder) { setDetectedAsImage(false); return; }
    if (COMPRESSIBLE_TYPES.has(displayFile.type)) { setDetectedAsImage(true); return; }
    const img = new Image();
    img.onload = () => setDetectedAsImage(true);
    img.onerror = () => setDetectedAsImage(false);
    img.src = displayFile.url;
  }, [displayFile]);

  const isCompressible = detectedAsImage;
  const isImage = detectedAsImage;

  const hasEffects = Object.keys(effects).length > 0;
  const focusedPreset = EFFECT_PRESETS.find((p) => p.id === focusedEffect);
  const activeFilter = hasEffects
    ? Object.entries(effects).map(([id, intensity]) => {
        const preset = EFFECT_PRESETS.find((p) => p.id === id);
        return preset ? preset.buildFilter(intensity) : "";
      }).filter(Boolean).join(" ")
    : "none";

  const startCropWithAspect = useCallback((a: number | undefined) => {
    setAspect(a);
    const img = imgRef.current;
    if (!img) return;
    if (a) {
      setCrop(centerCrop(makeAspectCrop({ unit: "%", width: 70 }, a, img.naturalWidth, img.naturalHeight), img.naturalWidth, img.naturalHeight));
    } else {
      setCrop({ unit: "%", x: 15, y: 15, width: 70, height: 70 });
    }
  }, []);

  const onImageLoad = useCallback(() => {
    setCrop({ unit: "%", x: 15, y: 15, width: 70, height: 70 });
  }, []);

  const resetAll = useCallback(() => {
    setMode("default");
    setCrop(undefined);
    setCompletedCrop(undefined);
    setAspect(undefined);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setQuality(1);
    setCompressing(false);
    setCompressedBlob(null);
    if (compressedUrlRef.current) URL.revokeObjectURL(compressedUrlRef.current);
    setCompressedUrl(null);
    setOriginalSize(null);
    setEffects({});
    setFocusedEffect(null);
    setEditingName(false);
    setSaving(false);
  }, []);

  const handleCropSave = useCallback((asNew: boolean) => {
    if (!displayFile || !imgRef.current) return;
    const img = imgRef.current;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    const hasCrop = completedCrop && completedCrop.width > 0 && completedCrop.height > 0;
    const srcX = hasCrop ? completedCrop.x * scaleX : 0;
    const srcY = hasCrop ? completedCrop.y * scaleY : 0;
    const srcW = hasCrop ? completedCrop.width * scaleX : img.naturalWidth;
    const srcH = hasCrop ? completedCrop.height * scaleY : img.naturalHeight;

    const normRotation = ((rotation % 360) + 360) % 360;
    const isRotated90 = normRotation === 90 || normRotation === 270;
    const outW = isRotated90 ? srcH : srcW;
    const outH = isRotated90 ? srcW : srcH;

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.translate(outW / 2, outH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(img, srcX, srcY, srcW, srcH, -srcW / 2, -srcH / 2, srcW, srcH);

    const outputType = COMPRESSIBLE_TYPES.has(displayFile.type) ? displayFile.type : "image/png";
    canvas.toBlob((blob) => {
      if (!blob) return;
      const name = asNew ? displayFile.name.replace(/(\.[^.]+)$/, "-cropped$1") : displayFile.name;
      onSave(blob, name, asNew ? null : displayFile.id);
      onOpenChange(false);
    }, outputType);
  }, [completedCrop, displayFile, onSave, onOpenChange, rotation, flipH, flipV]);

  const runCompression = useCallback(async (q: number) => {
    if (!displayFile) return;
    setCompressing(true);
    try {
      const fetchUrl = displayFile.url.startsWith("/")
        ? displayFile.url
        : `/api/media/proxy?url=${encodeURIComponent(displayFile.url)}`;
      const res = await fetch(fetchUrl);
      const originalBlob = await res.blob();
      setOriginalSize(originalBlob.size);
      const blobType = COMPRESSIBLE_TYPES.has(originalBlob.type) ? originalBlob.type : "image/jpeg";
      const f = new File([originalBlob], displayFile.name, { type: blobType });
      new Compressor(f, {
        quality: q,
        success(result) {
          if (compressedUrlRef.current) URL.revokeObjectURL(compressedUrlRef.current);
          const url = URL.createObjectURL(result);
          setCompressedBlob(result);
          setCompressedUrl(url);
          setCompressing(false);
        },
        error() { setCompressing(false); },
      });
    } catch { setCompressing(false); }
  }, [displayFile]);

  const handleCompressSave = useCallback((asNew: boolean) => {
    if (!compressedBlob || !displayFile) return;
    const name = asNew ? displayFile.name.replace(/(\.[^.]+)$/, "-compressed$1") : displayFile.name;
    onSave(compressedBlob, name, asNew ? null : displayFile.id);
    onOpenChange(false);
  }, [compressedBlob, displayFile, onSave, onOpenChange]);

  const handleCustomizeSave = useCallback((asNew: boolean) => {
    if (!displayFile) return;
    const img = new Image();
    const loadUrl = displayFile.url.startsWith("/")
      ? displayFile.url
      : `/api/media/proxy?url=${encodeURIComponent(displayFile.url)}`;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.filter = activeFilter;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const name = asNew ? displayFile.name.replace(/(\.[^.]+)$/, "-edited$1") : displayFile.name;
        onSave(blob, name, asNew ? null : displayFile.id);
        onOpenChange(false);
      }, "image/png");
    };
    img.src = loadUrl;
  }, [displayFile, activeFilter, onSave, onOpenChange]);

  useEffect(() => { if (!open) resetAll(); }, [open, resetAll]);
  useEffect(() => { resetAll(); }, [file, resetAll]);

  // Compress when quality slider changes below 100%
  useEffect(() => {
    if (mode === "compress" && quality < 1) runCompression(quality);
  }, [quality]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!displayFile) return null;

  const imgSrc = displayFile.url.startsWith("/")
    ? displayFile.url
    : `/api/media/proxy?url=${encodeURIComponent(displayFile.url)}`;

  const formatSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  const reduction = originalSize && compressedBlob ? Math.round((1 - compressedBlob.size / originalSize) * 100) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-4xl p-0 gap-0 overflow-hidden">
        <div className="flex h-[520px]">
          {/* Image area */}
          <div className="relative flex flex-1 items-center justify-center bg-black/20 p-6 overflow-hidden">
            {mode === "crop" ? (
              <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)} aspect={aspect} className="max-h-[472px] max-w-full [&>div]:max-h-[472px]">
                <img ref={imgRef} src={imgSrc} alt={displayFile.alt} onLoad={onImageLoad} className="max-h-[472px] max-w-full object-contain block" />
              </ReactCrop>
            ) : mode === "compress" && compressedUrl ? (
              <CompareSlider originalUrl={displayFile.url} compressedUrl={compressedUrl} />
            ) : mode === "transform" ? (
              <img ref={imgRef} src={imgSrc} alt={displayFile.alt} onLoad={onImageLoad} className="max-h-full max-w-full rounded-md object-contain transition-transform duration-150" style={{ transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})` }} />
            ) : mode === "customize" ? (
              <img src={displayFile.url} alt={displayFile.alt} className="max-h-full max-w-full rounded-md object-contain transition-[filter] duration-150" style={{ filter: activeFilter }} />
            ) : (
              <img src={displayFile.url} alt={displayFile.alt} className="max-h-full max-w-full rounded-md object-contain" />
            )}
            {mode === "compress" && compressing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <div className="flex items-center gap-2 rounded-lg bg-black/70 px-4 py-2 text-sm text-white">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>
                  Optimizing...
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="flex w-72 shrink-0 flex-col border-l border-border p-5 overflow-y-auto">
            {mode === "crop" ? (
              <>
                <h3 className="text-sm font-medium">Crop Image</h3>
                <p className="text-xs text-muted-foreground mt-1">Drag edges or corners to adjust</p>
                <Separator className="my-4" />
                <div className="flex flex-col gap-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Aspect Ratio</span>
                  <div className="flex flex-wrap gap-1.5">
                    {ASPECT_OPTIONS.map((opt) => (
                      <button key={opt.label} onClick={() => startCropWithAspect(opt.value)} className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${aspect === opt.value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <SaveActions onReplace={() => handleCropSave(false)} onSaveNew={() => handleCropSave(true)} saving={saving} onCancel={resetAll} />
              </>
            ) : mode === "compress" ? (
              <>
                <h3 className="text-sm font-medium">Optimize Image</h3>
                <p className="text-xs text-muted-foreground mt-1">Pick a preset or adjust manually</p>
                <Separator className="my-4" />
                <div className="flex flex-col gap-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preset</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { label: "Light", value: 0.85, desc: "85%" },
                      { label: "Medium", value: 0.6, desc: "60%" },
                      { label: "Heavy", value: 0.3, desc: "30%" },
                    ] as const).map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setQuality(preset.value)}
                        className={`flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 text-xs transition-colors ${
                          quality === preset.value
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                        }`}
                      >
                        <span className="font-medium">{preset.label}</span>
                        <span className="text-[10px] text-muted-foreground">{preset.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3 mt-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quality</span>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0.1} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="flex-1 accent-primary" />
                    <span className="text-xs font-medium tabular-nums w-8 text-right">{Math.round(quality * 100)}%</span>
                  </div>
                </div>
                {originalSize && compressedBlob && (
                  <>
                    <Separator className="my-4" />
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Original</span><span>{formatSize(originalSize)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Compressed</span><span>{formatSize(compressedBlob.size)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Reduction</span><span className={reduction && reduction > 0 ? "text-emerald-400 font-medium" : ""}>{reduction !== null ? `${reduction}%` : "—"}</span></div>
                    </div>
                  </>
                )}
                <SaveActions onReplace={() => handleCompressSave(false)} onSaveNew={() => handleCompressSave(true)} disabled={!compressedBlob} saving={saving} onCancel={resetAll} />
              </>
            ) : mode === "customize" ? (
              <>
                <h3 className="text-sm font-medium">Effects</h3>
                <p className="text-xs text-muted-foreground mt-1">Pick an effect, then fine-tune</p>
                <Separator className="my-4" />

                {/* Effect preset carousel — 6 per page */}
                {(() => {
                  const perPage = 6;
                  const totalPages = Math.ceil(EFFECT_PRESETS.length / perPage);
                  const pagePresets = EFFECT_PRESETS.slice(effectPage * perPage, effectPage * perPage + perPage);

                  const handleDragStart = (clientX: number) => {
                    effectDragRef.current = { startX: clientX, startPage: effectPage };
                  };
                  const handleDragEnd = (clientX: number) => {
                    if (!effectDragRef.current) return;
                    const diff = effectDragRef.current.startX - clientX;
                    if (Math.abs(diff) > 40) {
                      if (diff > 0 && effectPage < totalPages - 1) setEffectPage(effectPage + 1);
                      else if (diff < 0 && effectPage > 0) setEffectPage(effectPage - 1);
                    }
                    effectDragRef.current = null;
                  };

                  return (
                    <div>
                      <div
                        ref={effectSliderRef}
                        className="grid grid-cols-3 gap-1.5 select-none"
                        onMouseDown={(e) => handleDragStart(e.clientX)}
                        onMouseUp={(e) => handleDragEnd(e.clientX)}
                        onMouseLeave={(e) => { if (effectDragRef.current) handleDragEnd(e.clientX); }}
                        onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
                        onTouchEnd={(e) => handleDragEnd(e.changedTouches[0].clientX)}
                      >
                        {pagePresets.map((preset) => {
                          const isActive = preset.id in effects;
                          const isFocused = focusedEffect === preset.id;
                          return (
                            <button
                              key={preset.id}
                              onClick={() => {
                                if (effectDragRef.current) return;
                                if (isActive && isFocused) {
                                  // Remove effect
                                  setEffects((prev) => { const next = { ...prev }; delete next[preset.id]; return next; });
                                  setFocusedEffect(null);
                                } else if (isActive) {
                                  // Focus existing effect for intensity editing
                                  setFocusedEffect(preset.id);
                                } else {
                                  // Add effect at minimum (0%)
                                  setEffects((prev) => ({ ...prev, [preset.id]: preset.intensity.min }));
                                  setFocusedEffect(preset.id);
                                }
                              }}
                              className={`group flex flex-col items-center gap-1 rounded-md border p-1 transition-colors ${isFocused ? "border-primary bg-primary/10" : isActive ? "border-primary/50" : "border-border hover:border-foreground/20"}`}
                            >
                              <div className="aspect-square w-full overflow-hidden rounded-sm bg-muted/30">
                                <img src={displayFile.url} alt="" className="h-full w-full object-cover" draggable={false} style={{ filter: preset.filter }} />
                              </div>
                              <span className={`text-[10px] leading-tight ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>{preset.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Arrows + dots on the same line */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-2">
                          <button
                            onClick={() => setEffectPage(Math.max(0, effectPage - 1))}
                            disabled={effectPage === 0}
                            className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                          </button>
                          <div className="flex items-center gap-1.5">
                            {Array.from({ length: totalPages }, (_, i) => (
                              <button
                                key={i}
                                onClick={() => setEffectPage(i)}
                                className={`rounded-full transition-all ${effectPage === i ? "w-2 h-2 bg-primary" : "w-1.5 h-1.5 bg-muted-foreground/40 hover:bg-muted-foreground"}`}
                              />
                            ))}
                          </div>
                          <button
                            onClick={() => setEffectPage(Math.min(totalPages - 1, effectPage + 1))}
                            disabled={effectPage === totalPages - 1}
                            className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Intensity slider for focused effect */}
                {focusedPreset && focusedEffect && focusedEffect in effects && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{focusedPreset.label} intensity</span>
                      <span className="text-xs font-medium tabular-nums">{effects[focusedEffect]}</span>
                    </div>
                    <input type="range" min={focusedPreset.intensity.min} max={focusedPreset.intensity.max} step={1} value={effects[focusedEffect]} onChange={(e) => setEffects((prev) => ({ ...prev, [focusedEffect]: Number(e.target.value) }))} className="w-full accent-primary" />
                  </div>
                )}

                {/* Reset all effects */}
                {hasEffects && (
                  <button
                    onClick={() => { setEffects({}); setFocusedEffect(null); }}
                    className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    Reset all effects
                  </button>
                )}

                <SaveActions onReplace={() => handleCustomizeSave(false)} onSaveNew={() => handleCustomizeSave(true)} disabled={!hasEffects} saving={saving} onCancel={resetAll} />
              </>
            ) : mode === "transform" ? (
              <>
                <h3 className="text-sm font-medium">Transform</h3>
                <p className="text-xs text-muted-foreground mt-1">Rotate or flip the image</p>
                <Separator className="my-4" />
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rotate</span>
                    {rotation % 360 !== 0 && <span className="text-xs tabular-nums text-muted-foreground">{((rotation % 360) + 360) % 360}°</span>}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setRotation((r) => r - 90)} className="flex items-center justify-center rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors text-muted-foreground hover:text-foreground hover:border-foreground/20" title="Rotate left 90°">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                      <span className="ml-1.5">90°</span>
                    </button>
                    <button onClick={() => setRotation((r) => r + 90)} className="flex items-center justify-center rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors text-muted-foreground hover:text-foreground hover:border-foreground/20" title="Rotate right 90°">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
                      <span className="ml-1.5">90°</span>
                    </button>
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="flex flex-col gap-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Flip</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => setFlipH((f) => !f)} className={`flex items-center justify-center rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${flipH ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"}`} title="Flip horizontal">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 7 5 5-5 5V7" /><path d="m21 7-5 5 5 5V7" /><path d="M12 20v2" /><path d="M12 14v2" /><path d="M12 8v2" /><path d="M12 2v2" /></svg>
                      <span className="ml-1.5">Horizontal</span>
                    </button>
                    <button onClick={() => setFlipV((f) => !f)} className={`flex items-center justify-center rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${flipV ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"}`} title="Flip vertical">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 3-5 5-5-5h10" /><path d="m17 21-5-5-5 5h10" /><path d="M4 12H2" /><path d="M10 12H8" /><path d="M16 12h-2" /><path d="M22 12h-2" /></svg>
                      <span className="ml-1.5">Vertical</span>
                    </button>
                  </div>
                </div>
                <SaveActions onReplace={() => handleCropSave(false)} onSaveNew={() => handleCropSave(true)} disabled={rotation % 360 === 0 && !flipH && !flipV} saving={saving} onCancel={resetAll} />
              </>
            ) : (
              <>
                {editingName ? (
                  <input
                    ref={nameInputRef}
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingName(false); }}
                    className="text-sm font-medium truncate bg-transparent border-b border-primary outline-none w-full py-0.5"
                  />
                ) : (
                  <h3 className={`text-sm font-medium truncate ${readOnly ? "" : "cursor-pointer hover:text-primary"} transition-colors`} onDoubleClick={readOnly ? undefined : startRename}>{displayFile.name}</h3>
                )}
                <p className="text-xs text-muted-foreground mt-1">{displayFile.alt}</p>
                <Separator className="my-4" />
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Type</span><span>{displayFile.type}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Size</span><span>{displayFile.size}</span></div>
                  {displayFile.dimensions && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Dimensions</span><span>{displayFile.dimensions}</span></div>}
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Uploaded</span><span>{displayFile.uploadedAt}</span></div>
                </div>
                <Separator className="my-4" />
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-muted-foreground">URL</span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{displayFile.contentUrl ?? displayFile.url}</code>
                    <Button variant="outline" size="xs" onClick={() => { navigator.clipboard.writeText(displayFile.contentUrl ?? displayFile.url); toast.success("URL copied to clipboard"); }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                    </Button>
                  </div>
                </div>
                <div className="mt-auto pt-4 flex flex-col gap-2">
                  {/* Button group: Crop | Optimize | Effects | Transform | Download */}
                  <div className="flex rounded-md border border-border">
                    {!readOnly && (
                      <>
                        <button onClick={() => setMode("crop")} title="Crop" className="group relative flex flex-1 items-center justify-center rounded-l-md px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M18 22V8a2 2 0 0 0-2-2H2" /></svg>
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">Crop</span>
                        </button>
                        <div className="w-px bg-border" />
                        <button
                          onClick={() => isCompressible && setMode("compress")}
                          disabled={!isCompressible}
                          title="Optimize"
                          className="group relative flex flex-1 items-center justify-center px-3 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /></svg>
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">Optimize</span>
                        </button>
                        <div className="w-px bg-border" />
                        <button
                          onClick={() => isImage && setMode("customize")}
                          disabled={!isImage}
                          title="Effects"
                          className="group relative flex flex-1 items-center justify-center px-3 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" /><line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" /><line x1="20" x2="20" y1="21" y2="16" /><line x1="20" x2="20" y1="12" y2="3" /><line x1="2" x2="6" y1="14" y2="14" /><line x1="10" x2="14" y1="8" y2="8" /><line x1="18" x2="22" y1="16" y2="16" /></svg>
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">Effects</span>
                        </button>
                        <div className="w-px bg-border" />
                        <button
                          onClick={() => isImage && setMode("transform")}
                          disabled={!isImage}
                          title="Transform"
                          className="group relative flex flex-1 items-center justify-center px-3 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">Transform</span>
                        </button>
                        <div className="w-px bg-border" />
                      </>
                    )}
                    <button
                      onClick={() => { const a = document.createElement("a"); a.href = displayFile.url; a.download = displayFile.name; a.click(); }}
                      title="Download"
                      className={`group relative flex flex-1 items-center justify-center ${readOnly ? "rounded-md" : "rounded-r-md"} px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">Download</span>
                    </button>
                  </div>
                  {!readOnly && <Button variant="destructive" size="sm" className="w-full" onClick={() => { onDelete(displayFile.id); onOpenChange(false); }}>Delete File</Button>}
                </div>
              </>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkBar({ count, onDelete, onClear }: { count: number; onDelete: () => void; onClear: () => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-lg border border-border bg-popover px-4 py-2.5 shadow-lg ring-1 ring-foreground/10">
      <span className="text-sm font-medium">{count} selected</span>
      <Separator orientation="vertical" className="h-5" />
      <Button variant="destructive" size="sm" onClick={onDelete}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
        Delete
      </Button>
      <button onClick={onClear} className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
      </button>
    </div>
  );
}

function NewFolderDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName("");
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setName(""); }}>
      <DialogContent className="sm:max-w-sm">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-base font-medium">New Folder</h3>
            <p className="text-sm text-muted-foreground mt-1">Enter a name for the folder.</p>
          </div>
          <Input placeholder="Folder name" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") handleSubmit(); }} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { onOpenChange(false); setName(""); }}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!name.trim()}>Create</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Breadcrumbs({ path, onNavigate, onDrop, onDragMove, dropTarget }: {
  path: string;
  onNavigate: (folder: string) => void;
  onDrop?: (folder: string) => void;
  onDragMove?: (x: number, y: number) => void;
  dropTarget?: string | null;
}) {
  const segments = path ? path.split("/") : [];

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    onDragMove?.(e.clientX, e.clientY);
  }

  return (
    <div className="flex items-center gap-1 text-sm -ml-1.5">
      <button
        onClick={() => onNavigate("")}
        onDragOver={(e) => { handleDragOver(e); }}
        onDragEnter={(e) => { e.preventDefault(); e.currentTarget.dataset.over = "true"; }}
        onDragLeave={(e) => { e.currentTarget.dataset.over = "false"; }}
        onDrop={(e) => { e.preventDefault(); e.currentTarget.dataset.over = "false"; onDrop?.(""); }}
        className={`rounded px-1.5 py-0.5 transition-colors ${
          dropTarget === ""
            ? "bg-primary/10 text-primary ring-1 ring-primary/30"
            : segments.length === 0
              ? "text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground"
        } data-[over=true]:bg-primary/10 data-[over=true]:text-primary data-[over=true]:ring-1 data-[over=true]:ring-primary/30`}
      >
        Media
      </button>
      {segments.map((seg, i) => {
        const segPath = segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        return (
          <div key={segPath} className="flex items-center gap-1">
            <span className="text-muted-foreground/50">/</span>
            <button
              onClick={() => onNavigate(segPath)}
              onDragOver={(e) => { if (!isLast) handleDragOver(e); }}
              onDragEnter={(e) => { if (!isLast) { e.preventDefault(); e.currentTarget.dataset.over = "true"; } }}
              onDragLeave={(e) => { e.currentTarget.dataset.over = "false"; }}
              onDrop={(e) => { if (!isLast) { e.preventDefault(); e.currentTarget.dataset.over = "false"; onDrop?.(segPath); } }}
              className={`rounded px-1.5 py-0.5 transition-colors ${
                isLast
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              } data-[over=true]:bg-primary/10 data-[over=true]:text-primary data-[over=true]:ring-1 data-[over=true]:ring-primary/30`}
            >
              {seg}
            </button>
          </div>
        );
      })}
    </div>
  );
}

type ContextMenuState = { x: number; y: number; file: MediaFile } | null;

function ContextMenu({ state, currentFolder, selectedCount, onClose, onOpen, onRename, onCopyUrl, onDownload, onMoveUp, onDelete, onDeleteSelected, onMoveUpSelected, readOnly }: {
  state: ContextMenuState;
  currentFolder: string;
  selectedCount: number;
  onClose: () => void;
  onOpen: (file: MediaFile) => void;
  onRename: (file: MediaFile) => void;
  onCopyUrl: (file: MediaFile) => void;
  onDownload: (file: MediaFile) => void;
  onMoveUp: (file: MediaFile) => void;
  onDelete: (file: MediaFile) => void;
  onDeleteSelected: () => void;
  onMoveUpSelected: () => void;
  readOnly?: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKey); };
  }, [state, onClose]);

  if (!state) return null;

  // Multi-select: show move up + delete (hide for viewers)
  if (selectedCount > 1) {
    if (readOnly) return null;
    return (
      <div
        ref={menuRef}
        className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-lg ring-1 ring-foreground/5"
        style={{ top: state.y, left: state.x }}
      >
        {currentFolder && (
          <button
            onClick={() => { onMoveUpSelected(); onClose(); }}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
            Move {selectedCount} to parent folder
          </button>
        )}
        {currentFolder && <div className="my-1 h-px bg-border" />}
        <button
          onClick={() => { onDeleteSelected(); onClose(); }}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
          Delete {selectedCount} items
        </button>
      </div>
    );
  }

  const items: { label: string; icon: React.ReactNode; action: () => void; destructive?: boolean; separator?: boolean }[] = [
    {
      label: state.file.isFolder ? "Open folder" : "Open",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>,
      action: () => onOpen(state.file),
    },
    ...(!readOnly ? [{
      label: "Rename",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>,
      action: () => onRename(state.file),
    }] : []),
    ...(!state.file.isFolder ? [{
      label: "Copy URL",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>,
      action: () => onCopyUrl(state.file),
    }] : []),
    ...(!state.file.isFolder ? [{
      label: "Download",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>,
      action: () => onDownload(state.file),
    }] : []),
    ...(!readOnly && currentFolder ? [{
      label: "Move to parent folder",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>,
      action: () => onMoveUp(state.file),
      separator: true,
    }] : []),
    ...(!readOnly ? [{
      label: "Delete",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>,
      action: () => onDelete(state.file),
      destructive: true,
      separator: true,
    }] : []),
  ];

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-lg ring-1 ring-foreground/5 animate-in fade-in zoom-in-95 duration-100"
      style={{ top: state.y, left: state.x }}
    >
      {items.map((item, i) => (
        <div key={item.label}>
          {item.separator && i > 0 && <div className="my-1 h-px bg-border" />}
          <button
            onClick={() => { item.action(); onClose(); }}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              item.destructive
                ? "text-destructive hover:bg-destructive/10"
                : "text-foreground hover:bg-muted/50"
            }`}
          >
            <span className={item.destructive ? "text-destructive" : "text-muted-foreground"}>{item.icon}</span>
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

function RenameDialog({ file, open, onOpenChange, onRename }: {
  file: MediaFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (file: MediaFile, newName: string) => void;
}) {
  const [name, setName] = useState("");
  useEffect(() => { if (file && open) setName(file.name); }, [file, open]);

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed || !file) return;
    onRename(file, trimmed);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setName(""); }}>
      <DialogContent className="sm:max-w-sm">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-base font-medium">Rename</h3>
            <p className="text-sm text-muted-foreground mt-1">Enter a new name.</p>
          </div>
          <Input
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") handleSubmit(); }}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { onOpenChange(false); setName(""); }}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!name.trim() || name.trim() === file?.name}>Rename</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MediaPage() {
  const { current, updateProject } = useProjects();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    if (current && !current.onboardingComplete) router.replace("/");
  }, [current, router]);

  const readOnly = current?.role === "viewer";

  const [view, setViewState] = useState<"grid" | "list">("grid");
  useEffect(() => {
    const saved = localStorage.getItem("media-view");
    if (saved === "grid" || saved === "list") setViewState(saved);
  }, []);
  const setView = useCallback((v: "grid" | "list") => {
    setViewState(v);
    localStorage.setItem("media-view", v);
  }, []);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [mediaRootExists, setMediaRootExists] = useState(true);
  const [currentFolder, setCurrentFolder] = useState(() => searchParams.get("folder") ?? "");
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<MediaFile | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingFileIds, setSavingFileIds] = useState<Set<string>>(new Set());
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [nearBreadcrumb, setNearBreadcrumb] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [buckets, setBuckets] = useState<{ id: string; name: string; provider: string; isDefault: boolean }[]>([]);
  const [activeBucketId, setActiveBucketId] = useState<string | undefined>();
  const [bucketsLoaded, setBucketsLoaded] = useState(false);
  const bucketsReadyRef = useRef(false);
  const activeBucket = buckets.find((b) => b.id === activeBucketId);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const emptyImg = useRef<HTMLImageElement | null>(null);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const projectId = current?.id ?? null;

  useEffect(() => {
    if (!projectId) return;
    mediaCache.clear();
    bucketsReadyRef.current = false;
    setCurrentFolder("");
    setSelectedIds(new Set());
    setMediaRootExists(true);
    setBucketsLoaded(false);
    setBuckets([]);
    setActiveBucketId(undefined);

    const cached = mediaCache.get(mediaCacheKey("", projectId));
    if (cached) {
      setFiles(cached.files);
      setMediaRootExists(cached.rootExists);
      setLoading(false);
    } else {
      setFiles([]);
      setLoading(true);
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/buckets`);
        const data = await res.json();
        if (cancelled) return;
        const list = data.buckets ?? data ?? [];
        setBuckets(list);
        const def = list.find((b: { id: string; isDefault: boolean }) => b.isDefault) ?? list[0];
        const bid = def?.id;
        setActiveBucketId(bid);
        bucketsReadyRef.current = true;
        setBucketsLoaded(true);
        const result = await fetchMedia("", projectId, bid);
        if (cancelled) return;
        setFiles(result.files);
        setMediaRootExists(result.rootExists);
      } catch { /* */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const loadFiles = useCallback(async (folder: string, silent = false) => {
    const cacheKey = mediaCacheKey(folder, projectId ?? undefined, activeBucketId);
    const cached = mediaCache.get(cacheKey);
    if (!silent && cached) {
      setFiles(cached.files);
      setMediaRootExists(cached.rootExists);
      setSelectedIds(new Set());
      setSelectMode("none");
    } else if (!silent) {
      setLoading(true);
      setSelectedIds(new Set());
      setSelectMode("none");
    }
    try {
      const result = await fetchMedia(folder, projectId ?? undefined, activeBucketId);
      setFiles(result.files);
      setMediaRootExists(result.rootExists);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [projectId, activeBucketId]);

  useEffect(() => { if (bucketsLoaded && bucketsReadyRef.current) loadFiles(currentFolder); }, [currentFolder, loadFiles, bucketsLoaded]);

  useEffect(() => { setDisplayCount(PAGE_SIZE); }, [currentFolder, activeBucketId]);

  const hasMore = files.length > displayCount;
  const visibleFiles = hasMore ? files.slice(0, displayCount) : files;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setDisplayCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [files.length, displayCount]);

  // Deep-link: open a specific file via sessionStorage
  const pendingOpenRef = useRef<{ fileId: string; folder: string } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("media-open");
    if (!raw) return;
    sessionStorage.removeItem("media-open");
    try {
      const { fileId, folder } = JSON.parse(raw);
      pendingOpenRef.current = { fileId, folder };
      if (folder !== currentFolder) {
        setCurrentFolder(folder);
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Once files load, open the pending file
  useEffect(() => {
    if (!pendingOpenRef.current || loading || files.length === 0) return;
    const { fileId } = pendingOpenRef.current;
    pendingOpenRef.current = null;
    const target = files.find((f) => f.id === fileId);
    if (target && !target.isFolder) setPreview(target);
  }, [files, loading]);

  const navigateToFolder = useCallback((folder: string) => { setCurrentFolder(folder); }, []);
  const handleFolderClick = useCallback((file: MediaFile) => { setCurrentFolder(file.id); }, []);

  const handleUpload = useCallback(async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    if (!current || readOnly) return;
    setUploading(true);
    setPendingNewCount((c) => c + arr.length);
    try {
      await uploadFiles(arr, currentFolder, current.id, activeBucketId);
      toast.success(`${arr.length} file${arr.length === 1 ? "" : "s"} uploaded`);
      await loadFiles(currentFolder, true);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      setPendingNewCount((c) => Math.max(0, c - arr.length));
    }
  }, [currentFolder, loadFiles, current, activeBucketId]);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    paths: string[];
    urls: string[];
    names: string[];
    folderName?: string;
    itemCount?: number;
    usages: { url: string; file: string; field: string }[];
    loading: boolean;
    deleting?: boolean;
  } | null>(null);

  const scanLocalDrafts = useCallback((projectId: string, urls: string[]): { url: string; file: string; field: string }[] => {
    const results: { url: string; file: string; field: string }[] = [];
    const prefix = `kern-draft:${projectId}:`;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const filePath = key.slice(prefix.length);
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const data = JSON.parse(raw);
          const search = (obj: unknown, path: string) => {
            if (typeof obj === "string") {
              for (const url of urls) { if (obj === url) results.push({ url, file: filePath, field: path }); }
            } else if (Array.isArray(obj)) {
              obj.forEach((item, idx) => search(item, `${path}[${idx}]`));
            } else if (obj && typeof obj === "object") {
              for (const [k, v] of Object.entries(obj as Record<string, unknown>)) search(v, path ? `${path}.${k}` : k);
            }
          };
          search(data, "");
        } catch { /* invalid JSON */ }
      }
    } catch { /* localStorage unavailable */ }
    return results;
  }, []);

  const cleanLocalDrafts = useCallback((projectId: string, urls: Set<string>) => {
    const prefix = `kern-draft:${projectId}:`;
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const data = JSON.parse(raw);
          const nullify = (obj: unknown): unknown => {
            if (typeof obj === "string") return urls.has(obj) ? null : obj;
            if (Array.isArray(obj)) return obj.map((item) => nullify(item));
            if (obj && typeof obj === "object") {
              const result: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(obj as Record<string, unknown>)) result[k] = nullify(v);
              return result;
            }
            return obj;
          };
          const cleaned = nullify(data);
          localStorage.setItem(key, JSON.stringify(cleaned));
        } catch { /* invalid JSON */ }
      }
    } catch { /* localStorage unavailable */ }
  }, []);

  const executeDelete = useCallback(async (paths: string[], urls: string[], usages: { url: string; file: string; field: string }[]) => {
    if (!current) return;
    const deletedSet = new Set(paths);
    const snapshot = files;
    setFiles((prev) => prev.filter((f) => !deletedSet.has(f.id)));
    setSelectedIds(new Set());
    setSelectMode("none");
    try {
      await deleteMedia(paths, current.id, activeBucketId);
      if (usages.length > 0) {
        const urlSet = new Set(urls);
        cleanLocalDrafts(current.id, urlSet);
        await fetch(`/api/projects/${current.id}/kern/media-references`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls, cleanup: true }),
        });
      }
    } catch {
      toast.error("Delete failed");
      setFiles(snapshot);
    }
  }, [files, current, activeBucketId, cleanLocalDrafts]);

  const handleDelete = useCallback(async (paths: string[]) => {
    const targetFiles = paths.map((p) => files.find((f) => f.id === p)).filter(Boolean) as MediaFile[];
    const urls = targetFiles.filter((f) => !f.isFolder).map((f) => f.url);
    const names = targetFiles.map((f) => f.name);

    let folderName: string | undefined;
    let itemCount: number | undefined;
    for (const f of targetFiles) {
      if (f.isFolder) {
        const count = parseInt(f.size) || 0;
        if (count > 0) { folderName = f.name; itemCount = count; }
      }
    }

    setDeleteConfirm({ paths, urls, names, folderName, itemCount, usages: [], loading: true });

    const localUsages = current ? scanLocalDrafts(current.id, urls) : [];

    if (urls.length > 0 && current) {
      try {
        const res = await fetch(`/api/projects/${current.id}/kern/media-references`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls }),
        });
        if (res.ok) {
          const data = await res.json();
          const apiUsages: { url: string; file: string; field: string }[] = data.usages ?? [];
          const seen = new Set(apiUsages.map((u) => `${u.file}:${u.field}`));
          const merged = [...apiUsages, ...localUsages.filter((u) => !seen.has(`${u.file}:${u.field}`))];
          setDeleteConfirm((prev) => prev ? { ...prev, usages: merged, loading: false } : null);
          return;
        }
      } catch { /* continue without API usage info */ }
    }
    setDeleteConfirm((prev) => prev ? { ...prev, usages: localUsages, loading: false } : null);
  }, [files, current, scanLocalDrafts]);

  const handleCreateFolder = useCallback(async (name: string) => {
    if (!current) return;
    const tempId = currentFolder ? `${currentFolder}/${name}` : name;
    const optimisticFolder: MediaFile = { id: tempId, name, url: "", alt: "", type: "folder", size: "0 items", uploadedAt: "Just now", isFolder: true, dimensions: "" };
    setFiles((prev) => [optimisticFolder, ...prev]);
    try {
      const ok = await createFolder(name, currentFolder, current.id, activeBucketId);
      if (!ok) throw new Error();
      toast.success(`Folder "${name}" created`);
      await loadFiles(currentFolder, true);
    } catch {
      toast.error(`Failed to create folder "${name}"`);
      setFiles((prev) => prev.filter((f) => f.id !== tempId));
    }
  }, [currentFolder, loadFiles, current, activeBucketId]);

  const handleMove = useCallback(async (itemIds: string[], destFolderId: string) => {
    if (!current) return;
    const movedSet = new Set(itemIds);
    const movedCount = itemIds.length;
    const snapshot = files;
    setFiles((prev) => prev.map((f) => {
      if (movedSet.has(f.id)) return null;
      if (f.isFolder && f.id === destFolderId) {
        const current = parseInt(f.size) || 0;
        const n = current + movedCount;
        return { ...f, size: `${n} item${n === 1 ? "" : "s"}` };
      }
      return f;
    }).filter(Boolean) as MediaFile[]);
    const ok = await moveMedia(itemIds, destFolderId, current.id, activeBucketId);
    if (!ok) {
      toast.error("Move failed");
      setFiles(snapshot);
    }
  }, [files, current, activeBucketId]);

  useEffect(() => {
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    emptyImg.current = img;
  }, []);

  const onInternalDragStart = useCallback((e: React.DragEvent, fileId: string) => {
    // If dragging a selected file, drag all selected; otherwise just this one
    if (selectedIds.has(fileId) && selectedIds.size > 1) {
      setDraggingId(fileId);
    } else {
      setDraggingId(fileId);
      { setSelectedIds(new Set()); setSelectMode("none"); };
    }
    setDragPos({ x: e.clientX, y: e.clientY });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", fileId);
    if (emptyImg.current) e.dataTransfer.setDragImage(emptyImg.current, 0, 0);
  }, [selectedIds]);

  const onFolderDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(folderId);
    setDragPos({ x: e.clientX, y: e.clientY });
  }, []);

  const onFolderDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetId(null);
  }, []);

  const onFolderDrop = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetId(null);
    const itemId = e.dataTransfer.getData("text/plain");
    if (itemId && itemId !== folderId) {
      // If dragging a selected item, move all selected
      const itemsToMove = selectedIds.has(itemId) && selectedIds.size > 1
        ? Array.from(selectedIds).filter((id) => id !== folderId)
        : [itemId];
      handleMove(itemsToMove, folderId);
      { setSelectedIds(new Set()); setSelectMode("none"); };
    }
    setDraggingId(null);
  }, [handleMove, selectedIds]);

  const onInternalDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
    setNearBreadcrumb(false);
    setDragPos(null);
  }, []);

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => { e.preventDefault(); dragCounter.current++; if (e.dataTransfer?.types.includes("Files")) setIsDragging(true); };
    const onDragLeave = (e: DragEvent) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (draggingId) {
        setDragPos({ x: e.clientX, y: e.clientY });
        if (headerRef.current) {
          const rect = headerRef.current.getBoundingClientRect();
          setNearBreadcrumb(e.clientY < rect.bottom + 80);
        }
      }
    };
    const onDrop = (e: DragEvent) => { e.preventDefault(); dragCounter.current = 0; setIsDragging(false); setNearBreadcrumb(false); if (e.dataTransfer && e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files); };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => { window.removeEventListener("dragenter", onDragEnter); window.removeEventListener("dragleave", onDragLeave); window.removeEventListener("dragover", onDragOver); window.removeEventListener("drop", onDrop); };
  }, [handleUpload, draggingId]);

  const [selectMode, setSelectMode] = useState<"none" | "shift" | "checkbox">("none");

  const toggleSelect = useCallback((id: string, e: React.MouseEvent, source: "checkbox" | "shift" = "checkbox") => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === 0) { setSelectMode("none"); return next; }
      return next;
    });
    setSelectMode((prev) => prev === "none" ? source : prev);
  }, []);

  const handleClick = useCallback((file: MediaFile, e: React.MouseEvent) => {
    if (file.isFolder) { handleFolderClick(file); return; }
    if (e.shiftKey) { toggleSelect(file.id, e, "shift"); return; }
    if (selectMode === "checkbox" && selectedIds.size > 0) { toggleSelect(file.id, e, "checkbox"); return; }
    setPreview(file);
  }, [handleFolderClick, selectMode, selectedIds.size, toggleSelect]);

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const handleContextMenu = useCallback((e: React.MouseEvent, file: MediaFile) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  }, []);

  // Rename
  const [renameTarget, setRenameTarget] = useState<MediaFile | null>(null);
  const handleRename = useCallback(async (file: MediaFile, newName: string) => {
    if (!current) return;
    const oldName = file.name;
    const oldId = file.id;
    const newId = file.id.replace(/[^/]*$/, newName);
    setFiles((prev) => prev.map((f) => f.id === oldId ? { ...f, name: newName, id: newId } : f));
    const ok = await renameMedia(oldId, newName, current.id, activeBucketId);
    if (!ok) {
      toast.error("Rename failed");
      setFiles((prev) => prev.map((f) => f.id === newId ? { ...f, name: oldName, id: oldId } : f));
    } else {
      await loadFiles(currentFolder, true);
    }
  }, [currentFolder, loadFiles, current, activeBucketId]);

  // Breadcrumb drop
  const handleBreadcrumbDrop = useCallback((folder: string) => {
    if (draggingId && draggingId !== folder) {
      const itemsToMove = selectedIds.has(draggingId) && selectedIds.size > 1
        ? Array.from(selectedIds)
        : [draggingId];
      handleMove(itemsToMove, folder);
      { setSelectedIds(new Set()); setSelectMode("none"); };
    }
    setDraggingId(null);
  }, [draggingId, handleMove, selectedIds]);

  // Context menu actions
  const ctxOpen = useCallback((file: MediaFile) => {
    if (file.isFolder) handleFolderClick(file);
    else setPreview(file);
  }, [handleFolderClick]);

  const ctxCopyUrl = useCallback((file: MediaFile) => {
    navigator.clipboard.writeText(file.contentUrl ?? file.url);
    toast.success("URL copied to clipboard");
  }, []);

  const ctxDownload = useCallback((file: MediaFile) => {
    const a = document.createElement("a");
    a.href = file.url;
    a.download = file.name;
    a.click();
  }, []);

  const ctxMoveUp = useCallback((file: MediaFile) => {
    const parts = currentFolder.split("/").filter(Boolean);
    if (parts.length === 0) return; // already at root
    const parent = parts.slice(0, -1).join("/");
    handleMove([file.id], parent);
  }, [currentFolder, handleMove]);

  const ctxDelete = useCallback((file: MediaFile) => {
    handleDelete([file.id]);
  }, [handleDelete]);

  const isSelecting = selectedIds.size > 0;
  const fileCount = files.filter((f) => !f.isFolder).length;
  const folderCount = files.filter((f) => f.isFolder).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 relative">
      {isDragging && !readOnly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 px-16 py-12 pointer-events-none">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
            <p className="text-lg font-medium text-foreground">Drop files to upload</p>
            <p className="text-sm text-muted-foreground">{currentFolder ? `to /${currentFolder}` : "to media root"}</p>
          </div>
        </div>
      )}

      {!readOnly && <input ref={fileInputRef} type="file" multiple className="sr-only" onChange={(e) => { if (e.target.files) handleUpload(e.target.files); e.target.value = ""; }} />}

      <div ref={headerRef} className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight font-[family-name:var(--font-averia)]">Media</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading ? <span className="inline-block h-4 w-20 animate-pulse rounded bg-white/[0.06]" /> : <>{fileCount} {fileCount === 1 ? "file" : "files"}{folderCount > 0 && <>, {folderCount} {folderCount === 1 ? "folder" : "folders"}</>}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 [&>*]:h-8 [&_button]:h-8">
          {buckets.length > 1 && (
            <BucketSelector
              buckets={buckets}
              activeBucketId={activeBucketId}
              onChange={(id) => { setActiveBucketId(id); setCurrentFolder(""); }}
              onSettings={() => router.push("/settings?section=media")}
            />
          )}
          <div className="flex items-center rounded-md border border-border">
            <button onClick={() => setView("grid")} className={`flex w-8 items-center justify-center transition-colors ${view === "grid" ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"} rounded-l-md`}><GridIcon /></button>
            <button onClick={() => setView("list")} className={`flex w-8 items-center justify-center transition-colors ${view === "list" ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"} rounded-r-md`}><ListIcon /></button>
          </div>
          {!readOnly && (
            <>
              <Button variant="outline" onClick={() => setShowNewFolder(true)}><FolderIcon className="mr-1" />New Folder</Button>
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </>
          )}
        </div>
      </div>

      {currentFolder && (
        <div className="mb-4">
          <Breadcrumbs path={currentFolder} onNavigate={navigateToFolder} onDrop={handleBreadcrumbDrop} onDragMove={(x, y) => setDragPos({ x, y })} />
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <svg className="h-6 w-6 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8" className="opacity-75" />
          </svg>
        </div>
      )}

      {!loading && !mediaRootExists && (!activeBucket || activeBucket.provider === "github") && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" x2="12" y1="9" y2="13" />
              <line x1="12" x2="12.01" y1="17" y2="17" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground">Media folder not found</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            The <code className="rounded bg-muted px-1 py-0.5 text-xs">public/kern/media</code> directory doesn&apos;t exist. Run the install wizard to set it up.
          </p>
          {current && (
            <Button
              size="sm"
              className="mt-4"
              onClick={async () => {
                await updateProject(current.id, { onboardingComplete: false, kernInstalled: false });
                router.replace("/");
              }}
            >
              Restart Install Wizard
            </Button>
          )}
        </div>
      )}

      {!loading && files.length === 0 && (mediaRootExists || (activeBucket && activeBucket.provider !== "github")) && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
          </div>
          <p className="text-sm font-medium text-foreground">No files yet</p>
          {readOnly ? (
            <p className="text-sm text-muted-foreground mt-1 mb-4">No media files in this folder.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Drag & drop files here or click Upload</p>
              <Button size="sm" onClick={() => fileInputRef.current?.click()}>Upload Files</Button>
            </>
          )}
        </div>
      )}

      {!loading && files.length > 0 && view === "grid" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visibleFiles.map((file, fileIndex) => {
            if (file.isFolder) {
              return (
                <button key={file.id} onClick={() => handleFolderClick(file)} onContextMenu={(e) => handleContextMenu(e, file)} onDragOver={(e) => onFolderDragOver(e, file.id)} onDragLeave={onFolderDragLeave} onDrop={(e) => onFolderDrop(e, file.id)} className={`group relative aspect-square rounded-lg border overflow-hidden transition-colors ${dropTargetId === file.id ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border hover:border-foreground/20"}`}>
                  {file.previews && file.previews.length >= 4 ? (
                    <>
                      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                        {file.previews.slice(0, 4).map((url, i) => (
                          <img key={i} src={thumbUrl(url)} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ))}
                        {file.previews.length < 4 && Array.from({ length: 4 - file.previews.length }).map((_, i) => (
                          <div key={`empty-${i}`} className="bg-muted/30" />
                        ))}
                      </div>
                      <div className="absolute inset-0 bg-black/25 backdrop-blur-[1px]" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/80"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>
                        <span className="text-xs font-medium text-white/90 truncate max-w-[90%]">{file.name}</span>
                        <span className="text-[10px] text-white/60">{file.size}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 h-full bg-muted/10">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-colors ${dropTargetId === file.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>
                      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors truncate max-w-[90%]">{file.name}</span>
                      <span className="text-[10px] text-muted-foreground/60">{file.size}</span>
                    </div>
                  )}
                </button>
              );
            }
            const isSelected = selectedIds.has(file.id);
            const isSaving = savingFileIds.has(file.id);
            return (
              <button key={file.id} draggable={!isSaving && !readOnly} onDragStart={(e) => onInternalDragStart(e, file.id)} onDragEnd={onInternalDragEnd} onClick={(e) => !isSaving && handleClick(file, e)} onContextMenu={(e) => handleContextMenu(e, file)} className={`group relative aspect-square overflow-hidden rounded-lg border bg-muted/30 transition-colors ${isSelected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-foreground/20"} ${draggingId && (file.id === draggingId || (selectedIds.has(draggingId) && selectedIds.has(file.id))) ? "opacity-40" : ""}`}>
                  <img src={thumbUrl(file.url)} alt={file.alt} className={`h-full w-full object-cover pointer-events-none transition-opacity ${isSaving ? "opacity-40" : ""}`} />
                  {isSaving && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="h-6 w-6 animate-spin text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>
                    </div>
                  )}
                  {!isSaving && <div className={`absolute top-2 left-2 transition-opacity ${isSelecting || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} onClick={(e) => toggleSelect(file.id, e)}><CheckIcon checked={isSelected} /></div>}
                  {!isSaving && <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 transition-opacity ${isSelecting ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                    <p className="truncate text-xs font-medium text-white">{file.name}</p>
                    <p className="text-[10px] text-white/70">{file.size}</p>
                  </div>}
                </button>
            );
          })}
          {Array.from({ length: pendingNewCount }, (_, i) => (
            <div key={`pending-${i}`} className="aspect-square rounded-lg border border-border bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && files.length > 0 && view === "list" && (
        <div className="flex flex-col rounded-lg border border-border">
          {visibleFiles.map((file, i) => {
            if (file.isFolder) {
              return (
                <button key={file.id} onClick={() => handleFolderClick(file)} onContextMenu={(e) => handleContextMenu(e, file)} onDragOver={(e) => onFolderDragOver(e, file.id)} onDragLeave={onFolderDragLeave} onDrop={(e) => onFolderDrop(e, file.id)} className={`flex items-center gap-4 px-4 py-3 text-left transition-colors ${dropTargetId === file.id ? "bg-primary/10" : "hover:bg-muted/30"} ${i > 0 ? "border-t border-border" : ""}`}>
                  <FolderIcon className={`shrink-0 ${dropTargetId === file.id ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0"><p className="truncate text-sm font-medium">{file.name}</p></div>
                  <span className="shrink-0 text-xs text-muted-foreground">{file.size}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{file.uploadedAt}</span>
                </button>
              );
            }
            const isSelected = selectedIds.has(file.id);
            const isSaving = savingFileIds.has(file.id);
            return (
              <button key={file.id} draggable={!isSaving && !readOnly} onDragStart={(e) => onInternalDragStart(e, file.id)} onDragEnd={onInternalDragEnd} onClick={(e) => !isSaving && handleClick(file, e)} onContextMenu={(e) => handleContextMenu(e, file)} className={`group flex items-center gap-4 px-4 py-3 text-left transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"} ${i > 0 ? "border-t border-border" : ""} ${draggingId && (file.id === draggingId || (selectedIds.has(draggingId) && selectedIds.has(file.id))) ? "opacity-40" : ""}`}>
                {!isSaving && <div onClick={(e) => toggleSelect(file.id, e)}><CheckIcon checked={isSelected} /></div>}
                {isSaving && <svg className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>}
                <div className={`h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted/30 ${isSaving ? "opacity-40" : ""}`}><img src={thumbUrl(file.url)} alt={file.alt} className="h-full w-full object-cover pointer-events-none" /></div>
                <div className="flex-1 min-w-0"><p className={`truncate text-sm font-medium ${isSaving ? "text-muted-foreground" : ""}`}>{file.name}</p><p className="text-xs text-muted-foreground">{file.alt}</p></div>
                <span className="shrink-0 text-xs text-muted-foreground">{file.size}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{file.uploadedAt}</span>
              </button>
            );
          })}
          {Array.from({ length: pendingNewCount }, (_, i) => (
            <div key={`pending-${i}`} className="flex items-center gap-4 px-4 py-3 border-t border-border animate-pulse">
              <div className="h-4 w-4 shrink-0 rounded bg-muted/50" />
              <div className="h-10 w-10 shrink-0 rounded-md bg-muted/50" />
              <div className="flex-1"><div className="h-4 w-32 rounded bg-muted/50" /></div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-6">
          <p className="text-xs text-muted-foreground">{visibleFiles.length} / {files.length}</p>
        </div>
      )}

      {!readOnly && isSelecting && <BulkBar count={selectedIds.size} onDelete={async () => { await handleDelete(Array.from(selectedIds)); }} onClear={() => { setSelectedIds(new Set()); setSelectMode("none"); }} />}

      <MediaPreviewDialog
        file={preview}
        open={!!preview}
        onOpenChange={(o) => { if (!o) setPreview(null); }}
        onDelete={async (id) => { await handleDelete([id]); setPreview(null); }}
        onSave={(blob, filename, replaceId) => {
          if (!current) return;
          setPreview(null);
          const f = new File([blob], filename, { type: blob.type || "image/png" });
          if (replaceId) {
            const localPreviewUrl = URL.createObjectURL(blob);
            setFiles((prev) => prev.map((fi) => fi.id === replaceId ? { ...fi, url: localPreviewUrl } : fi));
            setSavingFileIds((prev) => new Set(prev).add(replaceId));
            (async () => {
              try {
                const updated = await replaceMedia(replaceId, f, current.id, activeBucketId);
                if (!updated) { toast.error("Replace failed"); return; }
                toast.success("File replaced");
                const bust = `${updated.url.includes("?") ? "&" : "?"}v=${Date.now()}`;
                setFiles((prev) => prev.map((fi) => fi.id === replaceId ? { ...updated, url: updated.url + bust } : fi));
              } finally {
                URL.revokeObjectURL(localPreviewUrl);
                setSavingFileIds((prev) => { const next = new Set(prev); next.delete(replaceId); return next; });
              }
            })();
          } else {
            setPendingNewCount((c) => c + 1);
            (async () => {
              try {
                await handleUpload([f]);
                await loadFiles(currentFolder, true);
              } finally {
                setPendingNewCount((c) => Math.max(0, c - 1));
              }
            })();
          }
        }}
        onRename={handleRename}
        readOnly={readOnly}
      />

      <NewFolderDialog open={showNewFolder} onOpenChange={setShowNewFolder} onCreate={handleCreateFolder} />

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(v) => { if (!v) setDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Delete {deleteConfirm?.paths.length === 1
                ? (deleteConfirm?.folderName ? "folder" : deleteConfirm?.names[0])
                : `${deleteConfirm?.paths.length} items`}?
            </DialogTitle>
            <DialogDescription>
              <span className="flex flex-col gap-2">
                {deleteConfirm?.folderName && (
                  <span><strong>{deleteConfirm.folderName}</strong> contains {deleteConfirm.itemCount} item{deleteConfirm.itemCount === 1 ? "" : "s"} that will be permanently deleted.</span>
                )}
                {!deleteConfirm?.folderName && deleteConfirm?.paths.length === 1 && (
                  <span>This will permanently delete <strong>{deleteConfirm.names[0]}</strong>.</span>
                )}
                {!deleteConfirm?.folderName && (deleteConfirm?.paths.length ?? 0) > 1 && (
                  <span>{deleteConfirm!.paths.length} items will be permanently deleted.</span>
                )}
                {!deleteConfirm?.loading && (deleteConfirm?.usages.length ?? 0) > 0 && (
                  <span className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200 block mt-2">
                    <span className="font-medium block">Warning: used in content</span>
                    <span className="mt-1 text-yellow-200/70 block">
                      {deleteConfirm!.usages.length === 1
                        ? "This file is referenced in 1 content field. The reference will be removed."
                        : `This file is referenced in ${deleteConfirm!.usages.length} content fields. The references will be removed.`}
                    </span>
                  </span>
                )}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteConfirm?.loading} className="min-w-[80px]" onClick={() => {
              if (deleteConfirm) {
                const { paths, urls, usages } = deleteConfirm;
                setDeleteConfirm(null);
                executeDelete(paths, urls, usages);
              }
            }}>{deleteConfirm?.loading ? (<svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>) : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContextMenu
        state={contextMenu}
        currentFolder={currentFolder}
        selectedCount={selectedIds.size}
        onClose={() => setContextMenu(null)}
        onOpen={ctxOpen}
        onRename={(file) => setRenameTarget(file)}
        onCopyUrl={ctxCopyUrl}
        onDownload={ctxDownload}
        onMoveUp={ctxMoveUp}
        onDelete={ctxDelete}
        onDeleteSelected={async () => { await handleDelete(Array.from(selectedIds)); }}
        onMoveUpSelected={async () => {
          const parts = currentFolder.split("/").filter(Boolean);
          if (parts.length === 0) return;
          const parent = parts.slice(0, -1).join("/");
          await handleMove(Array.from(selectedIds), parent);
          { setSelectedIds(new Set()); setSelectMode("none"); };
        }}
        readOnly={readOnly}
      />

      <RenameDialog
        file={renameTarget}
        open={!!renameTarget}
        onOpenChange={(v) => { if (!v) setRenameTarget(null); }}
        onRename={handleRename}
      />

      {/* Custom drag overlay */}
      {draggingId && dragPos && (() => {
        const draggedFile = files.find((f) => f.id === draggingId);
        if (!draggedFile || draggedFile.isFolder) return null;
        const isMulti = selectedIds.has(draggingId) && selectedIds.size > 1;
        const count = isMulti ? selectedIds.size : 1;
        return (
          <div
            className="pointer-events-none fixed z-[100] transition-[opacity,transform] duration-200 ease-out"
            style={{
              left: dragPos.x,
              top: dragPos.y,
              transform: `translate(-50%, -50%) scale(${nearBreadcrumb ? 0.55 : 1})`,
              opacity: nearBreadcrumb ? 0.6 : 1,
            }}
          >
            <div className="relative">
              {isMulti && (
                <>
                  <div className="absolute -top-1.5 -left-1.5 h-40 w-40 rounded-xl border border-border bg-muted/80 rotate-[-4deg]" />
                  <div className="absolute -top-0.5 -left-0.5 h-40 w-40 rounded-xl border border-border bg-muted/60 rotate-[-2deg]" />
                </>
              )}
              <div className="relative h-40 w-40 overflow-hidden rounded-xl border border-border shadow-2xl">
                <img src={thumbUrl(draggedFile.url)} alt={draggedFile.alt} className="h-full w-full object-cover" />
              </div>
              {isMulti && (
                <div className="absolute -top-2 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground shadow-md">
                  {count}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjects } from "@/components/project-context";
import { BucketSelector } from "@/components/bucket-selector";

function useDelayedUnmount(show: boolean, ms = 150) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (show) { setMounted(true); return; }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [show, ms]);
  return mounted;
}

type MediaFile = {
  id: string;
  name: string;
  type: string;
  size: string;
  url: string;
  contentUrl?: string;
  uploadedAt: string;
  alt: string;
  isFolder?: boolean;
};

async function fetchMedia(folder: string, projectId?: string, bucketId?: string): Promise<MediaFile[]> {
  const params = new URLSearchParams({ folder });
  if (projectId) params.set("projectId", projectId);
  if (bucketId) params.set("bucketId", bucketId);
  const res = await fetch(`/api/media?${params}`);
  const data = await res.json();
  return data.files ?? [];
}

async function uploadFiles(files: File[], folder: string, projectId: string, bucketId?: string): Promise<void> {
  const formData = new FormData();
  formData.set("folder", folder);
  formData.set("projectId", projectId);
  if (bucketId) formData.set("bucketId", bucketId);
  for (const f of files) formData.append("files", f);
  await fetch("/api/media", { method: "POST", body: formData });
}

async function deleteMedia(paths: string[], projectId: string, bucketId?: string): Promise<void> {
  await fetch("/api/media", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths, projectId, ...(bucketId ? { bucketId } : {}) }),
  });
}

async function createFolder(name: string, parent: string, projectId: string, bucketId?: string): Promise<boolean> {
  const res = await fetch("/api/media/folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parent, projectId, ...(bucketId ? { bucketId } : {}) }),
  });
  return res.ok;
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function Breadcrumbs({ path, onNavigate }: { path: string; onNavigate: (folder: string) => void }) {
  const segments = path ? path.split("/") : [];
  return (
    <div className="flex items-center gap-1 text-sm">
      <button onClick={() => onNavigate("")} className={`rounded px-1.5 py-0.5 transition-colors ${segments.length === 0 ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}>
        Media
      </button>
      {segments.map((seg, i) => {
        const segPath = segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        return (
          <div key={segPath} className="flex items-center gap-1">
            <span className="text-muted-foreground/50">/</span>
            <button onClick={() => onNavigate(segPath)} className={`rounded px-1.5 py-0.5 transition-colors ${isLast ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}>
              {seg}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ContextMenuPortal({ x, y, file, currentFolder, onClose, onOpenInMedia, onSelect, onCopyUrl, onDownload, onDelete, onReload }: {
  x: number;
  y: number;
  file: MediaFile;
  currentFolder: string;
  onClose: () => void;
  onOpenInMedia: () => void;
  onSelect: () => void;
  onCopyUrl: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onReload: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", handle); document.removeEventListener("keydown", key); };
  }, [onClose]);

  const items: { label: string; icon: React.ReactNode; action: () => void; destructive?: boolean; separator?: boolean }[] = [
    {
      label: "Select",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
      action: onSelect,
    },
    {
      label: "Open in Media",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>,
      action: onOpenInMedia,
    },
    {
      label: "Copy URL",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>,
      action: onCopyUrl,
    },
    {
      label: "Download",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>,
      action: onDownload,
    },
    {
      label: "Delete",
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>,
      action: onDelete,
      destructive: true,
      separator: true,
    },
  ];

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-lg ring-1 ring-foreground/5 animate-in fade-in zoom-in-95 duration-100"
      style={{ top: y, left: x }}
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

function NewFolderPopover({ show, onToggle, onClose, name, onNameChange, onCreate }: {
  show: boolean;
  onToggle: () => void;
  onClose: () => void;
  name: string;
  onNameChange: (v: string) => void;
  onCreate: () => void;
}) {
  const mounted = useDelayedUnmount(show);

  return (
    <div className="relative">
      <Button variant="ghost" size="xs" onClick={onToggle}>
        <FolderIcon className="mr-1" />
        New Folder
      </Button>
      {mounted && (
        <>
          <div className="fixed inset-0 z-50" onClick={onClose} />
          <div className={`absolute top-[calc(100%+6px)] right-0 z-50 w-56 rounded-lg bg-popover p-3 shadow-lg ring-1 ring-foreground/10 duration-150 ${
            show
              ? "animate-in fade-in zoom-in-95 slide-in-from-top-1"
              : "animate-out fade-out zoom-out-95 slide-out-to-top-1"
          }`}>
            <p className="text-xs font-medium mb-2">Create folder</p>
            <Input
              placeholder="Folder name"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onNameChange(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") onCreate(); if (e.key === "Escape") onClose(); }}
              className="h-8 text-sm mb-2"
              autoFocus
            />
            <Button size="sm" className="w-full" onClick={onCreate} disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

async function moveMedia(items: string[], destination: string, projectId: string, bucketId?: string): Promise<boolean> {
  const res = await fetch("/api/media", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, destination, projectId, ...(bucketId ? { bucketId } : {}) }),
  });
  return res.ok;
}

export function MediaPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (file: { name: string; url: string; id: string }) => void;
}) {
  const router = useRouter();
  const { current } = useProjects();
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [draggingOver, setDraggingOver] = useState(false);
  const [draggingFile, setDraggingFile] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: MediaFile } | null>(null);
  const [buckets, setBuckets] = useState<{ id: string; name: string; provider: string; isDefault: boolean }[]>([]);
  const [activeBucketId, setActiveBucketId] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!current || !open) return;
    fetch(`/api/projects/${current.id}/buckets`)
      .then((r) => r.json())
      .then((data) => {
        const list = data.buckets ?? data ?? [];
        setBuckets(list);
        const def = list.find((b: { id: string; isDefault: boolean }) => b.isDefault);
        if (def) setActiveBucketId(def.id);
      });
  }, [current, open]);

  const loadFiles = useCallback(async (folder: string) => {
    setLoading(true);
    try {
      const result = await fetchMedia(folder, current?.id, activeBucketId);
      setFiles(result);
    } finally {
      setLoading(false);
    }
  }, [current, activeBucketId]);

  useEffect(() => {
    if (open) loadFiles(currentFolder);
  }, [open, currentFolder, loadFiles]);

  useEffect(() => {
    if (!open) {
      setCurrentFolder("");
      setShowNewFolder(false);
      setNewFolderName("");
      setContextMenu(null);
      setDraggingFile(null);
      setDropTarget(null);
    }
  }, [open]);

  const handleUpload = useCallback(async (fileList: FileList) => {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    setUploading(true);
    try {
      if (!current) return;
      await uploadFiles(arr, currentFolder, current.id, activeBucketId);
      await loadFiles(currentFolder);
    } finally {
      setUploading(false);
    }
  }, [currentFolder, loadFiles, current, activeBucketId]);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (!current) return;
    const ok = await createFolder(name, currentFolder, current.id, activeBucketId);
    if (ok) {
      setNewFolderName("");
      setShowNewFolder(false);
      await loadFiles(currentFolder);
    }
  }, [newFolderName, currentFolder, loadFiles, current, activeBucketId]);

  const handleSelect = useCallback((file: MediaFile) => {
    onSelect({ name: file.name, url: file.url, id: file.id });
    onOpenChange(false);
  }, [onSelect, onOpenChange]);

  const handleMoveToFolder = useCallback(async (fileId: string, folderId: string) => {
    if (!current) return;
    const ok = await moveMedia([fileId], folderId, current.id, activeBucketId);
    if (ok) await loadFiles(currentFolder);
  }, [currentFolder, loadFiles, current, activeBucketId]);

  // Native drag events for file upload from OS
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !open) return;

    let counter = 0;
    const enter = (e: DragEvent) => { e.preventDefault(); counter++; setDraggingOver(true); };
    const over = (e: DragEvent) => { e.preventDefault(); };
    const leave = () => { counter--; if (counter === 0) setDraggingOver(false); };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      counter = 0;
      setDraggingOver(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files);
      }
    };

    el.addEventListener("dragenter", enter);
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragenter", enter);
      el.removeEventListener("dragover", over);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  }, [open, handleUpload]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-3xl p-0 gap-0 overflow-hidden">
        <div ref={contentRef} className="flex h-[520px] flex-col relative">
          {/* OS file drag overlay */}
          {draggingOver && !draggingFile && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background/90 backdrop-blur-sm">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
              <p className="text-sm font-medium text-primary">Drop files to upload</p>
            </div>
          )}
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border pl-5 pr-12 py-3">
            <div className="flex items-center gap-3">
              <Breadcrumbs path={currentFolder} onNavigate={setCurrentFolder} />
              {buckets.length > 1 && (
                <BucketSelector
                  buckets={buckets}
                  activeBucketId={activeBucketId}
                  onChange={(id) => { setActiveBucketId(id); setCurrentFolder(""); }}
                  size="sm"
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <NewFolderPopover
                show={showNewFolder}
                onToggle={() => setShowNewFolder(!showNewFolder)}
                onClose={() => { setShowNewFolder(false); setNewFolderName(""); }}
                name={newFolderName}
                onNameChange={setNewFolderName}
                onCreate={handleCreateFolder}
              />
              <Button size="xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>

          <input ref={fileInputRef} type="file" multiple accept="image/*" className="sr-only" onChange={(e) => { if (e.target.files) handleUpload(e.target.files); e.target.value = ""; }} />

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            )}

            {!loading && files.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                </div>
                <p className="text-sm font-medium">No files yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">Upload images or drag files here</p>
                <Button size="xs" onClick={() => fileInputRef.current?.click()}>Upload</Button>
              </div>
            )}

            {!loading && files.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                {files.map((file) => {
                  if (file.isFolder) {
                    return (
                      <button
                        key={file.id}
                        onClick={() => setCurrentFolder(file.id)}
                        onDragOver={(e) => { e.preventDefault(); setDropTarget(file.id); }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDropTarget(null);
                          if (draggingFile && draggingFile !== file.id) {
                            handleMoveToFolder(draggingFile, file.id);
                          }
                          setDraggingFile(null);
                        }}
                        className={`group flex flex-col items-center justify-center gap-1.5 aspect-square rounded-lg border transition-colors ${
                          dropTarget === file.id
                            ? "border-primary bg-primary/10"
                            : "border-border bg-muted/10 hover:border-foreground/20 hover:bg-muted/20"
                        }`}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-colors ${dropTarget === file.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>
                        <span className={`text-[11px] font-medium transition-colors truncate max-w-[90%] ${dropTarget === file.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>{file.name}</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={file.id}
                      draggable
                      onClick={() => handleSelect(file)}
                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, file }); }}
                      onDragStart={() => setDraggingFile(file.id)}
                      onDragEnd={() => { setDraggingFile(null); setDropTarget(null); }}
                      className={`group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted/30 transition-colors hover:border-primary hover:ring-2 hover:ring-primary/30 ${
                        draggingFile === file.id ? "opacity-50" : ""
                      }`}
                    >
                      <img src={file.url} alt={file.alt} className="h-full w-full object-cover pointer-events-none" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="truncate text-[11px] font-medium text-white">{file.name}</p>
                        <p className="text-[10px] text-white/70">{file.size}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          currentFolder={currentFolder}
          onClose={() => setContextMenu(null)}
          onSelect={() => handleSelect(contextMenu.file)}
          onOpenInMedia={() => {
            onOpenChange(false);
            const params = new URLSearchParams();
            if (currentFolder) params.set("folder", currentFolder);
            params.set("open", contextMenu.file.id);
            router.push(`/media?${params.toString()}`);
          }}
          onCopyUrl={() => { navigator.clipboard.writeText(contextMenu.file.contentUrl ?? contextMenu.file.url); }}
          onDownload={() => {
            const a = document.createElement("a");
            a.href = contextMenu.file.url;
            a.download = contextMenu.file.name;
            a.click();
          }}
          onDelete={async () => {
            if (!current) return;
            await deleteMedia([contextMenu.file.id], current.id, activeBucketId);
            await loadFiles(currentFolder);
          }}
          onReload={() => loadFiles(currentFolder)}
        />
      )}
    </Dialog>
  );
}

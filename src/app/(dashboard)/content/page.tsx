"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useProjects } from "@/components/project-context";
import { useIsAdmin } from "@/lib/auth-client";
import { FieldRenderer } from "@/components/kern/FieldRenderer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Types ───────────────────────────────────────────────────

type ContentFile = {
  filename: string;
  data: Record<string, unknown>;
  schema: Record<string, unknown>;
  originalData?: Record<string, unknown>;
};

type SectionInfo = {
  name: string;
};

type PageInfo = {
  name: string;
  sections: SectionInfo[];
};

// ── Hooks ───────────────────────────────────────────────────

function useBranches(repo: string | undefined) {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!repo) return;
    const [owner, name] = repo.split("/");
    if (!owner || !name) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/github/repos/${owner}/${name}/branches`);
      if (res.ok) setBranches(await res.json());
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => { load(); }, [load]);

  return { branches, loading, reload: load };
}

type CommitInfo = {
  sha: string;
  message: string;
  date: string | null;
  author: string | null;
};

function useCommits(repo: string | undefined, branch: string) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!repo) return;
    const [owner, name] = repo.split("/");
    if (!owner || !name) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/github/repos/${owner}/${name}/commits?branch=${encodeURIComponent(branch)}`);
      if (res.ok) setCommits(await res.json());
    } finally {
      setLoading(false);
    }
  }, [repo, branch]);

  useEffect(() => { load(); }, [load]);

  return { commits, loading, reload: load };
}

function useKernPages(projectId: string | undefined, commitRef?: string | null) {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedForProject, setLoadedForProject] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const url = commitRef
        ? `/api/projects/${projectId}/kern/content?ref=${encodeURIComponent(commitRef)}`
        : `/api/projects/${projectId}/kern/content`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPages(data.pages);
        setLoadedForProject(projectId);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, commitRef]);

  useEffect(() => { load(); }, [load]);

  return { pages, loading, reload: load, loadedForProject };
}

type SectionCacheEntry = {
  files: ContentFile[];
  typesJson: Record<string, unknown>;
  error: string | null;
};

const sectionCache = new Map<string, SectionCacheEntry>();

function clearSectionCache(projectId?: string) {
  if (!projectId) { sectionCache.clear(); return; }
  for (const key of sectionCache.keys()) {
    if (key.startsWith(`${projectId}:`)) sectionCache.delete(key);
  }
}

function useSectionFiles(projectId: string | undefined, page: string | null, section: string | null, caching = true, commitRef?: string | null) {
  const [files, setFiles] = useState<ContentFile[]>([]);
  const [typesJson, setTypesJson] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !page || !section) { setFiles([]); setTypesJson({}); setError(null); setLoading(false); return; }
    const cacheKey = commitRef ? `${projectId}:${page}:${section}:${commitRef}` : `${projectId}:${page}:${section}`;
    let cancelled = false;

    if (caching && !commitRef) {
      const cached = sectionCache.get(cacheKey);
      if (cached) {
        setFiles(cached.files);
        setTypesJson(cached.typesJson);
        setError(cached.error);
        setLoading(false);
        return;
      }
    }

    setLoading(true);

    const body: Record<string, string> = { page, section };
    if (commitRef) body.ref = commitRef;

    fetch(`/api/projects/${projectId}/kern/content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.ok ? r.json() : { files: [], typesJson: {} })
      .then((data) => {
        if (!cancelled) {
          const entry: SectionCacheEntry = {
            files: data.files,
            typesJson: data.typesJson ?? {},
            error: data.error ?? data.warning ?? null,
          };
          if (caching && !commitRef) sectionCache.set(cacheKey, entry);
          setFiles(entry.files);
          setTypesJson(entry.typesJson);
          setError(entry.error);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [projectId, page, section, caching, commitRef]);

  return { files, typesJson, loading, error };
}

type DraftChange = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

function useDraft(projectId: string | undefined) {
  const [changes, setChanges] = useState<DraftChange[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const localDirtyRef = useRef(new Map<string, boolean>());
  const [localChangeCount, setLocalChangeCount] = useState(0);
  const saveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingSavesRef = useRef(new Map<string, { content: Record<string, unknown>; original: Record<string, unknown> }>());
  const publishedRef = useRef(false);
  const [discardVersion, setDiscardVersion] = useState(0);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/kern/draft`);
      if (res.ok) {
        const data = await res.json();
        setChanges(data.changes ?? []);
        localDirtyRef.current.clear();
        setLocalChangeCount(data.totalChanges ?? 0);
      }
    } catch { /* */ }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback((path: string, content: Record<string, unknown>, original: Record<string, unknown>) => {
    if (!projectId) return;
    publishedRef.current = false;

    // Instant local diff check
    const isDiff = JSON.stringify(content) !== JSON.stringify(original);
    const wasDirty = localDirtyRef.current.get(path) ?? false;
    localDirtyRef.current.set(path, isDiff);

    if (isDiff !== wasDirty) {
      setLocalChangeCount((prev) => isDiff ? prev + 1 : Math.max(prev - 1, 0));
    }

    // Instant localStorage save (survives reload)
    try {
      const lsKey = `kern-draft:${projectId}:${path}`;
      if (isDiff) {
        localStorage.setItem(lsKey, JSON.stringify(content));
      } else {
        localStorage.removeItem(lsKey);
      }
    } catch { /* quota exceeded etc */ }

    // Debounced DB save
    const existing = saveTimersRef.current.get(path);
    if (existing) clearTimeout(existing);
    if (isDiff) {
      pendingSavesRef.current.set(path, { content, original });
    } else {
      pendingSavesRef.current.delete(path);
    }
    saveTimersRef.current.set(path, setTimeout(async () => {
      saveTimersRef.current.delete(path);
      pendingSavesRef.current.delete(path);
      if (publishedRef.current) return;
      setSaving(true);
      try {
        await fetch(`/api/projects/${projectId}/kern/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, content, original }),
        });
        try { localStorage.removeItem(`kern-draft:${projectId}:${path}`); } catch { /* */ }
        clearSectionCache(projectId);
        await refresh();
      } finally {
        setSaving(false);
      }
    }, 1500));
  }, [projectId, refresh]);

  const publish = useCallback(async (targetBranch?: string) => {
    if (!projectId) return;
    for (const timer of saveTimersRef.current.values()) clearTimeout(timer);
    saveTimersRef.current.clear();
    publishedRef.current = true;
    setPublishing(true);
    try {
      // Flush any pending debounced saves before publishing
      const pending = [...pendingSavesRef.current.entries()];
      pendingSavesRef.current.clear();
      if (pending.length > 0) {
        await Promise.all(pending.map(([path, { content, original }]) =>
          fetch(`/api/projects/${projectId}/kern/draft`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, content, original }),
          })
        ));
      }
      const res = await fetch(`/api/projects/${projectId}/kern/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetBranch }),
      });
      if (res.ok) {
        clearSectionCache(projectId);
        setChanges([]);
        localDirtyRef.current.clear();
        setLocalChangeCount(0);
        try {
          const prefix = `kern-draft:${projectId}:`;
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key?.startsWith(prefix)) localStorage.removeItem(key);
          }
        } catch { /* */ }
        await refresh();
      }
    } finally {
      setPublishing(false);
    }
  }, [projectId, refresh]);

  const discard = useCallback(async () => {
    if (!projectId) return;
    for (const timer of saveTimersRef.current.values()) clearTimeout(timer);
    saveTimersRef.current.clear();
    pendingSavesRef.current.clear();
    await fetch(`/api/projects/${projectId}/kern/draft`, { method: "DELETE" });
    setChanges([]);
    localDirtyRef.current.clear();
    setLocalChangeCount(0);
    clearSectionCache(projectId);
    setDiscardVersion((v) => v + 1);
    try {
      const prefix = `kern-draft:${projectId}:`;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) localStorage.removeItem(key);
      }
    } catch { /* */ }
  }, [projectId]);

  const deleteFile = useCallback(async (path: string) => {
    if (!projectId) return;
    const wasDirty = localDirtyRef.current.get(path) ?? false;
    localDirtyRef.current.set(path, true);
    if (!wasDirty) setLocalChangeCount((prev) => prev + 1);
    await fetch(`/api/projects/${projectId}/kern/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, action: "delete" }),
    });
    await refresh();
  }, [projectId, refresh]);

  const discardFile = useCallback(async (path: string) => {
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/kern/draft?path=${encodeURIComponent(path)}`, { method: "DELETE" });
    localDirtyRef.current.delete(path);
    setLocalChangeCount(Math.max(0, localDirtyRef.current.size));
    clearSectionCache(projectId);
    setDiscardVersion((v) => v + 1);
    try { localStorage.removeItem(`kern-draft:${projectId}:${path}`); } catch { /* */ }
    await refresh();
  }, [projectId, refresh]);

  const changeCount = localChangeCount;
  const hasChanges = changeCount > 0;

  return { changes, hasChanges, changeCount, saving, publishing, save, publish, discard, discardFile, refresh, discardVersion, deleteFile };
}

// ── Components ──────────────────────────────────────────────

function SidebarBranchSelector({
  currentBranch,
  branches,
  onSwitch,
  onCreate,
  repo,
}: {
  currentBranch: string;
  branches: string[];
  onSwitch: (branch: string) => void;
  onCreate: (name: string) => void;
  repo: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const filtered = branches.filter((b) => b.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  useEffect(() => { if (modalOpen) setTimeout(() => modalInputRef.current?.focus(), 0); }, [modalOpen]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleCreate(name: string) {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const [owner, repoName] = repo.split("/");
      await fetch("/api/github/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo: repoName, name: name.trim(), from: currentBranch }),
      });
      onCreate(name.trim());
      setSearch(""); setOpen(false); setModalOpen(false); setNewBranchName("");
    } finally { setCreating(false); }
  }

  const modalNameValid = newBranchName.trim() && !branches.includes(newBranchName.trim());

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-full items-center justify-between rounded-lg border border-border bg-transparent px-2.5 text-sm transition-colors hover:bg-muted/30"
      >
        <div className="flex items-center gap-2 truncate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
            <line x1="6" x2="6" y1="3" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          <span className="text-muted-foreground text-xs">Branch:</span>
          <span className="font-medium truncate">{currentBranch}</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground ml-2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-full rounded-lg bg-popover shadow-md ring-1 ring-foreground/10">
          <div className="p-2">
            <Input ref={inputRef} placeholder="Find branch..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="max-h-48 overflow-y-auto px-1 pb-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">No branches found.</p>
            ) : filtered.map((branch) => (
              <button
                key={branch}
                onClick={() => { onSwitch(branch); setOpen(false); setSearch(""); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
                  <line x1="6" x2="6" y1="3" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
                <span className="text-sm">{branch}</span>
                {branch === currentBranch && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-foreground">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <div className="mx-1 h-px bg-border" />
          <div className="p-1">
            <button
              onClick={() => { setOpen(false); setSearch(""); setModalOpen(true); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" />
              </svg>
              Create Branch
            </button>
          </div>
        </div>
      )}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Branch</DialogTitle>
            <DialogDescription>
              New branch from <span className="font-medium text-foreground">{currentBranch}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="sidebar-new-branch">Branch name</Label>
            <Input
              ref={modalInputRef}
              id="sidebar-new-branch"
              placeholder="feature/my-branch"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && modalNameValid && !creating) handleCreate(newBranchName); }}
            />
            {newBranchName.trim() && branches.includes(newBranchName.trim()) && (
              <p className="text-xs text-destructive">Branch already exists.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalOpen(false); setNewBranchName(""); }}>Cancel</Button>
            <Button disabled={!modalNameValid || creating} onClick={() => handleCreate(newBranchName)}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SidebarCommitSelector({
  commits,
  selectedSha,
  onSelect,
  loading,
}: {
  commits: { sha: string; message: string; date: string | null; author: string | null }[];
  selectedSha: string | null;
  onSelect: (sha: string | null) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = commits.filter(
    (c) => c.message.toLowerCase().includes(search.toLowerCase()) || c.sha.toLowerCase().startsWith(search.toLowerCase())
  );

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function formatRelative(dateStr: string) {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  const selected = selectedSha ? commits.find((c) => c.sha === selectedSha) : null;
  const label = selected ? selected.sha.slice(0, 7) : "Latest";

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => !loading && setOpen(!open)}
        disabled={loading}
        className="flex h-8 w-full items-center justify-between rounded-lg border border-border bg-transparent px-2.5 text-sm transition-colors hover:bg-muted/30 disabled:opacity-50"
      >
        <div className="flex items-center gap-2 truncate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
            <circle cx="12" cy="12" r="3" />
            <line x1="12" x2="12" y1="3" y2="9" />
            <line x1="12" x2="12" y1="15" y2="21" />
          </svg>
          <span className="text-muted-foreground text-xs">Commit:</span>
          <span className="font-medium truncate">{label}</span>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground ml-2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-full rounded-lg bg-popover shadow-md ring-1 ring-foreground/10">
          <div className="p-2">
            <Input ref={inputRef} placeholder="Find commit..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="max-h-48 overflow-y-auto px-1 pb-1">
            <button
              onClick={() => { onSelect(null); setOpen(false); setSearch(""); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
                <circle cx="12" cy="12" r="3" />
                <line x1="12" x2="12" y1="3" y2="9" />
                <line x1="12" x2="12" y1="15" y2="21" />
              </svg>
              <span className="text-sm">Latest</span>
              {!selectedSha && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-foreground">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
            {filtered.map((commit) => (
              <button
                key={commit.sha}
                onClick={() => { onSelect(commit.sha); setOpen(false); setSearch(""); }}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground mt-0.5">
                  <circle cx="12" cy="12" r="3" />
                  <line x1="12" x2="12" y1="3" y2="9" />
                  <line x1="12" x2="12" y1="15" y2="21" />
                </svg>
                <div className="flex-1 text-left min-w-0">
                  <span className="text-sm truncate block">{commit.message.split("\n")[0].slice(0, 32)}{commit.message.split("\n")[0].length > 32 ? "..." : ""}</span>
                  <span className="text-[10px] text-muted-foreground">{commit.date ? formatRelative(commit.date) : ""}</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0 mt-0.5">{commit.sha.slice(0, 7)}</span>
                {selectedSha === commit.sha && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-foreground">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">No commits found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PageSelector({
  pages,
  selected,
  onSelect,
  loading,
}: {
  pages: PageInfo[];
  selected: PageInfo | null;
  onSelect: (page: PageInfo) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = pages.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex h-8 w-full items-center justify-between rounded-lg border border-border bg-transparent px-2.5 text-sm transition-colors hover:bg-muted/30 disabled:opacity-50"
      >
        {loading ? (
          <span className="text-muted-foreground">Loading...</span>
        ) : selected ? (
          <div className="flex items-center gap-2 truncate">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
            <span className="font-medium truncate">{selected.name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">
            {pages.length === 0 ? "No pages found" : "Select a page..."}
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground ml-2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && pages.length > 0 && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-full rounded-lg bg-popover shadow-md ring-1 ring-foreground/10">
          <div className="p-2">
            <Input ref={inputRef} placeholder="Find page..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="max-h-48 overflow-y-auto px-1 pb-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">No pages found.</p>
            ) : filtered.map((page) => (
              <button
                key={page.name}
                onClick={() => { onSelect(page); setOpen(false); setSearch(""); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                  <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                </svg>
                <span className="text-sm">{page.name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                {selected?.name === page.name && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground ml-auto">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const FIELD_TYPE_ICONS: Record<string, React.ReactNode> = {
  text: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" x2="15" y1="20" y2="20" /><line x1="12" x2="12" y1="4" y2="20" /></svg>,
  textarea: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 6.1H3" /><path d="M21 12.1H3" /><path d="M15.1 18H3" /></svg>,
  richtext: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /><path d="M5 20h4" /><path d="M15 20h4" /></svg>,
  number: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17l6-12" /><path d="M14 17l6-12" /><path d="M3 10h18" /><path d="M3 14h18" /></svg>,
  boolean: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="12" x="2" y="6" rx="6" /><circle cx="16" cy="12" r="2" /></svg>,
  image: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>,
  date: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>,
  select: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>,
  list: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" /><line x1="3" x2="3.01" y1="6" y2="6" /><line x1="3" x2="3.01" y1="12" y2="12" /><line x1="3" x2="3.01" y1="18" y2="18" /></svg>,
  repeater: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /></svg>,
};

const FIELD_TYPES = [
  { type: "text", label: "Text", desc: "Short text input" },
  { type: "textarea", label: "Textarea", desc: "Multi-line text" },
  { type: "richtext", label: "Rich Text", desc: "HTML editor with Tailwind support" },
  { type: "number", label: "Number", desc: "Numeric value" },
  { type: "boolean", label: "Boolean", desc: "Toggle on/off" },
  { type: "image", label: "Image", desc: "Image upload" },
  { type: "date", label: "Date", desc: "Date picker" },
  { type: "select", label: "Select", desc: "Dropdown options" },
  { type: "list", label: "List", desc: "Array of items" },
  { type: "repeater", label: "Repeater", desc: "Repeating group" },
];

function getDefaultValue(type: string): unknown {
  switch (type) {
    case "text": case "textarea": case "richtext": case "image": case "date": return "";
    case "number": return 0;
    case "boolean": return false;
    case "select": return "";
    case "list": return [];
    case "repeater": return [];
    default: return "";
  }
}

function getSchemaValue(type: string): unknown {
  switch (type) {
    case "select": return { type: "select", options: [] };
    case "date": return { type: "date", format: "YYYY-MM-DD" };
    case "list": return ["text"];
    case "repeater": return [{}];
    default: return type;
  }
}

function DraggableFieldType({ type, label, desc, onClick }: {
  type: string; label: string; desc: string; onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `_new:${type}`,
    data: { type: "new-field", fieldType: type },
  });

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors text-muted-foreground hover:bg-muted/50 hover:text-foreground ${isDragging ? "opacity-50" : ""}`}
      {...attributes}
      {...listeners}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted/50 text-muted-foreground">
        {FIELD_TYPE_ICONS[type]}
      </span>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
    </button>
  );
}

function AddFieldDrawer({
  open,
  onOpenChange,
  onAdd,
  existingKeys,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (key: string, type: string) => void;
  existingKeys: string[];
}) {
  function generateKey(type: string) {
    let base = `new_${type}`;
    if (!existingKeys.includes(base)) return base;
    let i = 2;
    while (existingKeys.includes(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  }

  return (
    <div
      className="fixed top-0 right-0 h-full w-72 bg-background border-l border-border z-50"
      style={{ display: open ? undefined : "none" }}
    >
      <div className="flex items-center justify-between px-4 h-10 border-b border-border">
        <span className="text-sm font-medium">Add Field</span>
        <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" />
          </svg>
        </button>
      </div>
      <div className="p-2 flex flex-col gap-0.5 overflow-y-auto h-[calc(100%-40px)]">
        <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Click or drag to add</p>
        {FIELD_TYPES.map((ft) => (
          <DraggableFieldType
            key={ft.type}
            type={ft.type}
            label={ft.label}
            desc={ft.desc}
            onClick={() => onAdd(generateKey(ft.type), ft.type)}
          />
        ))}
      </div>
    </div>
  );
}

function keyToLabel(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function RenameFieldDialog({
  open,
  onOpenChange,
  currentKey,
  existingKeys,
  onRename,
  isNew,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentKey: string;
  existingKeys: string[];
  onRename: (oldKey: string, newKey: string) => void;
  isNew?: boolean;
}) {
  const [newKey, setNewKey] = useState(currentKey);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setNewKey(currentKey);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [open, currentKey]);

  const trimmed = newKey.trim();
  const isDuplicate = trimmed !== currentKey && existingKeys.includes(trimmed);
  const isEmpty = trimmed === "";
  const isUnchanged = trimmed === currentKey;
  const hasInvalidChars = /[^a-zA-Z0-9_-]/.test(trimmed);
  const canSubmit = !isDuplicate && !isEmpty && !isUnchanged && !hasInvalidChars;

  function handleSubmit() {
    if (!canSubmit) return;
    onRename(currentKey, trimmed);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Rename field</DialogTitle>
          <DialogDescription>
            Change the field key of <span className="font-mono text-foreground">{currentKey}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            ref={inputRef}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="field_name"
            className="font-mono text-sm"
          />
          {isDuplicate && (
            <p className="text-xs text-destructive">Ein Feld mit diesem Namen existiert bereits.</p>
          )}
          {hasInvalidChars && !isEmpty && (
            <p className="text-xs text-destructive">Nur Buchstaben, Zahlen, - und _ erlaubt.</p>
          )}
          <div className={`flex items-start gap-2 rounded-md px-3 py-2.5 ${isNew ? "bg-blue-500/10 border border-blue-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 mt-0.5 ${isNew ? "text-blue-500" : "text-amber-500"}`}>
              {isNew ? (
                <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>
              ) : (
                <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></>
              )}
            </svg>
            <p className={`text-xs ${isNew ? "text-blue-500" : "text-amber-500"}`}>
              {isNew
                ? "Choose a key for this field. It must be referenced in your website code to have any effect."
                : "If this field is referenced in code, renaming it may break your build. Make sure to update the key in your code as well."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>Rename</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function schemaValueToTypeName(sv: unknown): string {
  if (typeof sv === "string") return sv;
  if (Array.isArray(sv)) return typeof sv[0] === "object" ? "repeater" : "list";
  if (typeof sv === "object" && sv !== null && "type" in sv) return (sv as { type: string }).type;
  return "text";
}

function SortableField({
  id,
  fieldKey,
  value,
  schemaValue,
  onChange,
  onRemove,
  onRename,
  onChangeType,
  existingKeys,
  isDirty,
  readOnly,
}: {
  id: string;
  fieldKey: string;
  value: unknown;
  schemaValue: unknown;
  onChange: (v: unknown) => void;
  onRemove: () => void;
  onRename: (oldKey: string, newKey: string) => void;
  onChangeType: (newType: string) => void;
  existingKeys: string[];
  isDirty?: boolean;
  readOnly?: boolean;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: readOnly });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition: isDragging ? undefined : transition }}
      className={`group ${isDragging ? "opacity-50 z-10" : ""}`}
    >
      <div className="relative">
        {!readOnly && (
          <button
            type="button"
            className="absolute -left-6 top-0.5 cursor-grab touch-none text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            {...attributes}
            {...listeners}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
              <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
            </svg>
          </button>
        )}
        <div className="flex items-center gap-1 mb-2">
          <span className="text-xs font-medium text-muted-foreground">{keyToLabel(fieldKey)}</span>
          {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />}
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={() => setTypeOpen(true)}
                className="text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-all"
                title="Change field type"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setRenameOpen(true)}
                className="text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-all"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </>
          )}
        </div>
        <FieldRenderer fieldKey={fieldKey} value={value} schemaValue={schemaValue} onChange={onChange} hideLabel disabled={readOnly} />
      </div>
      <RenameFieldDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        currentKey={fieldKey}
        existingKeys={existingKeys}
        onRename={onRename}
        isNew={/^new_[a-z]+(_\d+)?$/.test(fieldKey)}
      />
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete field</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-mono text-foreground">{fieldKey}</span>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setDeleteOpen(false); onRemove(); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Change Type</DialogTitle>
            <DialogDescription>
              Choose a new type for <span className="font-mono text-foreground">{fieldKey}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-0.5">
            {FIELD_TYPES.map((ft) => {
              const current = schemaValueToTypeName(schemaValue) === ft.type;
              return (
                <button
                  key={ft.type}
                  onClick={() => { if (!current) { onChangeType(ft.type); setTypeOpen(false); } }}
                  className={`flex items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${current ? "bg-muted/50 text-foreground" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"}`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted/50 text-muted-foreground">
                    {FIELD_TYPE_ICONS[ft.type]}
                  </span>
                  <span className="font-medium">{ft.label}</span>
                  {current && <span className="ml-auto text-xs text-muted-foreground">current</span>}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function CodePanel({
  files,
  fileData,
  typesJson,
}: {
  files: ContentFile[];
  fileData: Record<string, Record<string, unknown>>;
  typesJson: Record<string, unknown>;
}) {
  const dataJson = files.length === 1
    ? JSON.stringify(fileData[files[0].filename] ?? files[0].data, null, 2)
    : JSON.stringify(Object.fromEntries(files.map((f) => [f.filename, fileData[f.filename] ?? f.data])), null, 2);

  const typesJsonStr = JSON.stringify(typesJson, null, 2);
  const dataLabel = files.length === 1 ? `${files[0].filename}.json` : "data.json";

  return (
    <div className="grid grid-cols-2 divide-x divide-border h-full overflow-hidden">
      <div className="flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center px-3 h-8 shrink-0 border-b border-border bg-muted/30">
          <span className="text-[11px] font-mono text-muted-foreground">{dataLabel}</span>
        </div>
        <div className="flex-1 overflow-auto">
          <pre className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-pre">{dataJson}</pre>
        </div>
      </div>
      <div className="flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center px-3 h-8 shrink-0 border-b border-border bg-muted/30">
          <span className="text-[11px] font-mono text-muted-foreground">types.json</span>
        </div>
        <div className="flex-1 overflow-auto">
          <pre className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-pre">{typesJsonStr}</pre>
        </div>
      </div>
    </div>
  );
}

function ContentTopbar({
  page,
  section,
  codeOpen,
  onCodeToggle,
  onAddField,
  onDeleteSection,
  changeCount,
  saving,
  publishing,
  onPublish,
  onShowChanges,
  currentBranch,
  readOnly,
}: {
  page: string;
  section: string;
  codeOpen: boolean;
  onCodeToggle: () => void;
  onAddField: () => void;
  onDeleteSection: () => void;
  changeCount: number;
  saving: boolean;
  publishing: boolean;
  onPublish: (targetBranch: string) => void;
  onShowChanges: () => void;
  currentBranch: string;
  readOnly?: boolean;
}) {
  const displayName = section;

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-6 h-10">
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium pr-1">{displayName.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
        {saving && (
          <span className="text-[10px] text-muted-foreground/50 ml-1">Saving...</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {!readOnly && (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="secondary" size="xs" onClick={onAddField} className="gap-1.5" />
                }
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" />
                </svg>
                <span className="text-xs">Add Field</span>
              </TooltipTrigger>
              <TooltipContent>Add Field</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon-xs"
                    onClick={onCodeToggle}
                    className={codeOpen ? "!bg-foreground/20" : ""}
                  />
                }
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              </TooltipTrigger>
              <TooltipContent>Code</TooltipContent>
            </Tooltip>
          </>
        )}
        {!readOnly && changeCount > 0 && (
          <>
            <div className="w-px h-4 bg-border mx-0.5" />
            <button
              onClick={onShowChanges}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground/10 px-1 text-[10px] leading-none font-medium">
                {changeCount}
              </span>
              <span>changes</span>
            </button>
            <Button
              size="xs"
              onClick={() => onPublish(currentBranch)}
              disabled={publishing}
              className="gap-1"
            >
              {publishing ? "Publishing..." : "Publish"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ChangesDialog({
  open,
  onOpenChange,
  changes,
  onDiscard,
  onDiscardFile,
  projectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  changes: DraftChange[];
  onDiscard: () => void;
  onDiscardFile: (filename: string) => void;
  projectId: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [diffs, setDiffs] = useState<Record<string, string[]>>({});
  const [diffLoading, setDiffLoading] = useState<Set<string>>(new Set());

  async function toggleExpanded(filename: string) {
    if (expanded.has(filename)) {
      setExpanded((prev) => { const next = new Set(prev); next.delete(filename); return next; });
      return;
    }
    setExpanded((prev) => new Set(prev).add(filename));
    if (diffs[filename]) return;
    setDiffLoading((prev) => new Set(prev).add(filename));
    try {
      const res = await fetch(`/api/projects/${projectId}/kern/draft/diff?path=${encodeURIComponent(filename)}`);
      if (res.ok) {
        const data = await res.json();
        setDiffs((prev) => ({ ...prev, [filename]: data.diff }));
      }
    } finally {
      setDiffLoading((prev) => { const next = new Set(prev); next.delete(filename); return next; });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-sm">Unpublished Changes</DialogTitle>
          <DialogDescription className="text-xs">{changes.length} file{changes.length !== 1 ? "s" : ""} changed</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {changes.map((c) => {
            const isExpanded = expanded.has(c.filename);
            const isLoading = diffLoading.has(c.filename);
            const diff = diffs[c.filename];
            return (
              <div key={c.filename} className="border-b border-border last:border-0">
                <div
                  className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpanded(c.filename)}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    c.status === "added" ? "bg-green-500/10 text-green-500" :
                    c.status === "deleted" || c.status === "removed" ? "bg-red-500/10 text-red-500" :
                    "bg-yellow-500/10 text-yellow-500"
                  }`}>
                    {c.status === "added" ? "A" : c.status === "deleted" || c.status === "removed" ? "D" : "M"}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground flex-1 truncate">{c.filename}</span>
                  {diff && (() => {
                    const adds = diff.filter(l => l.startsWith("+")).length;
                    const dels = diff.filter(l => l.startsWith("-")).length;
                    if (!adds && !dels) return null;
                    return (
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        {adds > 0 && <span className="text-green-500">+{adds}</span>}
                        {adds > 0 && dels > 0 && " "}
                        {dels > 0 && <span className="text-red-500">-{dels}</span>}
                      </span>
                    );
                  })()}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDiscardFile(c.filename); }}
                    className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors"
                    title="Revert this change"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </button>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-3">
                    {isLoading ? (
                      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" className="opacity-25" />
                          <path d="M4 12a8 8 0 018-8" className="opacity-75" />
                        </svg>
                        Loading diff...
                      </div>
                    ) : diff ? (
                      <div className="rounded-md border border-border bg-muted/20 overflow-x-auto">
                        <pre className="text-[11px] leading-relaxed font-mono p-2">
                          {diff.map((line, i) => {
                            const color =
                              line.startsWith("+") ? "text-green-500" :
                              line.startsWith("-") ? "text-red-500" :
                              "text-muted-foreground";
                            return (
                              <div key={i} className={`${color} ${line.startsWith("+") ? "bg-green-500/5" : line.startsWith("-") ? "bg-red-500/5" : ""}`}>
                                {line || "\u00A0"}
                              </div>
                            );
                          })}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">Could not load diff</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-b-xl px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => { onDiscard(); onOpenChange(false); }} className="text-destructive hover:text-destructive">
            Discard All
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScanFilePicker({ files, selected, onChange, loading }: {
  files: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = files.filter((f) =>
    f.toLowerCase().includes(search.toLowerCase())
  );

  const selectedSet = new Set(selected);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggle(file: string) {
    if (selectedSet.has(file)) {
      onChange(selected.filter((f) => f !== file));
    } else {
      onChange([...selected, file]);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Files to scan</p>
      <div ref={containerRef} className="relative">
        {loading ? (
          <div className="flex h-8 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5">
            <svg className="size-3.5 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" className="opacity-75" />
            </svg>
            <span className="text-sm text-muted-foreground">Loading files...</span>
          </div>
        ) : (
          <>
            <div className={`flex h-8 items-center rounded-lg border bg-transparent transition-colors ${open ? "border-ring ring-3 ring-ring/50" : "border-input"}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="ml-2.5 shrink-0 text-muted-foreground">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                placeholder={open ? "Search files..." : selected.length === files.length ? "All files" : `${selected.length} files selected`}
                value={open ? search : ""}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setOpen(true)}
                className="h-full flex-1 bg-transparent px-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <span className="mr-2.5 text-xs text-muted-foreground shrink-0">{selected.length}/{files.length}</span>
            </div>
            {open && (
              <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-full rounded-lg border border-border bg-popover shadow-md ring-1 ring-foreground/10 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
                  <button
                    type="button"
                    onClick={() => onChange(files)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >Select all</button>
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >Deselect all</button>
                </div>
                <div className="max-h-52 overflow-y-auto py-1">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No files found</p>
                  ) : (
                    filtered.map((file) => {
                      const isSelected = selectedSet.has(file);
                      return (
                        <button
                          key={file}
                          type="button"
                          onClick={() => toggle(file)}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm font-mono transition-colors hover:bg-accent ${
                            isSelected ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          <span className={`flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                            isSelected ? "border-foreground/30 bg-foreground/10" : "border-input"
                          }`}>
                            {isSelected && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                          {file}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ErrorPanel({
  error,
  page,
  section,
  srcDir,
  projectId,
  draft,
  currentBranch,
  readOnly,
}: {
  error: string;
  page: string;
  section: string;
  srcDir?: string | null;
  projectId: string;
  draft: ReturnType<typeof useDraft>;
  currentBranch: string;
  readOnly?: boolean;
}) {
  const [aiConfigured, setAiConfigured] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);

  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((d) => setAiConfigured(d.has_key_1 === true))
      .catch(() => {});
  }, []);

  async function handleFix() {
    setFixing(true);
    setFixError(null);
    const base = srcDir ? `${srcDir}/kern` : "kern";
    const filePath = page === "globals"
      ? `${base}/globals/${section}.json`
      : `${base}/content/${page}/${section}.json`;

    try {
      const res = await fetch(`/api/projects/${projectId}/kern/fix-json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, error }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFixError(data.error ?? "Failed to fix JSON");
        setFixing(false);
        return;
      }
      window.location.reload();
    } catch {
      setFixError("Network error");
      setFixing(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ContentTopbar
        page={page}
        section={section}
        codeOpen={false}
        onCodeToggle={() => {}}
        onAddField={() => {}}
        onDeleteSection={() => {}}
        changeCount={draft.changeCount}
        saving={draft.saving}
        publishing={draft.publishing}
        onPublish={async (targetBranch) => { await draft.publish(targetBranch); }}
        onShowChanges={() => setChangesOpen(true)}
        currentBranch={currentBranch}
        readOnly={readOnly}
      />
      <ChangesDialog
        open={changesOpen}
        onOpenChange={setChangesOpen}
        changes={draft.changes}
        onDiscard={draft.discard}
        onDiscardFile={draft.discardFile}
        projectId={projectId}
      />
      <div className="flex flex-col items-center justify-center flex-1 gap-3 px-8">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
        <p className="text-sm font-medium text-foreground">Failed to load content</p>
        <p className="text-sm text-muted-foreground text-center max-w-md font-mono">{error}</p>
        {fixError && (
          <p className="text-xs text-destructive text-center max-w-md">{fixError}</p>
        )}
        {aiConfigured && (
          <Button size="sm" onClick={handleFix} disabled={fixing} className="mt-1 gap-1.5">
            {fixing ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Fixing...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                  <path d="M20 3v4" /><path d="M22 5h-4" />
                </svg>
                Fix with AI
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function SectionEditor({
  files,
  loading,
  page,
  section,
  typesJson,
  draft,
  srcDir,
  projectId,
  currentBranch,
  error,
  selectedCommit,
  onCommitSelect,
  onSectionDeleted,
  readOnly,
}: {
  files: ContentFile[];
  loading: boolean;
  page: string;
  section: string;
  typesJson: Record<string, unknown>;
  draft: ReturnType<typeof useDraft>;
  srcDir?: string | null;
  projectId: string;
  currentBranch: string;
  error?: string | null;
  selectedCommit: string | null;
  onCommitSelect: (sha: string | null) => void;
  onSectionDeleted?: () => void;
  readOnly?: boolean;
}) {
  const [fileData, setFileData] = useState<Record<string, Record<string, unknown>>>({});
  const [fileSchemas, setFileSchemas] = useState<Record<string, Record<string, unknown>>>({});
  const [fieldOrder, setFieldOrder] = useState<Record<string, string[]>>({});
  const [codeOpen, setCodeOpen] = useState(false);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [deleteSectionOpen, setDeleteSectionOpen] = useState(false);
  const originalDataRef = useRef<Record<string, Record<string, unknown>>>({});

  useEffect(() => {
    console.trace("[SectionEditor] useEffect([files]) triggered — files ref changed");
    const data: Record<string, Record<string, unknown>> = {};
    const schemas: Record<string, Record<string, unknown>> = {};
    const order: Record<string, string[]> = {};
    for (const file of files) {
      data[file.filename] = { ...file.data };
      schemas[file.filename] = { ...file.schema };
      order[file.filename] = Object.keys(file.schema).length > 0 ? Object.keys(file.schema) : Object.keys(file.data);
    }

    // Check localStorage for unsaved changes (survives reload before DB save)
    for (const file of files) {
      try {
        const base = srcDir ? `${srcDir}/kern` : "kern";
        const filePath = page === "globals"
          ? `${base}/globals/${file.filename}.json`
          : `${base}/content/${page}/${file.filename}.json`;
        const cached = localStorage.getItem(`kern-draft:${projectId}:${filePath}`);
        if (cached) {
          data[file.filename] = JSON.parse(cached);
        }
      } catch { /* */ }
    }

    setFileData(data);
    setFileSchemas(schemas);
    setFieldOrder(order);
    // Use originalData from API (GitHub state) for diff comparison
    const originals: Record<string, Record<string, unknown>> = {};
    for (const file of files) {
      originals[file.filename] = file.originalData ? { ...file.originalData } : { ...file.data };
    }
    originalDataRef.current = JSON.parse(JSON.stringify(originals));

    // When viewing a historical commit, auto-save diff as pending changes
    if (selectedCommit) {
      for (const file of files) {
        const fileContent = data[file.filename];
        const original = originals[file.filename];
        if (JSON.stringify(fileContent) !== JSON.stringify(original)) {
          const base = srcDir ? `${srcDir}/kern` : "kern";
          const filePath = page === "globals"
            ? `${base}/globals/${file.filename}.json`
            : `${base}/content/${page}/${file.filename}.json`;
          draft.save(filePath, fileContent, original);
        }
      }
    }
  }, [files]);

  const discardInitRef = useRef(true);
  useEffect(() => {
    if (discardInitRef.current) { discardInitRef.current = false; return; }
    const restored: Record<string, Record<string, unknown>> = {};
    for (const file of files) {
      restored[file.filename] = file.originalData ? { ...file.originalData } : { ...file.data };
    }
    setFileData(JSON.parse(JSON.stringify(restored)));
    originalDataRef.current = JSON.parse(JSON.stringify(restored));
  }, [draft.discardVersion]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const allKeys = Object.values(fieldOrder).flat();
  const allSortableIds = [...allKeys];

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fieldContainerRef = useRef<HTMLDivElement>(null);
  const preventScrollRef = useRef<((e: Event) => void) | null>(null);

  // Custom collision detection: only detect collisions when pointer is inside the field container
  const containerCollision: CollisionDetection = useCallback((args) => {
    const container = fieldContainerRef.current;
    if (!container) return [];
    const pointer = args.pointerCoordinates;
    if (!pointer) return closestCenter(args);
    const rect = container.getBoundingClientRect();
    const inContainer =
      pointer.x >= rect.left && pointer.x <= rect.right &&
      pointer.y >= rect.top && pointer.y <= rect.bottom;
    if (!inContainer) return [];
    return closestCenter(args);
  }, []);

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string);
    // Freeze all scroll
    if (scrollRef.current) scrollRef.current.style.overflow = "hidden";
    // Prevent native drag auto-scroll globally
    const prevent = (e: Event) => { e.preventDefault(); };
    preventScrollRef.current = prevent;
    window.addEventListener("dragover", prevent, { passive: false });
    window.addEventListener("scroll", prevent, true);
  }

  function handleDragOver(event: { over: { id: string | number } | null }) {
    setDragOverId(event.over ? String(event.over.id) : null);
  }

  function cleanupDrag() {
    setActiveDragId(null);
    setDragOverId(null);
    if (scrollRef.current) scrollRef.current.style.overflow = "";
    if (preventScrollRef.current) {
      window.removeEventListener("dragover", preventScrollRef.current);
      window.removeEventListener("scroll", preventScrollRef.current, true);
      preventScrollRef.current = null;
    }
  }

  function handleDragCancel() {
    cleanupDrag();
  }

  function saveToDraft(filename: string, data: Record<string, unknown>) {
    const base = srcDir ? `${srcDir}/kern` : "kern";
    const filePath = page === "globals"
      ? `${base}/globals/${filename}.json`
      : `${base}/content/${page}/${filename}.json`;
    const original = originalDataRef.current[filename] ?? {};
    draft.save(filePath, data, original);
  }

  const handleFieldChange = useCallback((filename: string, key: string, value: unknown) => {
    const updatedFile = { ...(fileData[filename] ?? {}), [key]: value };
    setFileData((prev) => ({ ...prev, [filename]: updatedFile }));
    saveToDraft(filename, updatedFile);
  }, [draft, page, srcDir, fileData]);

  function handleAddField(key: string, type: string) {
    const targetFile = files[0]?.filename;
    if (!targetFile) return;
    const updatedData = { ...(fileData[targetFile] ?? {}), [key]: getDefaultValue(type) };
    setFileData((prev) => ({ ...prev, [targetFile]: updatedData }));
    setFileSchemas((prev) => ({
      ...prev,
      [targetFile]: { ...prev[targetFile], [key]: getSchemaValue(type) },
    }));
    setFieldOrder((prev) => ({
      ...prev,
      [targetFile]: [...(prev[targetFile] ?? []), key],
    }));
    setAddFieldOpen(false);
    saveToDraft(targetFile, updatedData);
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-6 h-10">
          <div className="flex items-center gap-3">
            <div className="h-4 w-24 rounded bg-muted/50 animate-pulse" />
            <div className="h-3 w-px bg-muted/30" />
            <div className="h-3 w-40 rounded bg-muted/40 animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-6 w-20 rounded bg-muted/40 animate-pulse" />
            <div className="h-6 w-16 rounded bg-muted/40 animate-pulse" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-8 py-8">
            <div className="flex flex-col gap-7">
              {[64, 78, 52, 90, 68].map((w, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div className="h-3.5 rounded bg-muted/50 animate-pulse" style={{ width: `${w}px` }} />
                  <div className="h-9 w-full rounded-md bg-muted/30 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorPanel
        error={error}
        page={page}
        section={section}
        srcDir={srcDir}
        projectId={projectId}
        draft={draft}
        currentBranch={currentBranch}
        readOnly={readOnly}
      />
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <ContentTopbar
          page={page}
          section={section}
          codeOpen={false}
          onCodeToggle={() => {}}
          onAddField={() => {}}
          onDeleteSection={() => setDeleteSectionOpen(true)}
          changeCount={draft.changeCount}
          saving={draft.saving}
          publishing={draft.publishing}
          onPublish={async (targetBranch) => { await draft.publish(targetBranch); }}
          onShowChanges={() => setChangesOpen(true)}
          currentBranch={currentBranch}
          readOnly={readOnly}
        />
        <ChangesDialog
          open={changesOpen}
          onOpenChange={setChangesOpen}
          changes={draft.changes}
          onDiscard={draft.discard}
          onDiscardFile={draft.discardFile}
          projectId={projectId}
        />
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          </svg>
          <p className="text-sm text-muted-foreground">No content files in this section.</p>
        </div>
        <Dialog open={deleteSectionOpen} onOpenChange={setDeleteSectionOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Section?</DialogTitle>
              <DialogDescription>
                This will mark <span className="font-mono font-medium text-foreground">{section}.json</span> for deletion. The change won&apos;t be committed until you publish.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteSectionOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  setDeleteSectionOpen(false);
                  const base = srcDir ? `${srcDir}/kern` : "kern";
                  const filePath = page === "globals"
                    ? `${base}/globals/${section}.json`
                    : `${base}/content/${page}/${section}.json`;
                  await draft.deleteFile(filePath);
                  toast.success(`${section}.json marked for deletion`);
                  onSectionDeleted?.();
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    cleanupDrag();
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const targetFile = files[0]?.filename;
    if (!targetFile) return;

    // Dragging a new field type from the drawer
    if (activeId.startsWith("_new:")) {
      const fieldType = activeId.slice(5);
      let base = `new_${fieldType}`;
      const existing = fieldOrder[targetFile] ?? [];
      if (existing.includes(base)) {
        let i = 2;
        while (existing.includes(`${base}_${i}`)) i++;
        base = `${base}_${i}`;
      }
      const newKey = base;

      const overIndex = existing.indexOf(overId);
      const insertAt = overIndex >= 0 ? overIndex + 1 : existing.length;

      const updatedData = { ...(fileData[targetFile] ?? {}), [newKey]: getDefaultValue(fieldType) };
      setFileData((prev) => ({ ...prev, [targetFile]: updatedData }));
      setFileSchemas((prev) => ({
        ...prev,
        [targetFile]: { ...prev[targetFile], [newKey]: getSchemaValue(fieldType) },
      }));
      setFieldOrder((prev) => {
        const keys = [...(prev[targetFile] ?? [])];
        keys.splice(insertAt, 0, newKey);
        return { ...prev, [targetFile]: keys };
      });
      setAddFieldOpen(false);
      saveToDraft(targetFile, updatedData);
      return;
    }

    // Reordering existing fields
    if (activeId === overId) return;
    setFieldOrder((prev) => {
      const keys = prev[targetFile] ?? [];
      const oldIndex = keys.indexOf(activeId);
      const newIndex = keys.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return { ...prev, [targetFile]: arrayMove(keys, oldIndex, newIndex) };
    });
    saveToDraft(targetFile, fileData[targetFile] ?? {});
  }

  function handleRenameField(filename: string, oldKey: string, newKey: string) {
    setFieldOrder((prev) => ({
      ...prev,
      [filename]: (prev[filename] ?? []).map((k) => k === oldKey ? newKey : k),
    }));
    const updatedData = { ...fileData[filename] };
    const val = updatedData[oldKey];
    delete updatedData[oldKey];
    updatedData[newKey] = val;
    setFileData((prev) => ({ ...prev, [filename]: updatedData }));
    setFileSchemas((prev) => {
      const schema = { ...prev[filename] };
      const v = schema[oldKey];
      delete schema[oldKey];
      schema[newKey] = v;
      return { ...prev, [filename]: schema };
    });
    saveToDraft(filename, updatedData);
  }

  function handleRemoveField(filename: string, key: string) {
    setFieldOrder((prev) => ({
      ...prev,
      [filename]: (prev[filename] ?? []).filter((k) => k !== key),
    }));
    const updatedData = { ...fileData[filename] };
    delete updatedData[key];
    setFileData((prev) => ({ ...prev, [filename]: updatedData }));
    setFileSchemas((prev) => {
      const copy = { ...prev[filename] };
      delete copy[key];
      return { ...prev, [filename]: copy };
    });
    saveToDraft(filename, updatedData);
  }

  function handleChangeFieldType(filename: string, key: string, newType: string) {
    const newSchemaValue = getSchemaValue(newType);
    setFileSchemas((prev) => ({
      ...prev,
      [filename]: { ...prev[filename], [key]: newSchemaValue },
    }));

    const base = srcDir ? `${srcDir}/kern` : "kern";
    const typesPath = `${base}/types.json`;
    const updated = JSON.parse(JSON.stringify(typesJson));
    if (page === "globals") {
      if (!updated.globals) updated.globals = {};
      if (!updated.globals[filename]) updated.globals[filename] = {};
      updated.globals[filename][key] = newSchemaValue;
    } else {
      if (!updated.content) updated.content = {};
      if (!updated.content[page]) updated.content[page] = {};
      if (!updated.content[page][filename]) updated.content[page][filename] = {};
      updated.content[page][filename][key] = newSchemaValue;
    }
    draft.save(typesPath, updated, typesJson);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={containerCollision} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <div className="flex flex-col h-full overflow-hidden">
        <ContentTopbar
          page={page}
          section={section}
          codeOpen={codeOpen}
          onCodeToggle={() => setCodeOpen(!codeOpen)}
          onAddField={() => setAddFieldOpen(true)}
          onDeleteSection={() => setDeleteSectionOpen(true)}
          changeCount={draft.changeCount}
          saving={draft.saving}
          publishing={draft.publishing}
          onPublish={(targetBranch) => {
            if (selectedCommit) {
              setRevertConfirmOpen(true);
            } else {
              (async () => { originalDataRef.current = JSON.parse(JSON.stringify(fileData)); await draft.publish(targetBranch); toast.success("Successfully published"); })();
            }
          }}
          onShowChanges={() => setChangesOpen(true)}
          currentBranch={currentBranch}
          readOnly={readOnly}
        />
        <ChangesDialog
          open={changesOpen}
          onOpenChange={setChangesOpen}
          changes={draft.changes}
          onDiscard={draft.discard}
          onDiscardFile={draft.discardFile}
          projectId={projectId}
        />
        <Dialog open={revertConfirmOpen} onOpenChange={setRevertConfirmOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Auf Commit zurücksetzen?</DialogTitle>
              <DialogDescription>
                Alle Inhalte werden auf den Stand von <span className="font-mono font-medium text-foreground">{selectedCommit?.slice(0, 7)}</span> zurückgesetzt. Änderungen, die nach diesem Commit gemacht wurden, gehen verloren.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRevertConfirmOpen(false)}>Abbrechen</Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  setRevertConfirmOpen(false);
                  originalDataRef.current = JSON.parse(JSON.stringify(fileData));
                  await draft.publish(currentBranch);
                  onCommitSelect(null);
                  toast.success("Successfully published");
                }}
              >
                Zurücksetzen & Publishen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={deleteSectionOpen} onOpenChange={setDeleteSectionOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Section?</DialogTitle>
              <DialogDescription>
                This will mark <span className="font-mono font-medium text-foreground">{section}.json</span> for deletion. The change won&apos;t be committed until you publish.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteSectionOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  setDeleteSectionOpen(false);
                  const base = srcDir ? `${srcDir}/kern` : "kern";
                  const filePath = page === "globals"
                    ? `${base}/globals/${section}.json`
                    : `${base}/content/${page}/${section}.json`;
                  await draft.deleteFile(filePath);
                  toast.success(`${section}.json marked for deletion`);
                  onSectionDeleted?.();
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-none">
          <div className="mx-auto max-w-2xl px-8 py-8">
            <div ref={fieldContainerRef} className="flex flex-col gap-8">
              {files.map((file) => {
                const keys = fieldOrder[file.filename] ?? [];
                const schema = fileSchemas[file.filename] ?? file.schema;
                return (
                  <div key={file.filename}>
                    {files.length > 1 && (
                      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-input">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                        </svg>
                        <span className="text-xs font-mono text-muted-foreground">{file.filename}.json</span>
                      </div>
                    )}
                    <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
                      <div className="flex flex-col gap-8">
                        {keys.map((key) => {
                          const schemaValue = schema[key];
                          if (!schemaValue) return null;
                          const isNewDrag = activeDragId?.startsWith("_new:") ?? false;
                          const showGhostAfter = isNewDrag && dragOverId === key;
                          return (
                            <div key={key}>
                              <SortableField
                                id={key}
                                fieldKey={key}
                                value={(fileData[file.filename] ?? file.data)[key]}
                                schemaValue={schemaValue}
                                onChange={(v) => handleFieldChange(file.filename, key, v)}
                                onRemove={() => handleRemoveField(file.filename, key)}
                                onRename={(oldKey, newKey) => handleRenameField(file.filename, oldKey, newKey)}
                                onChangeType={(newType) => handleChangeFieldType(file.filename, key, newType)}
                                existingKeys={keys}
                                isDirty={JSON.stringify((fileData[file.filename] ?? {})[key]) !== JSON.stringify((originalDataRef.current[file.filename] ?? {})[key])}
                                readOnly={readOnly}
                              />
                              {showGhostAfter && (() => {
                                const fieldType = activeDragId!.slice(5);
                                const ft = FIELD_TYPES.find((f) => f.type === fieldType);
                                if (!ft) return null;
                                return (
                                  <div className="mt-5 opacity-40 pointer-events-none border border-dashed border-primary/40 rounded-lg p-3">
                                    <div className="flex items-center gap-1 mb-2">
                                      <span className="text-sm font-medium">{ft.label}</span>
                                    </div>
                                    <FieldRenderer fieldKey={`new_${fieldType}`} value={getDefaultValue(fieldType)} schemaValue={getSchemaValue(fieldType)} onChange={() => {}} hideLabel disabled />
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    </SortableContext>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Code Panel */}
        {codeOpen && (
          <div className="h-60 shrink-0 border-t border-border bg-background">
            <CodePanel files={files} fileData={fileData} typesJson={typesJson} />
          </div>
        )}

        {/* Add Field Drawer */}
        {!readOnly && addFieldOpen && (
          <div className="fixed inset-0 z-40" onClick={() => setAddFieldOpen(false)} />
        )}
        {!readOnly && <AddFieldDrawer open={addFieldOpen} onOpenChange={setAddFieldOpen} onAdd={handleAddField} existingKeys={allKeys} />}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDragId && (() => {
          if (activeDragId.startsWith("_new:")) {
            const fieldType = activeDragId.slice(5);
            const ft = FIELD_TYPES.find((f) => f.type === fieldType);
            if (!ft) return null;
            return (
              <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 shadow-lg">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted/50 text-muted-foreground">
                  {FIELD_TYPE_ICONS[fieldType]}
                </span>
                <span className="text-sm font-medium">{ft.label}</span>
              </div>
            );
          }
          return (
            <div className="rounded-md border border-border bg-background px-3 py-2 shadow-lg">
              <span className="text-sm font-medium">{keyToLabel(activeDragId)}</span>
            </div>
          );
        })()}
      </DragOverlay>
    </DndContext>
  );
}

// ── Main ────────────────────────────────────────────────────

export default function ContentPage() {
  const { current, updateProject } = useProjects();
  const isAdmin = useIsAdmin();
  const router = useRouter();

  useEffect(() => {
    if (current && !current.onboardingComplete) router.replace("/");
  }, [current, router]);

  const searchParams = useSearchParams();
  const [advancedView, setAdvancedView] = useState(false);
  useEffect(() => {
    fetch("/api/preferences").then((r) => r.json()).then((d) => setAdvancedView(d.advancedView ?? false)).catch(() => {});
    const onPrefChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if ("advancedView" in detail) setAdvancedView(detail.advancedView);
    };
    window.addEventListener("preferences-change", onPrefChange);
    return () => window.removeEventListener("preferences-change", onPrefChange);
  }, []);
  const [scanChangesOpen, setScanChangesOpen] = useState(false);
  const [sidebarDeleteTarget, setSidebarDeleteTarget] = useState<{ page: string; section: string; type: "section" | "global" } | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const { pages, loading: pagesLoading, loadedForProject, reload: reloadPages } = useKernPages(current?.id, selectedCommit);
  const [selectedPage, setSelectedPage] = useState<PageInfo | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [activeGlobal, setActiveGlobal] = useState<string | null>(null);
  const [activeScan, setActiveScan] = useState(false);
  const [scanStep, setScanStep] = useState<"intro" | "confirm" | "running">("intro");
  const [scanPhase, setScanPhase] = useState<"visible" | "out" | "in">("visible");
  const [scanFiles, setScanFiles] = useState<string[]>([]);
  const [scanFilesLoading, setScanFilesLoading] = useState(false);
  const [scanSelectedFiles, setScanSelectedFiles] = useState<string[]>([]);
  const [scanOptions, setScanOptions] = useState({
    scan: true,
    generateJson: true,
    createTypes: true,
    replaceHardcoded: true,
    cleanup: true,
  });
  const [scanJobId, setScanJobId] = useState<string | null>(null);
  const [scanCurrentTask, setScanCurrentTask] = useState("scan");
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<{ file: string; strings: { original: string; key: string; page?: string; section: string; type: string }[] }[]>([]);
  const [scanReviewOpen, setScanReviewOpen] = useState(false);
  const [scanReviewResults, setScanReviewResults] = useState<typeof scanResults>([]);
  const [scanExcluded, setScanExcluded] = useState<Set<string>>(new Set());
  const [scanReviewSearch, setScanReviewSearch] = useState("");
  const [scanCollapsed, setScanCollapsed] = useState<Set<number>>(new Set());
  const [scanPendingFiles, setScanPendingFiles] = useState<{ path: string; content: string }[]>([]);
  const [scanFilesReviewOpen, setScanFilesReviewOpen] = useState(false);
  const [scanFilesExcluded, setScanFilesExcluded] = useState<Set<number>>(new Set());
  const [scanFilesCollapsed, setScanFilesCollapsed] = useState<Set<number>>(new Set());
  const scanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const draft = useDraft(current?.id);

  const loadScanFiles = useCallback(() => {
    if (!current?.repo || !current?.branch) return;
    const [owner, repo] = current.repo.split("/");
    setScanFilesLoading(true);
    fetch(`/api/github/repos/${owner}/${repo}/tree?branch=${current.branch}`)
      .then((r) => r.json())
      .then((files: string[]) => {
        const srcFiles = files.filter((f) =>
          /\.(tsx?|jsx?|vue|svelte|astro|html)$/.test(f) && !f.includes("node_modules")
        );
        setScanFiles(srcFiles);
        setScanSelectedFiles(srcFiles);
      })
      .catch(() => {})
      .finally(() => setScanFilesLoading(false));
  }, [current?.repo, current?.branch]);

  const stopPolling = useCallback(() => {
    if (scanPollRef.current) { clearInterval(scanPollRef.current); scanPollRef.current = null; }
  }, []);

  const pollScan = useCallback(() => {
    if (!current?.id) return;
    const poll = () => {
      fetch(`/api/projects/${current.id}/kern/scan`, { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (!data.active && data.status === "cancelled") {
            stopPolling();
            toast.info("Scan cancelled");
            setScanStep("confirm");
            setScanStatus(null);
            return;
          }
          if (!data.active && data.status === "failed") {
            stopPolling();
            toast.error(data.error ?? "Scan failed");
            setScanStep("confirm");
            setScanStatus(null);
            return;
          }
          setScanCurrentTask(data.currentTask ?? "scan");
          setScanResults(data.results ?? []);
          setScanPendingFiles(data.pendingFiles ?? []);
          setScanStatus(data.status);
          if (data.status === "review" || data.status === "completed") {
            stopPolling();
          }
        })
        .catch(() => {});
    };
    poll();
    scanPollRef.current = setInterval(poll, 2000);
  }, [current?.id, stopPolling]);

  const refreshAndPoll = useCallback(async () => {
    if (!current?.id) return;
    try {
      const r = await fetch(`/api/projects/${current.id}/kern/scan`, { cache: "no-store" });
      const data = await r.json();
      setScanCurrentTask(data.currentTask ?? "scan");
      setScanResults(data.results ?? []);
      setScanPendingFiles(data.pendingFiles ?? []);
      setScanStatus(data.status);
      if (data.status === "running") {
        pollScan();
      }
    } catch { /* ignore */ }
  }, [current?.id, pollScan]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    if (!current?.id) return;
    fetch(`/api/projects/${current.id}/kern/scan`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.active) {
          setActiveScan(true);
          setActiveSection(null);
          setActiveGlobal(null);
          setScanStep("running");
          setScanJobId(data.id);
          setScanStatus(data.status);
          setScanCurrentTask(data.currentTask);
          setScanResults(data.results ?? []);
          setScanPendingFiles(data.pendingFiles ?? []);
          setScanOptions(data.options ?? { scan: true, generateJson: true, createTypes: true, replaceHardcoded: true, cleanup: true });
          if (data.status === "running") {
            const poll = () => {
              fetch(`/api/projects/${current.id}/kern/scan`)
                .then((r2) => r2.json())
                .then((d) => {
                  setScanCurrentTask(d.currentTask ?? "scan");
                  setScanResults(d.results ?? []);
                  setScanPendingFiles(d.pendingFiles ?? []);
                  setScanStatus(d.status);
                  if (d.status !== "running") stopPolling();
                })
                .catch(() => {});
            };
            scanPollRef.current = setInterval(poll, 2000);
          }
        }
      })
      .catch(() => {});
    return () => stopPolling();
  }, [current?.id, stopPolling]);

  const startScan = useCallback(async () => {
    if (!current?.id) return;
    const res = await fetch(`/api/projects/${current.id}/kern/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ options: scanOptions, files: scanSelectedFiles }),
    });
    const data = await res.json();
    setScanJobId(data.id);
    setScanStatus("running");
    setScanCurrentTask("scan");
    setScanResults([]);
    pollScan();
  }, [current?.id, scanOptions, scanSelectedFiles, pollScan]);

  const cancelScan = useCallback(async () => {
    if (!current?.id) return;
    stopPolling();
    await fetch(`/api/projects/${current.id}/kern/scan`, { method: "DELETE" });
    toast.info("Scan cancelled");
    setScanStatus(null);
    setScanCurrentTask("scan");
    setScanResults([]);
    setScanPendingFiles([]);
    setScanJobId(null);
    transitionScanStepRaw("intro");
  }, [current?.id, stopPolling]);

  function transitionScanStepRaw(next: "intro" | "confirm" | "running") {
    setScanPhase("out");
    setTimeout(() => {
      setScanStep(next);
      setScanPhase("in");
      setTimeout(() => setScanPhase("visible"), 150);
    }, 120);
  }

  const transitionScanStep = useCallback((next: "intro" | "confirm" | "running") => {
    if (next === "confirm") loadScanFiles();
    if (next === "running") {
      setScanPhase("out");
      setTimeout(() => {
        setScanStep(next);
        setScanPhase("in");
        setTimeout(() => setScanPhase("visible"), 150);
        startScan();
      }, 120);
      return;
    }
    transitionScanStepRaw(next);
  }, [loadScanFiles, startScan]);
  const [aiConfigured, setAiConfigured] = useState(false);

  const checkAiKey = useCallback(() => {
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((d) => setAiConfigured(d.has_key_1 === true))
      .catch(() => {});
  }, []);

  useEffect(() => { checkAiKey(); }, [checkAiKey]);

  useEffect(() => {
    window.addEventListener("profile-dialog-closed", checkAiKey);
    return () => window.removeEventListener("profile-dialog-closed", checkAiKey);
  }, [checkAiKey]);

  const initializedRef = useRef(false);
  const prevProjectIdRef = useRef<string | null>(null);
  const [globals, setGlobals] = useState<string[]>([]);
  const [globalFile, setGlobalFile] = useState<ContentFile | null>(null);
  const globalFiles = useMemo(() => globalFile ? [globalFile] : [] as ContentFile[], [globalFile]);
  const [globalTypesJson, setGlobalTypesJson] = useState<Record<string, unknown>>({});
  const [globalsLoading, setGlobalsLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [errorItems, setErrorItems] = useState<Set<string>>(new Set());
  const [generatingTypes, setGeneratingTypes] = useState(false);

  // Reset navigation state on project switch so sidebar/editor re-initialize
  // for the new project's pages and sections.
  useEffect(() => {
    const id = current?.id ?? null;
    const prev = prevProjectIdRef.current;
    if (prev && id && prev !== id) {
      setSelectedPage(null);
      setActiveSection(null);
      setActiveGlobal(null);
      setGlobals([]);
      setGlobalFile(null);
      setGlobalTypesJson({});
      setErrorItems(new Set());
      initializedRef.current = false;
      try { sessionStorage.removeItem("content-nav"); } catch { /* */ }
      router.replace("/content", { scroll: false });
    }
    prevProjectIdRef.current = id;
  }, [current?.id, router]);

  // Load globals list
  useEffect(() => {
    if (!current?.id) { setGlobals([]); return; }
    const url = selectedCommit
      ? `/api/projects/${current.id}/kern/globals?ref=${encodeURIComponent(selectedCommit)}`
      : `/api/projects/${current.id}/kern/globals`;
    fetch(url)
      .then((r) => r.ok ? r.json() : { globals: [] })
      .then((data) => setGlobals(data.globals ?? []));
  }, [current?.id, selectedCommit]);

  // Load active global file
  useEffect(() => {
    if (!current?.id || !activeGlobal) { setGlobalFile(null); setGlobalError(null); return; }
    const cacheKey = selectedCommit
      ? `${current.id}:globals:${activeGlobal}:${selectedCommit}`
      : `${current.id}:globals:${activeGlobal}`;
    const useCaching = current.editorCaching ?? true;
    let cancelled = false;

    if (useCaching && !selectedCommit) {
      const cached = sectionCache.get(cacheKey);
      if (cached) {
        setGlobalFile(cached.files[0] ?? null);
        setGlobalTypesJson(cached.typesJson);
        setGlobalError(cached.error);
        setGlobalsLoading(false);
        return () => { cancelled = true; };
      }
    }

    setGlobalsLoading(true);

    const body: Record<string, string> = { name: activeGlobal };
    if (selectedCommit) body.ref = selectedCommit;

    fetch(`/api/projects/${current.id}/kern/globals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.ok ? r.json() : { file: null })
      .then((data) => {
        if (cancelled) return;
        const file = data.file ?? null;
        const err = data.error ?? data.warning ?? null;
        if (useCaching && !selectedCommit) {
          sectionCache.set(cacheKey, { files: file ? [file] : [], typesJson: data.typesJson ?? {}, error: err });
        }
        setGlobalFile(file);
        setGlobalTypesJson(data.typesJson ?? {});
        setGlobalError(err);
        if (err && activeGlobal) {
          setErrorItems((prev) => new Set(prev).add(`global:${activeGlobal}`));
        }
      })
      .finally(() => { if (!cancelled) setGlobalsLoading(false); });

    return () => { cancelled = true; };
  }, [current?.id, activeGlobal, current?.editorCaching, selectedCommit]);

  useEffect(() => {
    if (!current?.id) return;
    let cancelled = false;
    fetch(`/api/projects/${current.id}/kern/content-health`)
      .then((r) => r.ok ? r.json() : { errors: [] })
      .then(async (data) => {
        if (cancelled) return;
        const items = (data.errors ?? []) as { key: string; message: string }[];
        const jsonErrors = items.filter((i) => i.message !== "No type definition");
        const missingTypes = items.filter((i) => i.message === "No type definition");

        if (jsonErrors.length > 0) {
          setErrorItems((prev) => {
            const next = new Set(prev);
            for (const item of jsonErrors) next.add(item.key);
            return next;
          });
        }

        if (missingTypes.length > 0) {
          setGeneratingTypes(true);
          try {
            const res = await fetch(`/api/projects/${current.id}/kern/content-health`, { method: "POST" });
            if (cancelled) return;
            const result = await res.json();
            if (result.added > 0) {
              window.location.reload();
              return;
            }
          } catch { /* */ }
          if (!cancelled) {
            setGeneratingTypes(false);
            setErrorItems((prev) => {
              const next = new Set(prev);
              for (const item of missingTypes) next.add(item.key);
              return next;
            });
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [current?.id]);

  function saveNavState(page?: string | null, section?: string | null, global?: string | null) {
    const state = { page: page ?? null, section: section ?? null, global: global ?? null };
    try { sessionStorage.setItem("content-nav", JSON.stringify(state)); } catch { /* */ }
    const params = new URLSearchParams();
    if (page) params.set("page", page);
    if (section) params.set("section", section);
    if (global) params.set("global", global);
    const qs = params.toString();
    router.replace(`/content${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  // Restore state from URL or sessionStorage on first load
  useEffect(() => {
    if (initializedRef.current || pages.length === 0) return;
    // Only initialize when pages are freshly loaded for the current project
    if (loadedForProject !== current?.id) return;
    initializedRef.current = true;

    // Try URL params first, then sessionStorage
    let urlPage = searchParams.get("page");
    let urlSection = searchParams.get("section");
    let urlGlobal = searchParams.get("global");

    if (!urlPage && !urlGlobal) {
      try {
        const saved = sessionStorage.getItem("content-nav");
        if (saved) {
          const s = JSON.parse(saved);
          urlPage = s.page;
          urlSection = s.section;
          urlGlobal = s.global;
        }
      } catch { /* */ }
    }

    if (urlGlobal && globals.includes(urlGlobal)) {
      setActiveGlobal(urlGlobal);
      if (urlPage) {
        const found = pages.find((p) => p.name === urlPage);
        if (found) setSelectedPage(found);
      }
      saveNavState(urlPage, null, urlGlobal);
      return;
    }

    const targetPage = urlPage ? pages.find((p) => p.name === urlPage) : pages[0];
    if (targetPage) {
      setSelectedPage(targetPage);
      const targetSection = urlSection && targetPage.sections.some((s) => s.name === urlSection)
        ? urlSection
        : targetPage.sections[0]?.name ?? null;
      setActiveSection(targetSection);
      saveNavState(targetPage.name, targetSection, null);
    }
  }, [pages, searchParams, loadedForProject, current?.id, globals]);

  // Auto-select first section when page changes (user-driven, not URL restore)
  useEffect(() => {
    if (!initializedRef.current) return;
    if (selectedPage && selectedPage.sections.length > 0 && !activeSection && !activeGlobal && !activeScan) {
      setActiveSection(selectedPage.sections[0].name);
    }
  }, [selectedPage, activeSection, activeGlobal, activeScan]);

  const { files, typesJson, loading: filesLoading, error: sectionError } = useSectionFiles(
    current?.id,
    activeGlobal ? null : selectedPage?.name ?? null,
    activeGlobal ? null : activeSection,
    current?.editorCaching ?? true,
    selectedCommit,
  );

  useEffect(() => {
    if (!selectedPage || !activeSection || activeGlobal) return;
    const key = `section:${selectedPage.name}:${activeSection}`;
    if (sectionError) {
      setErrorItems((prev) => new Set(prev).add(key));
    }
  }, [sectionError, selectedPage, activeSection, activeGlobal]);
  const { branches, loading: branchesLoading, reload: reloadBranches } = useBranches(current?.repo ?? undefined);
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  const currentBranch = activeBranch ?? current?.branch ?? "main";
  const { commits, loading: commitsLoading, reload: reloadCommits } = useCommits(current?.repo ?? undefined, currentBranch);

  function handleCommitSelect(sha: string | null) {
    setSelectedCommit(sha);
    setSelectedPage(null);
    setActiveSection(null);
    setActiveGlobal(null);
    setGlobalFile(null);
    setGlobalTypesJson({});
    setErrorItems(new Set());
    initializedRef.current = false;
    if (sha === null) reloadCommits();
  }

  async function handleBranchSwitch(branch: string) {
    if (!current) return;
    setActiveBranch(branch);
    setSelectedCommit(null);
    clearSectionCache(current.id);
    setSelectedPage(null);
    setActiveSection(null);
    setActiveGlobal(null);
    setGlobals([]);
    setGlobalFile(null);
    setGlobalTypesJson({});
    setErrorItems(new Set());
    initializedRef.current = false;
    await updateProject(current.id, { branch });
    reloadPages();
    fetch(`/api/projects/${current.id}/kern/globals`)
      .then((r) => r.ok ? r.json() : { globals: [] })
      .then((data) => setGlobals(data.globals ?? []));
  }

  function handleBranchCreate(name: string) {
    reloadBranches();
  }

  function selectSection(sectionName: string) {
    setActiveSection(sectionName);
    setActiveGlobal(null);
    setActiveScan(false);
    if (scanStatus !== "running" && scanStatus !== "review") setScanStep("intro");
    saveNavState(selectedPage?.name, sectionName, null);
  }

  function selectGlobal(name: string) {
    setActiveGlobal(name);
    setActiveSection(null);
    setActiveScan(false);
    if (scanStatus !== "running" && scanStatus !== "review") setScanStep("intro");
    saveNavState(selectedPage?.name, null, name);
  }

  if (!current?.repo || !current?.branch) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] gap-3">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
          <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
        <p className="text-sm text-muted-foreground">Connect a repository in project settings to load content.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border overflow-y-auto">
        {advancedView && (
          <div className="flex flex-col gap-1 p-3 pb-2">
            <p className="px-1 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">Git <span className="normal-case tracking-normal font-medium text-[9px] rounded-full bg-foreground/10 px-1.5 py-0.5 leading-none">Beta</span></p>
            <SidebarBranchSelector
              currentBranch={currentBranch}
              branches={branches}
              onSwitch={handleBranchSwitch}
              onCreate={handleBranchCreate}
              repo={current?.repo ?? ""}
            />
            <SidebarCommitSelector
              commits={commits}
              selectedSha={selectedCommit}
              onSelect={handleCommitSelect}
              loading={commitsLoading}
            />
          </div>
        )}
        <div className="sticky top-0 flex flex-col gap-1 p-3 pt-3">
          <p className="px-1 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Page</p>
          {pagesLoading ? (
            <div className="h-8 rounded-lg bg-muted/50 animate-pulse" />
          ) : (
            <PageSelector
              pages={pages}
              selected={selectedPage}
              onSelect={(page) => {
                setSelectedPage(page);
                setActiveGlobal(null);
                const firstSection = page.sections[0]?.name ?? null;
                setActiveSection(firstSection);
                saveNavState(page.name, firstSection, null);
              }}
              loading={pagesLoading}
            />
          )}
        </div>

        {pagesLoading ? (
          <div className="flex flex-col gap-0.5 px-3 pb-3">
            <p className="px-1 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Sections</p>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 w-full rounded-md bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : selectedPage && selectedPage.sections.length > 0 ? (() => {
          const sectionBase = current?.srcDir ? `${current.srcDir}/kern` : "kern";
          const visibleSections = selectedPage.sections.filter((s) => !draft.changes.some((c) => c.filename === `${sectionBase}/content/${selectedPage.name}/${s.name}.json` && c.status === "deleted"));
          return (
          <nav className="flex flex-col gap-0.5 px-3 pb-3">
            <p className="px-1 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Sections</p>
            {visibleSections.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground/50">No sections</p>
            ) : visibleSections.map((section) => {
              const isActive = activeSection === section.name && !activeGlobal;
              return (
                <div
                  key={section.name}
                  className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors cursor-pointer ${
                    isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                  onClick={() => selectSection(section.name)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                  </svg>
                  <span className="flex-1 text-left">{section.name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                  {selectedPage && errorItems.has(`section:${selectedPage.name}:${section.name}`) && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-destructive">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                      <path d="M12 9v4" /><path d="M12 17h.01" />
                    </svg>
                  )}
                  {current?.role !== "viewer" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setSidebarDeleteTarget({ page: selectedPage.name, section: section.name, type: "section" }); }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-destructive transition-all"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                  )}
                </div>
              );
            })}
          </nav>
          );
        })() : null}

        {globals.length > 0 && (() => {
          const globalBase = current?.srcDir ? `${current.srcDir}/kern` : "kern";
          const visibleGlobals = globals.filter((name) => !draft.changes.some((c) => c.filename === `${globalBase}/globals/${name}.json` && c.status === "deleted"));
          return (
          <nav className="flex flex-col gap-0.5 px-3 pb-3">
            <p className="px-1 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Globals</p>
            {visibleGlobals.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground/50">No globals</p>
            ) : visibleGlobals.map((name) => {
              const isActive = activeGlobal === name;
              return (
                <div
                  key={name}
                  onClick={() => selectGlobal(name)}
                  className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors cursor-pointer ${
                    isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" x2="22" y1="12" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <span className="flex-1 text-left">{name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                  {errorItems.has(`global:${name}`) && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-destructive">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                      <path d="M12 9v4" /><path d="M12 17h.01" />
                    </svg>
                  )}
                  {current?.role !== "viewer" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setSidebarDeleteTarget({ page: "globals", section: name, type: "global" }); }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-destructive transition-all"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                  )}
                </div>
              );
            })}
          </nav>
          );
        })()}

        {isAdmin && (
        <nav className="flex flex-col gap-0.5 px-3 pb-3">
          <p className="px-1 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Features</p>
          <button
            onClick={() => { setActiveScan(true); setActiveSection(null); setActiveGlobal(null); if (scanStatus === "running" || scanStatus === "review") setScanStep("running"); }}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${activeScan ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <line x1="7" x2="17" y1="12" y2="12" />
            </svg>
            <span className="flex-1 text-left">Smart Scan</span>
            <span className="text-[8px] font-medium uppercase tracking-wider rounded-full bg-foreground/10 px-1.5 py-0.5 text-muted-foreground">Beta</span>
          </button>
        </nav>
        )}
      </aside>

      {/* Content Area */}
      <main className="flex-1 overflow-hidden">
        {activeScan ? (
          <div className="flex flex-col h-full">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-6 h-10">
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium">Smart Scan</span>
              </div>
              <div className="flex items-center gap-1.5">
                {draft.changeCount > 0 && (
                  <>
                    <button
                      onClick={() => setScanChangesOpen(true)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground/10 px-1 text-[10px] leading-none font-medium">
                        {draft.changeCount}
                      </span>
                      <span>changes</span>
                    </button>
                    <Button
                      size="xs"
                      onClick={() => draft.publish(currentBranch)}
                      disabled={draft.publishing}
                      className="gap-1"
                    >
                      {draft.publishing ? "Publishing..." : "Publish"}
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center">
              {aiConfigured ? (
                <div className="w-full max-w-md" style={{
                  opacity: scanPhase === "out" ? 0 : 1,
                  filter: scanPhase === "out" ? "blur(6px)" : "blur(0px)",
                  transition: scanPhase === "out"
                    ? "opacity 120ms ease-out, filter 120ms ease-out"
                    : scanPhase === "in"
                      ? "opacity 150ms ease-out, filter 150ms ease-out"
                      : "none",
                }}>
                  {scanStep === "intro" ? (
                    <div className="flex flex-col items-center gap-4">
                      <span className="text-[9px] font-medium uppercase tracking-wider rounded-full bg-foreground/10 px-2 py-0.5 text-muted-foreground">Beta</span>
                      <h1 className="text-2xl font-bold font-[family-name:var(--font-averia)] tracking-tight -mt-2">Smart Scan</h1>
                      <p className="text-sm text-muted-foreground text-center max-w-xs">Scans your repository for hardcoded texts, generates types and content files, and replaces them automatically.</p>
                      <Button size="sm" className="mt-2 gap-2" onClick={() => transitionScanStep("confirm")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                          <line x1="7" x2="17" y1="12" y2="12" />
                        </svg>
                        Start Scan
                      </Button>
                    </div>
                  ) : scanStep === "confirm" ? (
                    <div className="flex flex-col gap-5 w-full">
                      <h2 className="text-2xl font-bold font-[family-name:var(--font-averia)] tracking-tight">Preferences</h2>

                      <ScanFilePicker
                        files={scanFiles}
                        selected={scanSelectedFiles}
                        onChange={setScanSelectedFiles}
                        loading={scanFilesLoading}
                      />

                      <div className="flex flex-col gap-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Options</p>
                        <div className="flex flex-col gap-1.5">
                          {([
                            { key: "scan" as const, label: "Scan for texts", desc: "Find all hardcoded strings in your source files", locked: true },
                            { key: "createTypes" as const, label: "Create content files & types", desc: "Create .json content files and add type definitions for each content structure" },
                            { key: "replaceHardcoded" as const, label: "Replace hardcoded strings", desc: "Swap hardcoded texts with template string references", needsCreateTypes: true },
                            { key: "cleanup" as const, label: "Cleanup", desc: "Review all modified files for formatting issues and fix them", needsCreateTypes: true },
                          ]).map((opt) => {
                            const disabled = opt.needsCreateTypes && !scanOptions.createTypes;
                            const active = scanOptions[opt.key] && !disabled;
                            return (
                              <button
                                key={opt.key}
                                disabled={disabled}
                                onClick={() => {
                                  if (opt.locked || disabled) return;
                                  setScanOptions((prev) => {
                                    const next = { ...prev, [opt.key]: !prev[opt.key] };
                                    if (opt.key === "createTypes") {
                                      next.generateJson = next.createTypes;
                                      if (!next.createTypes) {
                                        next.replaceHardcoded = false;
                                        next.cleanup = false;
                                      }
                                    }
                                    return next;
                                  });
                                }}
                                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                  active
                                    ? "border-foreground/20 bg-foreground/[0.04]"
                                    : "border-input hover:border-foreground/15"
                                } ${opt.locked ? "cursor-default" : "cursor-pointer"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                              >
                                <div className="flex flex-col gap-0.5 flex-1">
                                  <span className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{opt.label}</span>
                                  <span className="text-xs text-muted-foreground">{opt.desc}</span>
                                </div>
                                <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                                  active ? "border-foreground/30 bg-foreground/10" : "border-input"
                                }`}>
                                  {active && (
                                    <span className="size-2 rounded-full bg-foreground" />
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 justify-end">
                        <Button variant="secondary" size="sm" onClick={() => transitionScanStep("intro")}>Cancel</Button>
                        <Button size="sm" className="gap-2" disabled={scanSelectedFiles.length === 0} onClick={() => transitionScanStep("running")}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                            <line x1="7" x2="17" y1="12" y2="12" />
                          </svg>
                          Start
                        </Button>
                      </div>
                    </div>
                  ) : (() => {
                    const taskDefs = [
                      { key: "scan" as const, label: "Scan for texts", subtasks: ["Indexing source files", "Detecting hardcoded strings", "Analyzing text patterns"] },
                      { key: "createTypes" as const, label: "Create content files & types", subtasks: ["Grouping discovered texts", "Creating .json content files", "Inferring field types", "Generating type definitions", "Writing to types.json"] },
                      { key: "replaceHardcoded" as const, label: "Replace hardcoded strings", subtasks: ["Mapping strings to content keys", "Rewriting source files", "Verifying replacements"] },
                      { key: "cleanup" as const, label: "Cleanup", subtasks: ["Reviewing modified files", "Fixing formatting issues", "Finalizing changes"] },
                    ];
                    const activeTasks = taskDefs.filter((t) => scanOptions[t.key]);
                    const taskOrder = activeTasks.map((t) => t.key);
                    const effectiveTask = scanCurrentTask === "generateJson" ? "createTypes" : scanCurrentTask;
                    const currentIdx = taskOrder.indexOf(effectiveTask as typeof taskOrder[number]);
                    const allDone = scanStatus === "completed";
                    const scanDone = (scanStatus === "review" && scanCurrentTask === "scan") || allDone || (currentIdx > 0);
                    const totalStrings = scanResults.reduce((sum, r) => sum + r.strings.length, 0);

                    return (
                      <div className="flex flex-col gap-5 w-full">
                        <h2 className="text-2xl font-bold font-[family-name:var(--font-averia)] tracking-tight">{allDone ? "Scan Complete" : "Running Scan"}</h2>
                        <div className="flex flex-col gap-1.5">
                          {activeTasks.map((task, idx) => {
                            const isDone = allDone || idx < currentIdx || (idx === 0 && scanDone);
                            const isActive = !allDone && idx === currentIdx && !isDone && scanStatus !== "review";
                            const isPending = !allDone && (idx > currentIdx || (idx > 0 && scanStatus === "review" && scanCurrentTask === "scan"));
                            const needsReview = task.key === "scan" && scanStatus === "review" && scanCurrentTask === "scan";
                            const needsFilesReview = task.key === "createTypes" && scanStatus === "review" && scanCurrentTask === "generateJson";
                            return (
                              <div key={task.key} className="rounded-lg border border-input overflow-hidden">
                                <div className="flex items-center gap-3 px-3 py-2.5">
                                  {isDone ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-foreground">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  ) : isActive ? (
                                    <svg className="size-4 shrink-0 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                    </svg>
                                  ) : needsFilesReview ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-foreground">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  ) : (
                                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input" />
                                  )}
                                  <span className={`text-sm font-medium flex-1 ${isPending && !needsFilesReview ? "text-muted-foreground" : "text-foreground"}`}>{task.label}</span>
                                  {needsReview && (
                                    <Button
                                      size="xs"
                                      variant="secondary"
                                      onClick={() => {
                                        setScanReviewResults(JSON.parse(JSON.stringify(scanResults)));
                                        setScanExcluded(new Set());
                                        setScanReviewSearch("");
                                        setScanCollapsed(new Set());
                                        setScanReviewOpen(true);
                                      }}
                                    >
                                      Review ({totalStrings})
                                    </Button>
                                  )}
                                  {needsFilesReview && (
                                    <Button
                                      size="xs"
                                      variant="secondary"
                                      onClick={() => {
                                        setScanFilesExcluded(new Set());
                                        setScanFilesCollapsed(new Set());
                                        setScanFilesReviewOpen(true);
                                      }}
                                    >
                                      Review ({scanPendingFiles.length} files)
                                    </Button>
                                  )}
                                </div>
                                {isActive && (
                                  <div className="border-t border-input bg-foreground/[0.02] px-3 py-2 flex flex-col gap-1.5">
                                    {task.subtasks.map((sub, i) => (
                                      <div key={i} className="flex items-center gap-2.5 pl-1">
                                        <svg className="size-3 shrink-0 animate-spin text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                        </svg>
                                        <span className="text-xs text-muted-foreground">{sub}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex">
                          {allDone ? (
                            <Button size="sm" onClick={() => { setScanStep("intro"); setScanStatus(null); setScanCurrentTask("scan"); }}>Done</Button>
                          ) : (
                            <Button variant="secondary" size="sm" onClick={cancelScan}>Cancel</Button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                    <path d="M12 9v4" /><path d="M12 17h.01" />
                  </svg>
                  <p className="text-sm font-medium">AI key required</p>
                  <p className="text-xs text-muted-foreground text-center max-w-xs">Configure an AI provider key in your profile settings to use Smart Scan.</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-1 gap-2"
                    onClick={() => window.dispatchEvent(new CustomEvent("open-profile-dialog", { detail: { section: "ai" } }))}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    Open AI Settings
                  </Button>
                </div>
              )}
            </div>
            <Dialog open={scanReviewOpen} onOpenChange={setScanReviewOpen}>
              <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Review Scan Results</DialogTitle>
                  <DialogDescription>
                    {(() => {
                      const total = scanReviewResults.reduce((s, r) => s + r.strings.length, 0);
                      const selected = total - scanExcluded.size;
                      return `${selected} of ${total} strings selected. Click to deselect any you don't want to template.`;
                    })()}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto -mx-6 px-6">
                  <div className="flex flex-col gap-2 py-2">
                    {scanReviewResults.map((fileResult, fi) => {
                      const isCollapsed = scanCollapsed.has(fi);
                      const searchLower = scanReviewSearch.toLowerCase();
                      const matchingStrings = searchLower
                        ? fileResult.strings.filter((str) =>
                            str.original.toLowerCase().includes(searchLower) ||
                            str.key.toLowerCase().includes(searchLower) ||
                            str.section.toLowerCase().includes(searchLower)
                          )
                        : fileResult.strings;
                      if (searchLower && matchingStrings.length === 0) return null;
                      return (
                        <div key={fi} className="flex flex-col">
                          <button
                            onClick={() => setScanCollapsed((prev) => {
                              const next = new Set(prev);
                              if (next.has(fi)) next.delete(fi); else next.add(fi);
                              return next;
                            })}
                            className="flex items-center gap-1.5 py-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}>
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                            {fileResult.file}
                            <span className="text-muted-foreground/50">({matchingStrings.length})</span>
                          </button>
                          {!isCollapsed && (
                            <div className="flex flex-col gap-0.5">
                              {matchingStrings.map((str) => {
                                const si = fileResult.strings.indexOf(str);
                                const itemKey = `${fi}:${si}`;
                                const isExcluded = scanExcluded.has(itemKey);
                                return (
                                  <button
                                    key={si}
                                    onClick={() => {
                                      setScanExcluded((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(itemKey)) next.delete(itemKey); else next.add(itemKey);
                                        return next;
                                      });
                                    }}
                                    className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted/50 transition-colors ${isExcluded ? "opacity-50" : ""}`}
                                  >
                                    <span className={`flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                                      isExcluded ? "border-input" : "border-foreground/30 bg-foreground/10"
                                    }`}>
                                      {!isExcluded && (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                      )}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm truncate ${isExcluded ? "line-through text-muted-foreground" : ""}`}>{str.original}</p>
                                      <p className="text-[11px] text-muted-foreground">
                                        {str.section}.{str.key} <span className="text-muted-foreground/50">• {str.type}</span>
                                      </p>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <DialogFooter className="flex-row items-center gap-2">
                  <div className="flex-1 flex items-center rounded-lg border border-input h-8 bg-transparent">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="ml-2.5 shrink-0 text-muted-foreground">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                    </svg>
                    <input
                      placeholder="Search strings..."
                      value={scanReviewSearch}
                      onChange={(e) => setScanReviewSearch(e.target.value)}
                      className="h-full flex-1 bg-transparent px-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                    />
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setScanReviewOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={async () => {
                    if (!current?.id) return;
                    const filtered = scanReviewResults.map((fr, fi) => ({
                      ...fr,
                      strings: fr.strings.filter((_, si) => !scanExcluded.has(`${fi}:${si}`)),
                    })).filter((fr) => fr.strings.length > 0);
                    await fetch(`/api/projects/${current.id}/kern/scan`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "accept", results: filtered }),
                    });
                    setScanReviewOpen(false);
                    setScanExcluded(new Set());
                    toast.success(`Accepted ${filtered.reduce((s, r) => s + r.strings.length, 0)} strings`);
                    await refreshAndPoll();
                  }}>
                    Accept & Continue
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={scanFilesReviewOpen} onOpenChange={setScanFilesReviewOpen}>
              <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Review Generated Files</DialogTitle>
                  <DialogDescription>
                    {(() => {
                      const selected = scanPendingFiles.length - scanFilesExcluded.size;
                      return `${selected} of ${scanPendingFiles.length} files selected. Click to deselect files you don't want to create.`;
                    })()}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto -mx-6 px-6">
                  <div className="flex flex-col gap-2 py-2">
                    {scanPendingFiles.map((file, fi) => {
                      const isExcluded = scanFilesExcluded.has(fi);
                      const isCollapsed = scanFilesCollapsed.has(fi);
                      return (
                        <div key={fi} className={`rounded-lg border overflow-hidden transition-colors ${isExcluded ? "border-input/50 opacity-50" : "border-input"}`}>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <button
                              onClick={() => {
                                setScanFilesExcluded((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(fi)) next.delete(fi); else next.add(fi);
                                  return next;
                                });
                              }}
                              className="shrink-0"
                            >
                              <span className={`flex size-4 items-center justify-center rounded-sm border transition-colors ${
                                isExcluded ? "border-input" : "border-foreground/30 bg-foreground/10"
                              }`}>
                                {!isExcluded && (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </span>
                            </button>
                            <button
                              onClick={() => setScanFilesCollapsed((prev) => {
                                const next = new Set(prev);
                                if (next.has(fi)) next.delete(fi); else next.add(fi);
                                return next;
                              })}
                              className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}>
                                <path d="m6 9 6 6 6-6" />
                              </svg>
                              <span className="text-xs font-mono text-muted-foreground truncate">{file.path}</span>
                            </button>
                          </div>
                          {!isCollapsed && (
                            <div className="border-t border-input bg-foreground/[0.02] px-3 py-2 overflow-x-auto">
                              <pre className="text-xs text-muted-foreground font-mono whitespace-pre leading-relaxed">{file.content}</pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <DialogFooter className="flex-row items-center gap-2">
                  <div className="flex-1" />
                  <Button variant="secondary" size="sm" onClick={() => setScanFilesReviewOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={async () => {
                    if (!current?.id) return;
                    const acceptedFiles = scanPendingFiles.filter((_, i) => !scanFilesExcluded.has(i));
                    await fetch(`/api/projects/${current.id}/kern/scan`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "accept", files: acceptedFiles }),
                    });
                    setScanFilesReviewOpen(false);
                    setScanFilesExcluded(new Set());
                    toast.success(`Creating ${acceptedFiles.length} content files`);
                    await refreshAndPoll();
                  }}>
                    Create files
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <ChangesDialog
              open={scanChangesOpen}
              onOpenChange={setScanChangesOpen}
              changes={draft.changes}
              onDiscard={draft.discard}
              onDiscardFile={draft.discardFile}
              projectId={current?.id ?? ""}
            />
          </div>
        ) : generatingTypes ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin text-muted-foreground">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <p className="text-sm text-muted-foreground">Generating types...</p>
          </div>
        ) : activeGlobal && (globalFile || globalError) ? (
          <SectionEditor
            key={`global-${activeGlobal}`}
            files={globalFiles}
            loading={globalsLoading}
            page="globals"
            section={activeGlobal}
            typesJson={globalTypesJson}
            draft={draft}
            srcDir={current?.srcDir}
            projectId={current?.id ?? ""}
            currentBranch={currentBranch}
            error={globalError}
            selectedCommit={selectedCommit}
            onCommitSelect={handleCommitSelect}
            onSectionDeleted={() => {
              const remaining = globals.filter((g) => g !== activeGlobal);
              if (remaining.length > 0) {
                setActiveGlobal(remaining[0]);
              } else {
                setActiveGlobal(null);
              }
            }}
            readOnly={current?.role === "viewer"}
          />
        ) : selectedPage && activeSection ? (
          <SectionEditor
            key={`${selectedPage.name}-${activeSection}`}
            files={files}
            loading={filesLoading}
            page={selectedPage.name}
            section={activeSection}
            typesJson={typesJson}
            draft={draft}
            srcDir={current?.srcDir}
            projectId={current?.id ?? ""}
            currentBranch={currentBranch}
            error={sectionError}
            selectedCommit={selectedCommit}
            onCommitSelect={handleCommitSelect}
            onSectionDeleted={() => {
              const remaining = selectedPage.sections.filter((s) => s.name !== activeSection);
              if (remaining.length > 0) {
                setActiveSection(remaining[0].name);
              } else {
                setActiveSection(null);
              }
            }}
            readOnly={current?.role === "viewer"}
          />
        ) : activeGlobal && globalsLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : pagesLoading ? (
          <div className="flex flex-col h-full">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-6 h-10">
              <div className="flex items-center gap-3">
                <div className="h-4 w-28 rounded bg-muted/50 animate-pulse" />
                <div className="h-3 w-px bg-muted/30" />
                <div className="h-3 w-44 rounded bg-muted/40 animate-pulse" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-6 w-20 rounded bg-muted/40 animate-pulse" />
                <div className="h-6 w-16 rounded bg-muted/40 animate-pulse" />
              </div>
            </div>
            <div className="mx-auto max-w-2xl px-8 py-8 w-full">
            <div className="flex flex-col gap-7">
              {[64, 78, 52, 90, 68].map((w, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div className="h-3.5 rounded bg-muted/50 animate-pulse" style={{ width: `${w}px` }} />
                  <div className="h-9 w-full rounded-md bg-muted/30 animate-pulse" />
                </div>
              ))}
            </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
            <p className="text-sm text-muted-foreground">
              {pages.length === 0 ? "No kern/content/ directory found in this repo." : "Select a page to start editing."}
            </p>
            {pages.length === 0 && (
              <Button variant="outline" size="sm" onClick={() => router.push("/")}>
                Go to Setup
              </Button>
            )}
          </div>
        )}
      </main>
      <Dialog open={!!sidebarDeleteTarget} onOpenChange={(v) => { if (!v) setSidebarDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {sidebarDeleteTarget?.type === "global" ? "Global" : "Section"}?</DialogTitle>
            <DialogDescription>
              This will mark <span className="font-mono font-medium text-foreground">{sidebarDeleteTarget?.section}.json</span> for deletion. The change won&apos;t be committed until you publish.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSidebarDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!sidebarDeleteTarget) return;
                const base = current?.srcDir ? `${current.srcDir}/kern` : "kern";
                const filePath = sidebarDeleteTarget.type === "global"
                  ? `${base}/globals/${sidebarDeleteTarget.section}.json`
                  : `${base}/content/${sidebarDeleteTarget.page}/${sidebarDeleteTarget.section}.json`;
                setSidebarDeleteTarget(null);
                await draft.deleteFile(filePath);
                toast.success(`${sidebarDeleteTarget.section}.json marked for deletion`);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

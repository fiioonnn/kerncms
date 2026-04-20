"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useProjects } from "@/components/project-context";
type Phase = "checking" | "install" | "error" | "done";

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" className="opacity-75" />
    </svg>
  );
}

function DirPicker({ label, hint, value, dirs, loading, onChange }: {
  label: string;
  hint: string;
  value: string;
  dirs: string[];
  loading: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = dirs.filter((d) =>
    d.toLowerCase().includes(search.toLowerCase())
  );

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
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
      <div ref={containerRef} className="relative">
        {loading ? (
          <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted/30 px-3">
            <SpinnerIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading directories...</span>
          </div>
        ) : (
          <>
            <div
              className={`flex h-8 items-center rounded-md border bg-transparent text-sm transition-colors ${open ? "border-foreground/30" : "border-border"}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="ml-2.5 shrink-0 text-muted-foreground">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <input
                ref={inputRef}
                placeholder="Search directories..."
                value={open ? search : value ? `${value}/` : ""}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => { setOpen(true); setSearch(""); }}
                className="h-full flex-1 bg-transparent px-2 text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none"
              />
              {value && !open && (
                <button
                  type="button"
                  onClick={() => { onChange(""); inputRef.current?.focus(); }}
                  className="mr-2 text-muted-foreground hover:text-foreground"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>
            {open && (
              <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-full max-h-52 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md">
                {filtered.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No directories found</p>
                ) : (
                  filtered.map((dir) => {
                    const depth = search ? 0 : dir.split("/").length - 1;
                    return (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => {
                          onChange(dir);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={`flex w-full items-center gap-1.5 py-1.5 pr-3 text-xs font-mono transition-colors hover:bg-muted/50 ${
                          value === dir ? "text-foreground bg-muted/30" : "text-muted-foreground"
                        }`}
                        style={{ paddingLeft: `${12 + depth * 16}px` }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                        {search ? `${dir}/` : `${dir.split("/").pop()}/`}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BranchPicker({ repo, value, onChange }: { repo: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!repo) return;
    const [owner, name] = repo.split("/");
    if (!owner || !name) return;
    fetch(`/api/github/repos/${owner}/${name}/branches`)
      .then((r) => r.ok ? r.json() : [])
      .then(setBranches);
  }, [repo]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
        setCreating(false);
        setNewName("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name || !repo || !value) return;
    const [owner, repoName] = repo.split("/");
    const res = await fetch("/api/github/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, repo: repoName, name, from: value }),
    });
    if (res.ok) {
      setBranches((prev) => [...prev, name]);
      onChange(name);
      setOpen(false);
      setCreating(false);
      setNewName("");
      setSearch("");
    }
  }

  const filtered = branches.filter((b) => b.toLowerCase().includes(search.toLowerCase()));

  const gitBranchIcon = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">Branch</label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 text-xs font-mono transition-colors hover:bg-muted/30"
        >
          <div className="flex items-center gap-1.5">
            {gitBranchIcon}
            <span className={value ? "text-foreground" : "text-muted-foreground"}>{value || "Select branch..."}</span>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-full rounded-lg bg-popover shadow-md ring-1 ring-foreground/10">
            <div className="p-2">
              <input
                ref={inputRef}
                placeholder="Search branches..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs font-mono outline-none focus:border-ring"
              />
            </div>
            <div className="max-h-40 overflow-y-auto px-1 pb-1">
              {filtered.map((branch) => (
                <button
                  key={branch}
                  type="button"
                  onClick={() => { onChange(branch); setOpen(false); setSearch(""); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-mono transition-colors hover:bg-muted/50"
                >
                  {gitBranchIcon}
                  <span>{branch}</span>
                  {branch === value && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-foreground">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              ))}
              {filtered.length === 0 && !creating && (
                <p className="px-2 py-2 text-center text-xs text-muted-foreground">No branches found.</p>
              )}
            </div>
            <div className="border-t border-border px-1 py-1">
              <button
                type="button"
                onClick={() => { setCreating(true); setOpen(false); setSearch(""); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" />
                </svg>
                <span>Create new branch</span>
              </button>
            </div>
          </div>
        )}
      </div>
      <Dialog open={creating} onOpenChange={(v) => { setCreating(v); if (!v) setNewName(""); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Create Branch</DialogTitle>
            <DialogDescription className="text-xs">
              New branch from <span className="font-mono font-medium text-foreground">{value}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-1">
            <Label className="text-xs">Branch name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) handleCreate(); }}
              placeholder="feature/my-branch"
              className="font-mono text-xs"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setCreating(false); setNewName(""); }}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InstallForm({ projectId, repo, defaultBranch, onInstall, installing }: {
  projectId: string;
  repo: string;
  defaultBranch: string;
  onInstall: (srcDir: string, publicDir: string, branch: string) => void;
  installing: boolean;
}) {
  const [monorepo, setMonorepo] = useState(false);
  const [dirs, setDirs] = useState<string[]>([]);
  const [loadingDirs, setLoadingDirs] = useState(true);
  const [srcDir, setSrcDir] = useState("");
  const [publicDir, setPublicDir] = useState("");
  const [branch, setBranch] = useState(defaultBranch);

  useEffect(() => {
    setLoadingDirs(true);
    setSrcDir("");
    setPublicDir("");

    const query = monorepo ? "?recursive=1" : "";
    fetch(`/api/projects/${projectId}/kern/dirs${query}`)
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((data: string[]) => {
        if (!Array.isArray(data)) throw new Error("Invalid response");
        setDirs(data);
        if (data.includes("src")) setSrcDir("src");
        if (data.includes("public")) setPublicDir("public");
      })
      .catch(() => setDirs([]))
      .finally(() => setLoadingDirs(false));
  }, [projectId, monorepo]);

  const canInstall = srcDir && publicDir && branch && !installing;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
        </div>
        <h3 className="text-base font-medium">Install kern</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Choose the directories in your repository, then we&apos;ll create the content structure.
        </p>
      </div>

      {/* Repo type toggle */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground">Repository type</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMonorepo(false)}
            className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${
              !monorepo
                ? "border-foreground/30 bg-foreground/10 text-foreground"
                : "border-border bg-muted/30 text-muted-foreground hover:border-foreground/20 hover:text-foreground"
            }`}
          >
            Single project
          </button>
          <button
            type="button"
            onClick={() => setMonorepo(true)}
            className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${
              monorepo
                ? "border-foreground/30 bg-foreground/10 text-foreground"
                : "border-border bg-muted/30 text-muted-foreground hover:border-foreground/20 hover:text-foreground"
            }`}
          >
            Monorepo
          </button>
        </div>
      </div>

      <BranchPicker repo={repo} value={branch} onChange={setBranch} />

      <div className="flex flex-col gap-4">
        <DirPicker
          label="Source directory"
          hint="Where your application code lives"
          value={srcDir}
          dirs={dirs}
          loading={loadingDirs}
          onChange={setSrcDir}
        />
        <DirPicker
          label="Public directory"
          hint="Static assets served publicly"
          value={publicDir}
          dirs={dirs}
          loading={loadingDirs}
          onChange={setPublicDir}
        />
      </div>

      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Files to create</p>
        <div className="flex flex-col gap-1">
          <p className={`text-xs font-mono ${srcDir ? "text-foreground/80" : "text-muted-foreground/50"}`}>{srcDir || "…"}/kern/content/default/example.json</p>
          <p className={`text-xs font-mono ${srcDir ? "text-foreground/80" : "text-muted-foreground/50"}`}>{srcDir || "…"}/kern/globals/example-seo.json</p>
          <p className={`text-xs font-mono ${srcDir ? "text-foreground/80" : "text-muted-foreground/50"}`}>{srcDir || "…"}/kern/helpers.ts</p>
          <p className={`text-xs font-mono ${publicDir ? "text-foreground/80" : "text-muted-foreground/50"}`}>{publicDir || "…"}/kern/media/.gitkeep</p>
        </div>
      </div>

      <div className="flex justify-center">
        <Button onClick={() => onInstall(srcDir, publicDir, branch)} disabled={!canInstall}>
          {installing ? (
            <>
              <SpinnerIcon className="h-4 w-4 mr-1.5" />
              Installing...
            </>
          ) : (
            "Install kern"
          )}
        </Button>
      </div>
    </div>
  );
}

export function OnboardingWizard() {
  const { current, completeOnboarding, setKernInstalled } = useProjects();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [statusMsg, setStatusMsg] = useState("Checking installation...");
  const [installing, setInstalling] = useState(false);

  // Validate on mount
  useEffect(() => {
    if (phase !== "checking" || !current) return;

    fetch(`/api/projects/${current.id}/kern/validate`)
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((data) => {
        if (data.installed) {
          setKernInstalled(current.id, true);
          completeOnboarding(current.id);
          router.push("/");
          return;
        } else {
          setStatusMsg("kern not found");
          setTimeout(() => setPhase("install"), 600);
        }
      })
      .catch((e) => {
        setStatusMsg(e.message || "Could not validate");
        setTimeout(() => setPhase("error"), 600);
      });
  }, [phase, current, completeOnboarding, router]);

  const handleInstall = useCallback(async (srcDir: string, publicDir: string, branch: string) => {
    if (!current) return;
    setInstalling(true);

    try {
      // Update project branch if different
      if (branch !== current.branch) {
        await fetch(`/api/projects/${current.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branch }),
        });
      }

      const res = await fetch(`/api/projects/${current.id}/kern/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ srcDir, publicDir, branch }),
      });
      if (!res.ok) throw new Error("Install failed");

      setKernInstalled(current.id, true);

      // Create default GitHub bucket (skip if one already exists)
      const bucketsRes = await fetch(`/api/projects/${current.id}/buckets`);
      const bucketsData = await bucketsRes.json();
      const existingGh = (bucketsData.buckets ?? bucketsData ?? []).find((b: { provider: string }) => b.provider === "github");
      if (!existingGh) {
        const repoName = current.repo ? current.repo.split("/").pop() ?? "GitHub" : "GitHub";
        await fetch(`/api/projects/${current.id}/buckets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: repoName, provider: "github", config: { mediaDir: `${publicDir}/kern/media` } }),
        });
      }

      setInstalling(false);
      setPhase("checking");
      setStatusMsg("Validating installation...");
    } catch {
      setInstalling(false);
    }
  }, [current, setKernInstalled]);

  const handleFinish = useCallback(() => {
    if (current) completeOnboarding(current.id);
  }, [current, completeOnboarding]);

  // ── Error phase ──
  if (phase === "error") {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-border bg-card p-8 min-h-[420px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </svg>
              </div>
              <div className="text-center">
                <h3 className="text-base font-medium">Something went wrong</h3>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
                  {statusMsg || "Could not connect to GitHub. This might be a rate limit — try again in a moment."}
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <Button onClick={() => { setPhase("checking"); setStatusMsg("Checking installation..."); }} className="w-full">
                  Retry
                </Button>
                <Button variant="outline" onClick={handleFinish} className="w-full">
                  Skip, go to Dashboard
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Done phase (fallback / skip) ──
  if (phase === "done") {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-border bg-card p-8 min-h-[420px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <path d="m9 11 3 3L22 4" />
                </svg>
              </div>
              <div className="text-center">
                <h3 className="text-base font-medium">You&apos;re all set!</h3>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
                  Your project is connected and kern is installed. Start managing your content.
                </p>
              </div>
              <Button onClick={handleFinish} className="w-full">Go to Dashboard</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="relative rounded-xl border border-border bg-card p-8 min-h-[420px]">
          {/* Install form always rendered underneath */}
          {current && (
            <InstallForm
              projectId={current.id}
              repo={current.repo ?? ""}
              defaultBranch={current.branch ?? "main"}
              onInstall={handleInstall}
              installing={installing}
            />
          )}

          {/* Loading overlay */}
          {phase === "checking" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-xl bg-card transition-opacity duration-300">
              <SpinnerIcon className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{statusMsg}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

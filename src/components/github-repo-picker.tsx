"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type GitHubRepo = { id: string; fullName: string; private: boolean; defaultBranch: string };

export function useGitHubRepos() {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const fetched = useRef(false);

  const load = useCallback(async () => {
    if (fetched.current) return;
    fetched.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/github/repos");
      if (res.ok) setRepos(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  return { repos, loading, load };
}

export function useGitHubBranches(repoFullName: string) {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!repoFullName) { setBranches([]); return; }
    let cancelled = false;
    setLoading(true);
    const [owner, repo] = repoFullName.split("/");
    fetch(`/api/github/repos/${owner}/${repo}/branches`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (!cancelled) setBranches(data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repoFullName]);

  return { branches, loading };
}

function PickerSelect({
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  items,
  icon,
  disabled,
  loading,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  items: { id: string; label: string }[];
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find((i) => i.id === value) ?? (value ? { id: value, label: value } : undefined);
  const filtered = items.filter((i) =>
    i.label.toLowerCase().includes(search.toLowerCase())
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
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-input/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
      >
        <span className={selected ? "text-foreground truncate" : "text-muted-foreground"}>
          {selected ? selected.label : (loading ? "Loading…" : placeholder)}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-full min-w-[220px] rounded-lg bg-popover shadow-md ring-1 ring-foreground/10">
          <div className="p-2">
            <Input
              ref={inputRef}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="max-h-48 overflow-y-auto px-1 pb-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyText}</p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { onChange(item.id); setOpen(false); setSearch(""); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                >
                  {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
                  <span className="truncate text-foreground">{item.label}</span>
                  {item.id === value && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0 text-foreground">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const repoIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const branchIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" x2="6" y1="3" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

export function GitHubRepoPicker({
  repo,
  branch,
  onRepoChange,
  onBranchChange,
  layout = "grid",
}: {
  repo: string;
  branch: string;
  onRepoChange: (repo: string) => void;
  onBranchChange: (branch: string) => void;
  layout?: "grid" | "stacked";
}) {
  const ghRepos = useGitHubRepos();
  const ghBranches = useGitHubBranches(repo);

  useEffect(() => {
    ghRepos.load();
  }, [ghRepos.load]);

  // Auto-select main branch (or first available) when branches load
  useEffect(() => {
    if (!branch && ghBranches.branches.length > 0) {
      const main = ghBranches.branches.find((b) => b === "main") ?? ghBranches.branches[0];
      onBranchChange(main);
    }
  }, [ghBranches.branches]); // eslint-disable-line react-hooks/exhaustive-deps

  const content = (
    <>
      <div className="flex flex-col gap-2">
        <Label>Repository</Label>
        <PickerSelect
          value={repo}
          onChange={(fullName) => { onRepoChange(fullName); onBranchChange(""); }}
          placeholder="Select repo"
          searchPlaceholder="Search repositories..."
          emptyText={ghRepos.loading ? "Loading repositories..." : "No repositories found."}
          items={ghRepos.repos.map((r) => ({ id: r.fullName, label: r.fullName }))}
          icon={repoIcon}
          loading={ghRepos.loading}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Branch</Label>
        <PickerSelect
          value={branch}
          onChange={onBranchChange}
          placeholder="Select branch"
          searchPlaceholder="Search branches..."
          emptyText={ghBranches.loading ? "Loading branches..." : "No branches found."}
          items={ghBranches.branches.map((b) => ({ id: b, label: b }))}
          icon={branchIcon}
          disabled={!repo}
          loading={ghBranches.loading}
        />
      </div>
    </>
  );

  if (layout === "stacked") return <div className="flex flex-col gap-4">{content}</div>;
  return <div className="grid grid-cols-2 gap-3">{content}</div>;
}

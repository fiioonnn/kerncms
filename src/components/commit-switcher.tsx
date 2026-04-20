"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

type Commit = {
  sha: string;
  message: string;
  date: string | null;
  author: string | null;
};

export function CommitSwitcher({
  commits,
  selectedSha,
  onSelect,
  loading,
}: {
  commits: Commit[];
  selectedSha: string | null;
  onSelect: (sha: string | null) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = commits.filter(
    (c) =>
      c.message.toLowerCase().includes(search.toLowerCase()) ||
      c.sha.toLowerCase().startsWith(search.toLowerCase())
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

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  function truncateMessage(msg: string, max = 32) {
    const first = msg.split("\n")[0];
    if (first.length <= max) return first;
    return first.slice(0, max) + "...";
  }

  const selected = selectedSha ? commits.find((c) => c.sha === selectedSha) : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => !loading && setOpen(!open)}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-[min(var(--radius-md),10px)] px-2 py-1 text-xs bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <line x1="12" x2="12" y1="3" y2="9" />
          <line x1="12" x2="12" y1="15" y2="21" />
        </svg>
        <span>
          {selected ? selected.sha.slice(0, 7) : "Latest"}
        </span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] right-0 z-50 w-80 rounded-lg bg-popover shadow-md ring-1 ring-foreground/10">
          <div className="p-2">
            <Input
              ref={inputRef}
              placeholder="Search commits..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto px-1 pb-1">
            <button
              onClick={() => { onSelect(null); setOpen(false); setSearch(""); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
                <circle cx="12" cy="12" r="3" />
                <line x1="12" x2="12" y1="3" y2="9" />
                <line x1="12" x2="12" y1="15" y2="21" />
              </svg>
              <div className="flex-1 text-left min-w-0">
                <span className="text-xs font-medium">Latest</span>
              </div>
              {!selectedSha && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-foreground shrink-0">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
            {filtered.map((commit) => (
              <button
                key={commit.sha}
                onClick={() => { onSelect(commit.sha); setOpen(false); setSearch(""); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
                  <circle cx="12" cy="12" r="3" />
                  <line x1="12" x2="12" y1="3" y2="9" />
                  <line x1="12" x2="12" y1="15" y2="21" />
                </svg>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-xs truncate">{truncateMessage(commit.message)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {commit.sha.slice(0, 7)} · {formatDate(commit.date)}
                  </p>
                </div>
                {commit.sha === selectedSha && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-foreground shrink-0">
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

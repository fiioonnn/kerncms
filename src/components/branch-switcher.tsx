"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function BranchSwitcher({
  currentBranch,
  branches,
  onSwitch,
  onCreate,
  repo,
  disabled,
  size = "default",
}: {
  currentBranch: string;
  branches: string[];
  onSwitch: (branch: string) => void;
  onCreate: (name: string) => void;
  repo: string;
  disabled?: boolean;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);

  const filtered = branches.filter((b) =>
    b.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (modalOpen) setTimeout(() => modalInputRef.current?.focus(), 0);
  }, [modalOpen]);

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
      setSearch("");
      setOpen(false);
      setModalOpen(false);
      setNewBranchName("");
    } finally {
      setCreating(false);
    }
  }

  const modalNameValid = newBranchName.trim() && !branches.includes(newBranchName.trim());
  const buttonCls = size === "sm"
    ? "h-7 px-2 text-xs"
    : "px-2 py-1 text-xs";

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1.5 rounded-[min(var(--radius-md),10px)] ${buttonCls} bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="6" x2="6" y1="3" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
        <span>{currentBranch || "select branch"}</span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] right-0 z-50 w-60 rounded-lg bg-popover shadow-md ring-1 ring-foreground/10">
          <div className="p-2">
            <Input
              ref={inputRef}
              placeholder="Find branch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="max-h-48 overflow-y-auto px-1 pb-1">
            {filtered.map((branch) => (
              <button
                key={branch}
                onClick={() => { onSwitch(branch); setOpen(false); setSearch(""); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
                  <line x1="6" x2="6" y1="3" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
                <span className="text-xs">{branch}</span>
                {branch === currentBranch && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-foreground">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">No branches found.</p>
            )}
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
            <Label htmlFor="new-branch-name">Branch name</Label>
            <Input
              ref={modalInputRef}
              id="new-branch-name"
              placeholder="feature/my-branch"
              className=""
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

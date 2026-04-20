"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { useProjects } from "@/components/project-context";
import { useIsAdmin } from "@/lib/auth-client";

function ProjectIcon({ name, color, size = "sm" }: { name: string; color: string; size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-5 w-5 text-[11px] rounded" : "h-6 w-6 text-xs rounded-md";
  return (
    <div
      className={`${s} flex items-center justify-center font-[family-name:var(--font-averia)] font-black`}
      style={{ backgroundColor: color }}
    >
      <span className="text-white">
        {name.charAt(0).toLowerCase()}
      </span>
    </div>
  );
}

export function ProjectSwitcher() {
  const { projects, current, setCurrent, githubReady } = useProjects();
  const isSystemAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        // Don't close if click is inside a dialog/portal
        const el = target instanceof Element ? target.closest("[data-slot='dialog-content'], [data-slot='dialog-overlay'], [role='dialog']") : null;
        if (el) return;
        setOpen(false);
        setSearch("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (projects.length === 0) {
    if (!isSystemAdmin || !githubReady) return null;
    return (
      <NewProjectDialog
        trigger={
          <button className="inline-flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            New Project
          </button>
        }
      />
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted/50"
      >
        {current && (
          <>
            <ProjectIcon name={current.name} color={current.color} />
            <span className="text-sm font-medium text-foreground">
              {current.name}
            </span>
            {current.localPath && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500 leading-none">DEV</span>
            )}
          </>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        className={`absolute top-[calc(100%+4px)] right-0 z-50 w-56 rounded-lg bg-popover shadow-md ring-1 ring-foreground/10 transition-all duration-150 origin-top-right ${
          open
            ? "opacity-100 scale-100 backdrop-blur-none pointer-events-auto"
            : "opacity-0 scale-95 backdrop-blur-sm pointer-events-none"
        }`}
      >
          {projects.length > 1 && (
            <div className="p-2">
              <Input
                ref={inputRef}
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          )}
          <div className={`max-h-48 overflow-y-auto px-1 ${projects.length > 1 ? "pb-1" : "pt-1 pb-1"}`}>
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">No projects found.</p>
            ) : (
              filtered.map((project) => (
                <button
                  key={project.id}
                  onClick={() => {
                    setCurrent(project.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                >
                  <ProjectIcon name={project.name} color={project.color} />
                  <span className="text-foreground">{project.name}</span>
                  {project.localPath && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500 leading-none">DEV</span>
                  )}
                  {project.id === current?.id && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="ml-auto text-foreground"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
          {isSystemAdmin && githubReady && (<>
            <div className="mx-1 h-px bg-border" />
            <div className="p-1">
              <NewProjectDialog
                trigger={
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                    New Project
                  </button>
                }
              />
            </div>
          </>)}
      </div>
    </div>
  );
}

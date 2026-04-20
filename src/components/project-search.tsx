"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useProjects } from "@/components/project-context";
import { cn } from "@/lib/utils";

type IndexItem = {
  type: "page" | "section" | "global" | "field";
  label: string;
  description: string;
  page?: string;
  section?: string;
  global?: string;
  field?: string;
};

const indexCache = new Map<string, IndexItem[]>();

export function ProjectSearch() {
  const { current } = useProjects();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<IndexItem[]>([]);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadIndex = useCallback(async () => {
    if (!current) return;

    const cached = indexCache.get(current.id);
    if (cached) {
      setIndex(cached);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${current.id}/kern/search`);
      if (res.ok) {
        const data = await res.json();
        indexCache.set(current.id, data.items);
        setIndex(data.items);
      }
    } catch { /* */ }
    finally { setLoading(false); }
  }, [current]);

  useEffect(() => {
    if (current) loadIndex();
  }, [current, loadIndex]);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const fileResults = index
      .filter((item) => item.type !== "field" && item.label.toLowerCase().includes(q))
      .slice(0, 10);

    const fieldResults = index
      .filter((item) => item.type === "field" && item.label.toLowerCase().includes(q))
      .slice(0, 10);

    if (fileResults.length > 0) return [...fileResults, ...fieldResults].slice(0, 15);
    return fieldResults.slice(0, 15);
  }, [query, index]);

  function openDropdown() {
    clearTimeout(closeTimerRef.current);
    clearTimeout(openTimerRef.current);
    setOpen(true);
    setAnimating(true);
    openTimerRef.current = setTimeout(() => {
      setVisible(true);
      setAnimating(false);
    }, 30);
  }

  function closeDropdown() {
    if (!open) return;
    clearTimeout(openTimerRef.current);
    setVisible(false);
    setAnimating(true);
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setAnimating(false);
    }, 200);
  }

  useEffect(() => {
    if (results.length > 0 && query.trim() && focused) {
      const delay = setTimeout(() => openDropdown(), 150);
      return () => clearTimeout(delay);
    } else {
      closeDropdown();
    }
  }, [results, query, focused]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    function handleSlash(e: KeyboardEvent) {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleSlash);
    return () => document.removeEventListener("keydown", handleSlash);
  }, []);

  function navigate(result: IndexItem) {
    setQuery("");
    closeDropdown();

    let url = "/content";
    if (result.type === "page") {
      url = `/content?page=${encodeURIComponent(result.label)}`;
    } else if (result.type === "section") {
      url = `/content?page=${encodeURIComponent(result.page!)}&section=${encodeURIComponent(result.section!)}`;
    } else if (result.type === "global") {
      url = `/content?global=${encodeURIComponent(result.label)}`;
    } else if (result.type === "field") {
      if (result.global) {
        url = `/content?global=${encodeURIComponent(result.global)}`;
      } else if (result.page && result.section) {
        url = `/content?page=${encodeURIComponent(result.page)}&section=${encodeURIComponent(result.section)}`;
      }
    }

    window.location.href = url;
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || !visible) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      navigate(results[activeIndex]);
    } else if (e.key === "Escape") {
      closeDropdown();
      inputRef.current?.blur();
      setFocused(false);
    }
  }

  if (!current) return null;

  const typeIcons: Record<string, React.ReactNode> = {
    page: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-blue-400">
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />
      </svg>
    ),
    section: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-emerald-400">
        <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
      </svg>
    ),
    global: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-amber-400">
        <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    field: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-violet-400">
        <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
      </svg>
    ),
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute left-2.5 text-muted-foreground/50"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setFocused(true);
            if (!index.length) loadIndex();
            if (results.length > 0) openDropdown();
          }}
          onBlur={() => {}}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          className={cn(
            "h-8 rounded-lg border border-input bg-transparent pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-[width] duration-200 ease-out focus:border-ring focus:ring-1 focus:ring-ring/50 dark:bg-input/30",
            focused ? "w-64" : "w-48"
          )}
        />
        {!query && !loading && (
          <kbd className="pointer-events-none absolute right-2 flex h-5 items-center rounded border border-border bg-muted/50 px-1.5 font-mono text-[10px] text-muted-foreground">
            /
          </kbd>
        )}
        {loading && (
          <div className="absolute right-2.5">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
          </div>
        )}
      </div>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-lg border border-border bg-popover/95 p-2 shadow-lg shadow-black/20 ring-1 ring-foreground/5 backdrop-blur-2xl"
          style={{
            transition: "opacity 200ms ease, transform 200ms ease, filter 200ms ease",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(8px)",
            filter: visible ? "blur(0px)" : "blur(8px)",
          }}
        >
          <div className="max-h-72 overflow-y-auto">
            {results.map((result, i) => (
              <button
                key={`${result.type}-${result.label}-${result.description}-${i}`}
                onClick={() => navigate(result)}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  i === activeIndex ? "bg-muted/50 text-foreground" : "text-muted-foreground hover:bg-muted/30"
                )}
              >
                {typeIcons[result.type]}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">{result.label.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</div>
                  <div className="truncate text-xs text-muted-foreground">{result.description.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</div>
                </div>
                <span className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                  {result.type}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

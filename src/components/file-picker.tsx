"use client";

import { useEffect, useRef, useState } from "react";

export function FilePicker({
  label,
  files,
  selected,
  onChange,
  loading,
  single = false,
}: {
  label: string;
  files: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  loading: boolean;
  single?: boolean;
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
    if (single) {
      onChange([file]);
      setOpen(false);
      setSearch("");
      return;
    }
    if (selectedSet.has(file)) {
      onChange(selected.filter((f) => f !== file));
    } else {
      onChange([...selected, file]);
    }
  }

  const placeholder = open
    ? "Search files..."
    : single
      ? selected[0] ?? "Select a file"
      : selected.length === files.length
        ? "All files"
        : `${selected.length} files selected`;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      )}
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
                placeholder={placeholder}
                value={open ? search : ""}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setOpen(true)}
                className={`h-full flex-1 bg-transparent px-2 text-sm outline-none ${
                  !open && single && selected[0]
                    ? "placeholder:text-foreground placeholder:font-mono"
                    : "text-foreground placeholder:text-muted-foreground"
                }`}
              />
              {single ? (
                selected[0] && !open ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2.5 shrink-0 text-muted-foreground">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                ) : null
              ) : (
                <span className="mr-2.5 text-xs text-muted-foreground shrink-0">{selected.length}/{files.length}</span>
              )}
            </div>
            {open && (
              <div className="absolute top-[calc(100%+4px)] left-0 z-50 w-full rounded-lg border border-border bg-popover shadow-md ring-1 ring-foreground/10 overflow-hidden">
                {!single && (
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
                )}
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
                          <span className={`flex size-4 shrink-0 items-center justify-center border transition-colors ${
                            single ? "rounded-full" : "rounded-sm"
                          } ${
                            isSelected ? "border-foreground/30 bg-foreground/10" : "border-input"
                          }`}>
                            {isSelected && (
                              single ? (
                                <span className="size-2 rounded-full bg-foreground" />
                              ) : (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )
                            )}
                          </span>
                          <span
                            className="flex-1 min-w-0 overflow-hidden whitespace-nowrap text-ellipsis"
                            style={{ direction: "rtl", unicodeBidi: "plaintext", textAlign: "left" }}
                            title={file}
                          >
                            {file}
                          </span>
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

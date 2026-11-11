"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Chips with remove buttons. Add with Enter or comma; suggestions come from `suggestions`. */
export function TagInput({
  label,
  description,
  defaultValue = [],
  suggestions = [],
  onValueChange,
  className,
}: {
  label?: string;
  description?: string;
  defaultValue?: string[];
  suggestions?: string[];
  onValueChange?: (tags: string[]) => void;
  className?: string;
}) {
  const id = useId();
  const [tags, setTags] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const normalized = query.trim().toLowerCase();
  const matches = suggestions
    .filter((tag) => !tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
    .filter((tag) => !normalized || tag.toLowerCase().includes(normalized))
    .slice(0, 6);
  const open = focused && matches.length > 0;

  function update(next: string[]) {
    setTags(next);
    onValueChange?.(next);
  }

  function add(...raw: string[]) {
    const next = [...tags];
    for (const part of raw) {
      const tag = part.trim();
      if (tag && !next.some((t) => t.toLowerCase() === tag.toLowerCase())) next.push(tag);
    }
    if (next.length !== tags.length) update(next);
    setQuery("");
    setHighlight(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (open && highlight >= 0 && matches[highlight] && (e.key === "Enter" || !query.trim())) {
        add(matches[highlight]);
      } else {
        add(query);
      }
    } else if (e.key === "Backspace" && !query && tags.length) {
      update(tags.slice(0, -1));
    } else if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % matches.length);
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setHighlight((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === "Escape") {
      setFocused(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <label htmlFor={id} className="text-[15px] font-medium">
          {label}
        </label>
      )}
      <div className="relative">
        <div
          className={cn(
            "flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-2 py-1.5 transition-colors hover:border-muted/60",
            focused && "border-accent ring-4 ring-accent/15 hover:border-accent",
          )}
        >
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex h-7 items-center gap-1 rounded-lg bg-accent-soft pr-1 pl-2.5 text-sm font-medium text-accent"
            >
              {tag}
              <button
                type="button"
                aria-label={`„${tag}“ entfernen`}
                onClick={() => update(tags.filter((t) => t !== tag))}
                className="flex size-5 items-center justify-center rounded-md transition-colors hover:bg-accent/15"
              >
                <X className="size-3.5" strokeWidth={2} />
              </button>
            </span>
          ))}
          <input
            id={id}
            value={query}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            onChange={(e) => {
              const next = e.target.value;
              if (next.includes(",")) {
                const parts = next.split(",");
                add(...parts.slice(0, -1));
                setQuery(parts.at(-1) ?? "");
              } else {
                setQuery(next);
                setHighlight(0);
              }
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              if (query.trim()) add(query);
            }}
            className="h-8 min-w-24 flex-1 bg-transparent px-1.5 text-[15px] outline-none"
          />
        </div>
        {open && (
          <ul
            id={`${id}-list`}
            role="listbox"
            className="absolute inset-x-0 top-full z-50 mt-1.5 rounded-xl border border-border bg-surface p-1.5 shadow-popover"
          >
            {matches.map((tag, index) => (
              <li
                key={tag}
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(tag);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  "flex h-10 cursor-default items-center gap-3 rounded-lg px-3 text-[15px]",
                  index === highlight && "bg-subtle",
                )}
              >
                <Plus className="size-4 text-muted" strokeWidth={1.75} />
                {tag}
              </li>
            ))}
          </ul>
        )}
      </div>
      {description && <p className="text-sm text-muted">{description}</p>}
    </div>
  );
}

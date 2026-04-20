"use client";

import { useState, useRef, useEffect } from "react";

type Bucket = { id: string; name: string; provider: string; isDefault: boolean };

function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  if (provider === "github") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
      </svg>
    );
  }
  if (provider === "aws") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
        <path d="M18 14h-8" />
        <path d="M15 18h-5" />
        <path d="M10 6h8v4h-8V6Z" />
      </svg>
    );
  }
  // cloudflare / r2
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}

function providerLabel(provider: string) {
  if (provider === "github") return "GitHub";
  if (provider === "aws") return "AWS S3";
  return "Cloudflare R2";
}

export function BucketSelector({
  buckets,
  activeBucketId,
  onChange,
  onSettings,
  size = "default",
}: {
  buckets: Bucket[];
  activeBucketId: string | undefined;
  onChange: (bucketId: string) => void;
  onSettings?: () => void;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const sorted = [...buckets].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
  const active = buckets.find((b) => b.id === activeBucketId);
  const hasDropdown = buckets.length > 1 || !!onSettings;
  const h = size === "sm" ? "h-7" : "h-8";
  const text = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { if (hasDropdown) setOpen(!open); }}
        className={`flex ${h} items-center gap-2 rounded-md border border-border bg-transparent px-2.5 ${text} text-foreground transition-colors ${hasDropdown ? "hover:bg-muted/50 cursor-pointer" : "cursor-default"}`}
      >
        {active && <ProviderIcon provider={active.provider} className="text-muted-foreground shrink-0" />}
        <span className="truncate max-w-[140px]">{active ? active.name : "Select bucket"}</span>
        {hasDropdown && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0 ml-0.5">
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>
      {open && hasDropdown && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-50 min-w-[200px] rounded-lg border border-border bg-popover py-1 shadow-lg ring-1 ring-foreground/5 animate-in fade-in zoom-in-95 duration-100">
          {sorted.map((b) => (
            <button
              key={b.id}
              onClick={() => { onChange(b.id); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 ${text} transition-colors hover:bg-muted/50 ${
                b.id === activeBucketId ? "text-foreground bg-muted/30" : "text-muted-foreground"
              }`}
            >
              <ProviderIcon provider={b.provider} className="shrink-0" />
              <span className="truncate">{b.name}</span>
              <span className="ml-auto text-[10px] text-muted-foreground/60 shrink-0">{providerLabel(b.provider)}</span>
            </button>
          ))}
          {onSettings && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => { onSettings(); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 ${text} text-muted-foreground transition-colors hover:bg-muted/50`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span>Settings</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

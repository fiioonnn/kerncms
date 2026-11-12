"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { MediaPickerDialog } from "@/components/media-picker-dialog";
import { useProjects } from "@/components/project-context";

/** Paths like "/images/hero.jpg" live on the website, not the CMS — preview them from there. */
function previewUrl(value: string, siteUrl?: string) {
  if (!value.startsWith("/") || value.startsWith("/api/") || value.startsWith("//") || !siteUrl) return value;
  try {
    return new URL(value, /^https?:\/\//.test(siteUrl) ? siteUrl : `https://${siteUrl}`).href;
  } catch {
    return value;
  }
}

function fileName(value: string) {
  try {
    const u = new URL(value, "http://x");
    return decodeURIComponent((u.searchParams.get("path") ?? u.pathname).split("/").filter(Boolean).pop() ?? value);
  } catch {
    return value;
  }
}

interface FieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  disabled?: boolean;
}

export function ImageField({ value, onChange, label, disabled }: FieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { current } = useProjects();

  function handleEdit() {
    if (!value) return;
    try {
      const url = new URL(value, window.location.origin);
      const filePath = url.searchParams.get("path") ?? "";
      const parts = filePath.split("/");
      const folder = parts.slice(0, -1).join("/");
      sessionStorage.setItem("media-open", JSON.stringify({ fileId: filePath, folder }));
      router.push("/media");
    } catch {
      router.push("/media");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      {value ? (
        <div
          ref={containerRef}
          className="relative rounded-lg border border-input overflow-hidden aspect-video"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.08) 0.75px, transparent 0.75px)",
            backgroundSize: "20px 20px",
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <img src={previewUrl(value, current?.url)} alt="" className="w-full h-full object-contain p-3 rounded-xl" />
          <span className="absolute bottom-1.5 left-2 max-w-[90%] truncate rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-white/90">{fileName(value)}</span>
          <div
            className="absolute inset-0 flex items-center justify-center gap-2 transition-opacity duration-150"
            style={{ opacity: hovered ? 1 : 0, backgroundColor: "rgba(0,0,0,0.6)" }}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={handleEdit}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-200 transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setPickerOpen(true)}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-200 transition-colors"
            >
              Replace
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(null)}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-200 transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
          className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input p-8 transition-colors hover:border-foreground/25 disabled:opacity-50"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          <span className="text-xs text-muted-foreground">Drop an image or click to upload</span>
        </button>
      )}
      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(file) => onChange(file.url)}
      />
    </div>
  );
}

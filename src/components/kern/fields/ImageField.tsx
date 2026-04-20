"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { MediaPickerDialog } from "@/components/media-picker-dialog";

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
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <img src={value} alt="" className="w-full h-full object-contain p-3 rounded-xl" />
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

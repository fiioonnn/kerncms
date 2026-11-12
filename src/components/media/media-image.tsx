"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Film, ImageOff } from "lucide-react";
import { mediaSrc, useOptionalKern } from "@/components/kern/kern-provider";
import { cn } from "@/lib/utils";

/** Shows a stored media value (e.g. /media/brot.jpg) from the draft checkout. */
export function MediaImage({
  value,
  alt = "",
  className,
  focusX = 50,
  focusY = 50,
  style,
  onMissing,
}: {
  value: string;
  alt?: string;
  className?: string;
  focusX?: number;
  focusY?: number;
  style?: React.CSSProperties;
  /** Called when the file does not exist, so a field can show its empty state instead. */
  onMissing?: () => void;
}) {
  const prefix = useOptionalKern()?.mediaPrefix ?? "/media/";
  const src = mediaSrc(value, prefix);
  const [failed, setFailed] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  // An image rendered on the server can fail before React listens for onError.
  useEffect(() => {
    const img = ref.current;
    // SVGs without a size can report a natural width of 0 although they loaded, so only check other images.
    if (img?.complete && img.naturalWidth === 0 && !/\.svg$/i.test(value)) {
      setFailed(src);
      onMissing?.();
    }
  }, [src, value, onMissing]);
  const lower = value.toLowerCase();
  if (lower.endsWith(".pdf") || lower.endsWith(".mp4")) {
    const Icon = lower.endsWith(".pdf") ? FileText : Film;
    return (
      <div className={cn("flex items-center justify-center bg-subtle text-muted", className)} style={style}>
        <Icon className="size-10" strokeWidth={1.5} />
      </div>
    );
  }
  // The value points to a file that does not exist (yet), e.g. /og-image.jpg that was never added.
  if (failed === src) {
    return (
      <div
        className={cn("flex items-center justify-center bg-subtle text-muted", className)}
        style={style}
        title={`${value} wurde nicht gefunden`}
      >
        <ImageOff className="size-6 shrink-0" strokeWidth={1.5} aria-label="Bild nicht gefunden" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- files come from the site's draft checkout
    <img
      ref={ref}
      src={src}
      onError={() => {
        setFailed(src);
        onMissing?.();
      }}
      alt={alt}
      loading="lazy"
      draggable={false}
      className={cn("bg-subtle object-cover", lower.endsWith(".svg") && "bg-white object-contain p-[8%]", className)}
      style={{ objectPosition: `${focusX}% ${focusY}%`, ...style }}
    />
  );
}

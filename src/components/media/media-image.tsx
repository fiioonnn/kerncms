"use client";

import { FileText, Film } from "lucide-react";
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
}: {
  value: string;
  alt?: string;
  className?: string;
  focusX?: number;
  focusY?: number;
  style?: React.CSSProperties;
}) {
  const prefix = useOptionalKern()?.mediaPrefix ?? "/media/";
  const lower = value.toLowerCase();
  if (lower.endsWith(".pdf") || lower.endsWith(".mp4")) {
    const Icon = lower.endsWith(".pdf") ? FileText : Film;
    return (
      <div className={cn("flex items-center justify-center bg-subtle text-muted", className)} style={style}>
        <Icon className="size-10" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- files come from the site's draft checkout
    <img
      src={mediaSrc(value, prefix)}
      alt={alt}
      loading="lazy"
      draggable={false}
      className={cn("bg-subtle object-cover", lower.endsWith(".svg") && "bg-white object-contain p-[8%]", className)}
      style={{ objectPosition: `${focusX}% ${focusY}%`, ...style }}
    />
  );
}

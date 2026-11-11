import "server-only";
import { createElement } from "react";
import { icons, type LucideIcon, type LucideProps } from "lucide-react";

/** Resolves a lucide icon name from kern.config.yaml ("layout-template", "newspaper"). Server only, so the
 * full icon map never reaches the browser; pass the rendered element to client components instead. */
export function lucideIcon(name: string | undefined, fallback: keyof typeof icons = "Folder"): LucideIcon {
  const pascal = (name ?? "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
  return icons[pascal as keyof typeof icons] ?? icons[fallback];
}

export function NamedIcon({ name, fallback, ...props }: LucideProps & { name?: string; fallback?: keyof typeof icons }) {
  return createElement(lucideIcon(name, fallback), props);
}

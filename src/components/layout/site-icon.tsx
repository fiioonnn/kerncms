"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function siteInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/** A site's favicon from its repository, or its initials when it has none. `className` sets size and text size. */
export function SiteIcon({ siteId, name, className }: { siteId: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent-soft font-semibold text-accent", !failed && "bg-white", className)}>
      {failed ? (
        siteInitials(name)
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- favicon from the site's repository
        <img src={`/api/site-icon/${siteId}`} alt="" className="size-full object-contain p-[14%]" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

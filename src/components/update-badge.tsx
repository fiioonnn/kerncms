"use client";

import { useEffect, useState } from "react";
import { useIsSuperAdmin } from "@/lib/auth-client";

const DOCS_URL = "https://github.com/fiioonnn/kerncms/releases";

export function UpdateBadge() {
  const isSuperAdmin = useIsSuperAdmin();
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;

    fetch("/api/updates/check")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.updateAvailable) setLatestVersion(data.latestVersion);
      })
      .catch(() => {});
  }, [isSuperAdmin]);

  if (!latestVersion) return null;

  return (
    <a
      href={DOCS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-2.5 flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors animate-in fade-in duration-500"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
      </span>
      v{latestVersion}
    </a>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useProjects } from "@/components/project-context";

type Status = "idle" | "validating" | "pulling" | "syncing";

export function BackgroundValidator() {
  const { current } = useProjects();
  const [status, setStatus] = useState<Status>("idle");
  const ranRef = useRef(false);

  const projectId = current?.id;
  const repo = current?.repo;
  const branch = current?.branch;
  const ready = !!current?.onboardingComplete;

  // On mount: validate + pull latest media from GitHub (run once per project)
  useEffect(() => {
    if (!projectId || !ready) return;
    if (ranRef.current) return;
    ranRef.current = true;
    const controller = new AbortController();

    (async () => {
      setStatus("validating");
      try {
        await fetch(`/api/projects/${projectId}/kern/validate`, { signal: controller.signal });
      } catch { /* abort or error */ }

      if (controller.signal.aborted) return;

      if (repo && branch) {
        // Flush pending sync before pulling to avoid overwriting local changes
        try {
          const syncRes = await fetch(`/api/media/sync?projectId=${projectId}`, { signal: controller.signal });
          if (syncRes.ok) {
            const { pending } = await syncRes.json();
            if (pending > 0) {
              setStatus("syncing");
              await fetch("/api/media/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId }),
                signal: controller.signal,
              });
            }
          }
        } catch { /* abort or error */ }

        if (controller.signal.aborted) return;

        setStatus("pulling");
        try {
          await fetch("/api/media/pull", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId }),
            signal: controller.signal,
          });
        } catch { /* abort or error */ }
      }

      if (!controller.signal.aborted) setStatus("idle");
    })();

    return () => controller.abort();
  }, [projectId, ready, repo, branch]);

  // Media sync polling — every 5s check queue, push if pending
  const syncMedia = useCallback(async () => {
    if (!projectId || !repo || !branch) return;
    try {
      const res = await fetch(`/api/media/sync?projectId=${projectId}`);
      if (!res.ok) return;
      const { pending } = await res.json();
      if (pending > 0) {
        setStatus("syncing");
        await fetch("/api/media/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        });
        setStatus("idle");
      }
    } catch {
      setStatus((s) => s === "syncing" ? "idle" : s);
    }
  }, [projectId, repo, branch]);

  useEffect(() => {
    if (!repo || !branch) return;
    const interval = setInterval(syncMedia, 5000);
    return () => clearInterval(interval);
  }, [syncMedia, repo, branch]);

  useEffect(() => {
    if (status !== "syncing") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  if (status === "idle") return null;

  const labels: Record<Status, string> = {
    idle: "",
    validating: "Validating...",
    pulling: "Pulling media...",
    syncing: "Syncing media...",
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md bg-card/80 px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" className="opacity-25" />
        <path d="M4 12a8 8 0 018-8" className="opacity-75" />
      </svg>
      {labels[status]}
    </div>
  );
}

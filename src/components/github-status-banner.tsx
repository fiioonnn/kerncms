"use client";

import { useProjects } from "@/components/project-context";

export function GitHubStatusBanner() {
  const { githubReady } = useProjects();

  if (githubReady !== false) return null;

  return (
    <div className="w-full bg-destructive/10 border-b border-destructive/20 px-6 py-2.5 text-center">
      <p className="text-sm text-destructive">
        GitHub App not configured. Set it up in Settings → Integrations.
      </p>
    </div>
  );
}

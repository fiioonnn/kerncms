"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { useProjects } from "@/components/project-context";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { Button } from "@/components/ui/button";
import { useIsAdmin, useSession } from "@/lib/auth-client";

type DashboardStats = {
  pages: number;
  sections: number;
  mediaFiles: number;
  members: number;
};

type DraftChange = {
  filename: string;
  status: string;
  updatedAt: string;
};

const statsCache = new Map<string, { stats: DashboardStats; draftChanges: DraftChange[] }>();

function useDashboardStats(projectId: string | undefined) {
  const cached = projectId ? statsCache.get(projectId) : undefined;
  const [stats, setStats] = useState<DashboardStats>(cached?.stats ?? { pages: 0, sections: 0, mediaFiles: 0, members: 0 });
  const [draftChanges, setDraftChanges] = useState<DraftChange[]>(cached?.draftChanges ?? []);
  const [loading, setLoading] = useState(!cached);
  const prevProjectId = useRef(projectId);

  if (prevProjectId.current !== projectId) {
    prevProjectId.current = projectId;
    const next = projectId ? statsCache.get(projectId) : undefined;
    if (next) {
      setStats(next.stats);
      setDraftChanges(next.draftChanges);
      setLoading(false);
    } else {
      setStats({ pages: 0, sections: 0, mediaFiles: 0, members: 0 });
      setDraftChanges([]);
      setLoading(true);
    }
  }

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const [contentRes, membersRes, mediaRes, draftRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/kern/content`).then((r) => r.ok ? r.json() : { pages: [] }),
        fetch(`/api/projects/${projectId}/members`).then((r) => r.ok ? r.json() : { members: [] }),
        fetch(`/api/media?projectId=${projectId}`).then((r) => r.ok ? r.json() : { files: [] }),
        fetch(`/api/projects/${projectId}/kern/draft`).then((r) => r.ok ? r.json() : { changes: [] }),
      ]);

      const pages = contentRes.pages ?? [];
      const sectionCount = pages.reduce((sum: number, p: { sections: unknown[] }) => sum + (p.sections?.length ?? 0), 0);
      const mediaFiles = (mediaRes.files ?? []).filter((f: { isFolder?: boolean }) => !f.isFolder);

      const newStats = {
        pages: pages.length,
        sections: sectionCount,
        mediaFiles: mediaFiles.length,
        members: (membersRes.members ?? []).length,
      };
      const newDrafts = draftRes.changes ?? [];
      statsCache.set(projectId, { stats: newStats, draftChanges: newDrafts });
      setStats(newStats);
      setDraftChanges(newDrafts);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  return { stats, draftChanges, loading, reload: load };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatValue({ value, loading }: { value: number; loading?: boolean }) {
  if (loading) return <div className="h-7 w-8 rounded bg-muted/50 animate-pulse" />;
  return <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>;
}

export default function Home() {
  const { current } = useProjects();
  const isAdmin = useIsAdmin();
  const { data: session } = useSession();
  const { stats, draftChanges, loading: statsLoading } = useDashboardStats(current?.id);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h >= 23 || h < 5) return "Hey night owl";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  const firstName = session?.user?.name?.split(" ")[0];

  if (!current) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
              <path d="M20 17V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10" />
              <path d="M2 17h20" />
              <path d="M12 12h.01" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">No project selected</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAdmin
                ? "Create a new project to get started."
                : "You need to be added to a project by an admin before you can start working."}
            </p>
          </div>
          {isAdmin && (
            <NewProjectDialog
              trigger={
                <Button>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                    <line x1="12" x2="12" y1="5" y2="19" />
                    <line x1="5" x2="19" y1="12" y2="12" />
                  </svg>
                  Create Project
                </Button>
              }
            />
          )}
        </div>
      </div>
    );
  }

  if (!current.onboardingComplete) {
    return <OnboardingWizard />;
  }

  const hasDrafts = draftChanges.length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      {/* Greeting */}
      <h1 className="text-2xl font-bold font-[family-name:var(--font-averia)] mb-10">
        {greeting}{firstName ? `, ${firstName}` : ""}
      </h1>

      {/* Draft banner */}
      {hasDrafts && (
        <Link href="/content" className="group mb-8 flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-5 py-4 transition-colors hover:bg-amber-500/[0.07]">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium">{draftChanges.length} unpublished {draftChanges.length === 1 ? "change" : "changes"}</p>
              <p className="text-xs text-muted-foreground">
                Last edited {timeAgo(draftChanges[0]?.updatedAt ?? new Date().toISOString())}
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-amber-500 group-hover:text-amber-400 transition-colors flex items-center gap-1">
            Review
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </span>
        </Link>
      )}

      {/* Stats row */}
      <div className={`grid grid-cols-4 gap-px rounded-xl border border-border overflow-hidden ${hasDrafts ? "" : "mb-8"}`}>
        <div className="flex flex-col gap-1 bg-card px-5 py-4">
          <StatValue value={stats.pages} loading={statsLoading} />
          <span className="text-xs text-muted-foreground">Pages</span>
        </div>
        <div className="flex flex-col gap-1 bg-card px-5 py-4">
          <StatValue value={stats.sections} loading={statsLoading} />
          <span className="text-xs text-muted-foreground">Sections</span>
        </div>
        <div className="flex flex-col gap-1 bg-card px-5 py-4">
          <StatValue value={stats.mediaFiles} loading={statsLoading} />
          <span className="text-xs text-muted-foreground">Media files</span>
        </div>
        <div className="flex flex-col gap-1 bg-card px-5 py-4">
          <StatValue value={stats.members} loading={statsLoading} />
          <span className="text-xs text-muted-foreground">Members</span>
        </div>
      </div>

      {/* Draft file list */}
      {hasDrafts && (
        <div className="mt-4 mb-8 rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Changed files</span>
          </div>
          {draftChanges.slice(0, 6).map((change, i) => (
            <div key={change.filename} className={`flex items-center justify-between px-5 py-2.5 ${i < Math.min(draftChanges.length, 6) - 1 ? "border-b border-border" : ""}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${change.status === "added" ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span className="text-[13px] font-mono truncate">{change.filename}</span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 ml-4">{timeAgo(change.updatedAt)}</span>
            </div>
          ))}
          {draftChanges.length > 6 && (
            <div className="px-5 py-2.5 border-t border-border">
              <span className="text-xs text-muted-foreground">+{draftChanges.length - 6} more</span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/content" className="group flex items-center gap-4 rounded-xl border border-border px-5 py-4 transition-all hover:bg-muted/30">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium">Content</p>
            <p className="text-xs text-muted-foreground">Edit pages & sections</p>
          </div>
        </Link>
        <Link href="/media" className="group flex items-center gap-4 rounded-xl border border-border px-5 py-4 transition-all hover:bg-muted/30">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium">Media</p>
            <p className="text-xs text-muted-foreground">Upload & organize files</p>
          </div>
        </Link>
      </div>

      {/* Project info */}
      {current.repo && (
        <div className="mt-8 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
              <path d="M9 18c-4.51 2-5-2-7-2" />
            </svg>
            <span className="font-mono">{current.repo}</span>
          </div>
          {current.branch && (
            <div className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" x2="6" y1="3" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
              <span className="font-mono">{current.branch}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";

type Project = {
  id: string;
  name: string;
  color: string;
  url?: string;
  repo?: string;
  branch?: string;
  srcDir?: string;
  publicDir?: string;
  role: "admin" | "editor" | "viewer";
  isMember?: boolean;
  onboardingComplete: boolean;
  kernInstalled: boolean;
  editorCaching: boolean;
  localPath?: string | null;
};

type ProjectContextType = {
  projects: Project[];
  current: Project | null;
  loading: boolean;
  githubReady: boolean | null;
  addProject: (project: { name: string; color?: string; url?: string; repo?: string; branch?: string }) => Promise<void>;
  updateProject: (id: string, data: Partial<Omit<Project, "id" | "role">>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrent: (id: string) => void;
  refresh: () => Promise<void>;
  checkGitHub: () => Promise<void>;
  completeOnboarding: (id: string) => void;
  setKernInstalled: (id: string, installed: boolean) => void;
};

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [githubReady, setGithubReady] = useState<boolean | null>(null);

  const setCurrentId = useCallback((id: string | null) => {
    setCurrentIdState(id);
    try {
      if (id) localStorage.setItem("kern-current-project", id);
      else localStorage.removeItem("kern-current-project");
    } catch { /* */ }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        setCurrentIdState((prev) => {
          // Try localStorage first, then existing selection, then first project
          let saved: string | null = null;
          try { saved = localStorage.getItem("kern-current-project"); } catch { /* */ }
          if (saved && data.some((p: Project) => p.id === saved)) return saved;
          if (prev && data.some((p: Project) => p.id === prev)) return prev;
          const fallback = data.length > 0 ? data[0].id : null;
          try { if (fallback) localStorage.setItem("kern-current-project", fallback); } catch { /* */ }
          return fallback;
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const checkGitHub = useCallback(async () => {
    try {
      const res = await fetch("/api/github/status");
      const data = await res.json();
      setGithubReady(!!data.ok);
    } catch {
      setGithubReady(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    checkGitHub();
  }, [fetchProjects, checkGitHub]);

  useEffect(() => {
    const handler = () => { checkGitHub(); };
    window.addEventListener("profile-dialog-closed", handler);
    return () => window.removeEventListener("profile-dialog-closed", handler);
  }, [checkGitHub]);

  const addProject = useCallback(async (project: { name: string; color?: string; url?: string; repo?: string; branch?: string }) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    if (res.ok) {
      const created = await res.json();
      setProjects((prev) => [...prev, { ...created, role: "admin" }]);
      setCurrentId(created.id);
    }
  }, []);

  const updateProject = useCallback(async (id: string, data: Partial<Omit<Project, "id" | "role">>) => {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
    }
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      setProjects((prev) => {
        const remaining = prev.filter((p) => p.id !== id);
        if (currentId === id) {
          const next = remaining.length > 0 ? remaining[0].id : null;
          setCurrentId(next);
        }
        return remaining;
      });
    }
  }, [currentId]);

  const completeOnboarding = useCallback((id: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, onboardingComplete: true } : p)));
    fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingComplete: true }),
    });
  }, []);

  const setKernInstalled = useCallback((id: string, installed: boolean) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? {
      ...p,
      kernInstalled: installed,
      // When uninstalling, also reset onboarding so the wizard shows again
      ...(!installed ? { onboardingComplete: false } : {}),
    } : p)));
  }, []);

  const current = projects.find((p) => p.id === currentId) ?? null;

  const value = useMemo(() => ({
    projects, current, loading, githubReady, addProject, updateProject, deleteProject,
    setCurrent: setCurrentId, refresh: fetchProjects, checkGitHub, completeOnboarding, setKernInstalled,
  }), [projects, current, loading, githubReady, addProject, updateProject, deleteProject, setCurrentId, fetchProjects, checkGitHub, completeOnboarding, setKernInstalled]);

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectProvider");
  return ctx;
}

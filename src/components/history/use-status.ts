"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { DeployStep } from "@/db/schema";

/* Shared poller for GET /api/status: one request loop for topbar, sidebar badges and the publish button. */

export type StatusDeploy = {
  id: string;
  status: "running" | "done" | "failed";
  message: string;
  steps: DeployStep[];
  createdAt: string;
  finishedAt: string | null;
};

export type SiteStatus = {
  deploy: StatusDeploy | null;
  preview: unknown;
  unsaved: string[];
  unpublished: { status: "A" | "M" | "D" | "R"; file: string }[];
  unread: number;
  formsUnread: number;
  approvalsOpen: number;
  /** Client time of the response, for "just finished" checks without Date.now() in render. */
  fetchedAt: number;
};

let status: SiteStatus | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function schedule() {
  if (timer) clearTimeout(timer);
  if (listeners.size === 0) return;
  timer = setTimeout(() => void refreshStatus(), status?.deploy?.status === "running" ? 2000 : 4000);
}

/** Fetches the status now (e.g. right after publishing) and restarts the poll timer. */
export function refreshStatus() {
  inflight ??= fetch("/api/status", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
    .then((data: Omit<SiteStatus, "fetchedAt">) => {
      status = { ...data, fetchedAt: Date.now() };
      emit();
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
      schedule();
    });
  return inflight;
}

/*
 * Every save goes through a Server Action. Refresh the status right after one finishes,
 * so "Veröffentlichen" and the badges update without waiting for the next poll.
 */
if (typeof window !== "undefined" && !(window as { __kernFetchHook?: boolean }).__kernFetchHook) {
  (window as { __kernFetchHook?: boolean }).__kernFetchHook = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await original(input, init);
    const headers = new Headers(init?.headers);
    if (headers.has("next-action") && listeners.size > 0) setTimeout(() => void refreshStatus(), 150);
    return response;
  };
  window.addEventListener("focus", () => {
    if (listeners.size > 0) void refreshStatus();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/** Current site status, or null until the first response arrives. */
export function useStatus() {
  const data = useSyncExternalStore(subscribe, () => status, () => null);
  useEffect(() => {
    if (!timer && !inflight) void refreshStatus();
  }, []);
  return data;
}

/** Files waiting to go live: unsaved edits plus saved but unpublished commits, without duplicates. */
export function pendingFiles(s: SiteStatus | null) {
  if (!s) return [];
  const map = new Map<string, "A" | "M" | "D" | "R" | "U">();
  for (const f of s.unpublished) map.set(f.file, f.status);
  for (const f of s.unsaved) if (!map.has(f)) map.set(f, "U");
  return [...map].map(([file, kind]) => ({ file, kind }));
}

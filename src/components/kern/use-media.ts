"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { MediaItem } from "@/lib/kern-types";

/* Tiny shared store for the media list: one fetch, shared by picker, library and fields. */

let items: MediaItem[] | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function reloadMedia() {
  loading = fetch("/api/media/list", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
    .then((data: MediaItem[]) => {
      items = data;
      emit();
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** A file from the last loaded list (e.g. right after an upload). */
export function mediaItemByName(name: string) {
  return items?.find((item) => item.name === name) ?? null;
}

export function useMedia() {
  const data = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => null,
  );
  useEffect(() => {
    if (items === null && !loading) void reloadMedia();
  }, []);
  const reload = useCallback(() => reloadMedia(), []);
  return { items: data, loading: data === null, reload };
}

/** Uploads files and refreshes the list. Returns the stored names. */
export async function uploadMedia(files: File[]) {
  const form = new FormData();
  for (const file of files) form.append("file", file);
  const res = await fetch("/api/media/upload", { method: "POST", body: form });
  const data = (await res.json()) as { ok: boolean; names?: string[]; error?: string };
  if (!data.ok) throw new Error(data.error ?? "Hochladen fehlgeschlagen.");
  await reloadMedia();
  return data.names ?? [];
}

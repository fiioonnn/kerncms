"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { MediaItem } from "@/lib/kern-types";

/* Tiny shared store for the media list: one fetch, shared by picker, library and fields. */

let items: MediaItem[] | null = null;
let folders: string[] | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function reloadMedia() {
  const json = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))));
  loading = Promise.all([json("/api/media/list"), json("/api/media/list?folders=1")])
    .then(([data, folderList]: [MediaItem[], string[]]) => {
      items = data;
      folders = folderList;
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

/** Folder paths of the media library ("Team", "Team/Portraits"), loaded together with the files. */
export function useMediaFolders() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => folders,
    () => null,
  );
}

/** Uploads files and refreshes the list. Returns the stored names. */
export async function uploadMedia(files: File[], folder?: string) {
  const form = new FormData();
  for (const file of files) form.append("file", file);
  if (folder) form.append("folder", folder);
  const res = await fetch("/api/media/upload", { method: "POST", body: form });
  const data = (await res.json()) as { ok: boolean; names?: string[]; error?: string };
  if (!data.ok) throw new Error(data.error ?? "Hochladen fehlgeschlagen.");
  await reloadMedia();
  return data.names ?? [];
}

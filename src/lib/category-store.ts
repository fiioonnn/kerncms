"use client";

import { useSyncExternalStore } from "react";

/*
 * Post categories shared between the post editor and the posts list.
 * Client-only example store; later this is backed by the content repository.
 */

export type Category = { id: string; label: string };

export const initialCategories: Category[] = [
  { id: "news", label: "Neuigkeiten" },
  { id: "events", label: "Events" },
  { id: "recipes", label: "Rezepte" },
  { id: "jobs", label: "Karriere" },
];

let categories: Category[] = initialCategories;
const listeners = new Set<() => void>();

function set(next: Category[]) {
  categories = next;
  listeners.forEach((l) => l());
}

function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Returns false when a category with that name already exists. */
export function addCategory(label: string) {
  const name = label.trim();
  if (!name || categories.some((c) => c.label.toLowerCase() === name.toLowerCase())) return false;
  let id = slugify(name) || "kategorie";
  while (categories.some((c) => c.id === id)) id = `${id}-2`;
  set([...categories, { id, label: name }]);
  return true;
}

export function renameCategory(id: string, label: string) {
  set(categories.map((c) => (c.id === id ? { ...c, label } : c)));
}

export function deleteCategory(id: string) {
  set(categories.filter((c) => c.id !== id));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCategories() {
  return useSyncExternalStore(subscribe, () => categories, () => initialCategories);
}

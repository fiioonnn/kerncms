"use client";

import { useCategories } from "@/lib/category-store";

/** Category name from the shared store, so renames and deletes show up in the posts list. */
export function PostCategory({ id }: { id: string }) {
  const category = useCategories().find((c) => c.id === id);
  return category ? <>{category.label}</> : <span className="italic">Ohne Kategorie</span>;
}

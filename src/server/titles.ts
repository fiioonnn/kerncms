import "server-only";
import type { Metadata } from "next";
import { findCollection } from "./config";
import { readEntry } from "./content";
import { getWorkspace } from "./sites";

/** Window titles inside a site name it, so tabs of different sites stay apart: "Seiten · Vereinsheim · kerncms". */
export async function siteTitle(): Promise<Metadata> {
  const { site } = await getWorkspace();
  return { title: { default: site.name, template: `%s · ${site.name} · kerncms` } };
}

export async function collectionTitle(key: string, id?: string): Promise<Metadata> {
  const ws = await getWorkspace();
  const collection = findCollection(ws.config, key);
  if (!collection) return {};
  if (id === undefined) return { title: collection.label };
  if (id === "") return { title: `${collection.singular} anlegen` };
  const values = await readEntry(ws.dir, collection, id).catch(() => null);
  const title = values?.[collection.titleField];
  return { title: `${typeof title === "string" && title.trim() ? title.trim() : id} · ${collection.label}` };
}

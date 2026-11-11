import type { BlockData, BlockDef, FieldDef, FieldType } from "@/lib/kern-types";

/* Helpers for field paths like `items.2.title` (contract §3). */

const segments = (path: string) => path.split(".").filter(Boolean);

/** Value at a dotted path, e.g. getAt(block, "tiles.0.title"). */
export function getAt(source: unknown, path: string): unknown {
  let current = source;
  for (const key of segments(path)) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Copy of `source` with the value at `path` replaced. Arrays stay arrays. */
export function setAt<T>(source: T, path: string, value: unknown): T {
  const [head, ...rest] = segments(path);
  if (head === undefined) return value as T;
  const container = (source ?? (/^\d+$/.test(head) ? [] : {})) as Record<string, unknown> | unknown[];
  const child = Array.isArray(container) ? container[Number(head)] : (container as Record<string, unknown>)[head];
  const next = rest.length ? setAt(child, rest.join("."), value) : value;
  if (Array.isArray(container)) {
    const copy = [...container];
    copy[Number(head)] = next;
    return copy as T;
  }
  return { ...container, [head]: next } as T;
}

/** Field types per block type, list sub-fields as `list.*.field`. Sent to the overlay. */
export function fieldTypesFor(blocks: BlockDef[]) {
  const result: Record<string, Record<string, FieldType>> = {};
  const walk = (fields: FieldDef[], prefix: string, into: Record<string, FieldType>) => {
    for (const field of fields) {
      const path = prefix + field.name;
      into[path] = field.type;
      if (field.type === "list" && field.fields) walk(field.fields, `${path}.*.`, into);
    }
  };
  for (const block of blocks) walk(block.fields, "", (result[block.type] = {}));
  return result;
}

/** Type of the field at a concrete path (`tiles.0.title` → type of `tiles.*.title`). */
export function typeAt(types: Record<string, FieldType> | undefined, path: string): FieldType | null {
  if (!types) return null;
  return types[path.replace(/\.\d+(?=\.|$)/g, ".*")] ?? null;
}

/**
 * Paths of leaf values that differ between `a` and `b`. Returns null when the
 * shape changed (list items added or removed), so a patch can't describe it.
 */
export function changedLeaves(a: unknown, b: unknown, prefix = ""): string[] | null {
  if (Object.is(a, b)) return [];
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return null;
    const out: string[] = [];
    for (let i = 0; i < a.length; i++) {
      const sub = changedLeaves(a[i], b[i], `${prefix}${prefix ? "." : ""}${i}`);
      if (sub === null) return null;
      out.push(...sub);
    }
    return out;
  }
  const isObj = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const out: string[] = [];
    for (const key of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
      const sub = changedLeaves(ra[key], rb[key], `${prefix}${prefix ? "." : ""}${key}`);
      if (sub === null) return null;
      out.push(...sub);
    }
    return out;
  }
  return [prefix];
}

export function stripHtml(value: unknown) {
  return typeof value === "string"
    ? value
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

/** Short text describing a block in the outline: its first non-empty text field. */
export function blockSummary(block: BlockData, def: BlockDef | undefined) {
  for (const field of def?.fields ?? []) {
    if (["text", "inline", "textarea", "richtext"].includes(field.type)) {
      const text = stripHtml(block[field.name]);
      if (text) return text;
    }
  }
  return def?.description || "Ohne Inhalt";
}

export function newBlockId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "b-";
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/** Compares URL paths, ignoring a trailing slash. */
export function samePath(a: string, b: string) {
  const strip = (p: string) => p.replace(/\/+$/, "") || "/";
  return strip(a) === strip(b);
}

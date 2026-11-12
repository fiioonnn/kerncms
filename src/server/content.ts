import "server-only";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { marked } from "marked";
import TurndownService from "turndown";
import { Document, isScalar, parse as parseYaml, visit } from "yaml";
import type {
  BlockEntries,
  BlockData,
  CollectionDef,
  ContentStatus,
  EntrySummary,
  EntryValues,
  GlobalDef,
  KernConfig,
  PageData,
  PageSummary,
  Redirect,
} from "@/lib/kern-types";
import { log, uncommittedFiles, unpublishedFiles } from "./git";
import { sanitizeValues, validateValues } from "./sanitize";

/* ---------- Paths ---------- */

/** Resolves a repo-relative path inside the checkout and refuses anything outside it. */
export function safeJoin(dir: string, relative: string) {
  const full = path.resolve(dir, relative);
  if (full !== dir && !full.startsWith(dir + path.sep)) throw new Error("Ungültiger Pfad.");
  return full;
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isValidName(name: string) {
  return /^[a-z0-9][a-z0-9-]*$/.test(name);
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

/* ---------- JSON that keeps the file's own formatting ---------- */

type Layout = Map<string, boolean>; // path → written on one line

/** Records, for every object/array in the source text, whether it sits on a single line. */
export function readLayout(source: string): Layout {
  const layout: Layout = new Map();
  let i = 0;
  const ws = () => {
    while (i < source.length && /\s/.test(source[i])) i++;
  };
  const str = () => {
    i++;
    while (source[i] !== '"') i += source[i] === "\\" ? 2 : 1;
    i++;
  };
  const value = (path: string) => {
    ws();
    const ch = source[i];
    if (ch === "{" || ch === "[") {
      const start = i;
      i++;
      let index = 0;
      ws();
      while (source[i] !== (ch === "{" ? "}" : "]")) {
        let key = String(index++);
        if (ch === "{") {
          const k = i;
          str();
          key = JSON.parse(source.slice(k, i));
          ws();
          i++; // colon
        }
        value(path ? `${path}.${key}` : key);
        ws();
        if (source[i] === ",") i++;
        ws();
      }
      i++;
      layout.set(path, !source.slice(start, i).includes("\n"));
    } else if (ch === '"') str();
    else while (i < source.length && !/[,\]}\s]/.test(source[i])) i++;
  };
  try {
    value("");
  } catch {
    layout.clear();
  }
  return layout;
}

function inlineJson(v: unknown): string {
  if (Array.isArray(v)) return v.length ? `[${v.map(inlineJson).join(", ")}]` : "[]";
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inlineJson(x)}`).join(", ")} }` : "{}";
  }
  return JSON.stringify(v);
}

/** Path with list indexes replaced, so new items can follow how their siblings are written. */
function siblingPath(path: string) {
  return path.replace(/\.\d+(?=\.|$)/g, ".*").replace(/^\d+(?=\.|$)/, "*");
}

export function formatJson(value: unknown, layout: Layout = new Map(), path = "", indent = ""): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const single = inlineJson(value);
  let oneLine = layout.get(path);
  if (oneLine === undefined) {
    const pattern = siblingPath(path);
    for (const [p, inline] of layout) {
      if (p && siblingPath(p) === pattern) {
        oneLine = inline;
        break;
      }
    }
  }
  // New structures without a model: short leaf objects inline, the rest expanded.
  oneLine ??= Boolean(indent) && single.length <= 80 && !/[[{]/.test(single.slice(1));
  if (oneLine) return single;
  const next = indent + "  ";
  const child = (key: string) => (path ? `${path}.${key}` : key);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((x, n) => next + formatJson(x, layout, child(String(n)), next)).join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([k, v]) => `${next}${JSON.stringify(k)}: ${formatJson(v, layout, child(k), next)}`).join(",\n")}\n${indent}}`;
}

async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const previous = existsSync(file) ? await readFile(file, "utf8") : "";
  await writeFile(file, formatJson(data, readLayout(previous)) + "\n", "utf8");
}

/* ---------- Status and last change per file ---------- */

export type ChangeSet = {
  unsaved: Set<string>;
  unpublished: Map<string, "A" | "M" | "D" | "R">;
  lastChange: Map<string, { date: string; author: string }>;
};

export const getChangeSet = cache(async (dir: string, liveBranch: string): Promise<ChangeSet> => {
  const [unsaved, unpublished, history] = await Promise.all([
    uncommittedFiles(dir),
    unpublishedFiles(dir, liveBranch),
    log(dir, { limit: 400 }),
  ]);
  const lastChange = new Map<string, { date: string; author: string }>();
  for (const entry of history) {
    for (const file of entry.files) if (!lastChange.has(file)) lastChange.set(file, { date: entry.date, author: entry.author });
  }
  return {
    unsaved: new Set(unsaved),
    unpublished: new Map(unpublished.map((u) => [u.file, u.status])),
    lastChange,
  };
});

export function statusOf(changes: ChangeSet, file: string): ContentStatus {
  if (changes.unsaved.has(file)) return "unsaved";
  const status = changes.unpublished.get(file);
  if (status === "A") return "new";
  if (status) return "draft";
  return "live";
}

/* ---------- Pages ---------- */

export function pageFile(config: KernConfig, name: string) {
  return path.posix.join(config.pages.path, `${name}.json`);
}

export function pageNameForPath(urlPath: string) {
  if (urlPath === "/" || urlPath === "") return "index";
  return slugify(urlPath.replace(/\//g, "-")) || "seite";
}

export async function listPages(dir: string, config: KernConfig, changes: ChangeSet): Promise<PageSummary[]> {
  const folder = safeJoin(dir, config.pages.path);
  if (!existsSync(folder)) return [];
  const files = (await readdir(folder)).filter((f) => f.endsWith(".json")).sort();
  const pages = await Promise.all(
    files.map(async (file): Promise<PageSummary | null> => {
      const rel = path.posix.join(config.pages.path, file);
      try {
        const data = await readJson<PageData>(path.join(folder, file));
        const last = changes.lastChange.get(rel);
        return {
          file: rel,
          name: file.replace(/\.json$/, ""),
          title: data.title ?? file,
          path: data.path ?? "/",
          status: statusOf(changes, rel),
          blocks: Array.isArray(data.blocks) ? data.blocks.length : 0,
          updatedAt: last?.date ?? null,
          updatedBy: last?.author ?? null,
        };
      } catch {
        return null;
      }
    }),
  );
  return pages
    .filter((p): p is PageSummary => p !== null)
    .sort((a, b) => (a.path === "/" ? -1 : b.path === "/" ? 1 : a.path.localeCompare(b.path)));
}

export async function readPage(dir: string, config: KernConfig, name: string): Promise<PageData> {
  if (!isValidName(name)) throw new Error("Ungültiger Seitenname.");
  const data = await readJson<PageData>(safeJoin(dir, pageFile(config, name)));
  return {
    ...data,
    title: data.title ?? "",
    path: data.path ?? "/",
    seo: data.seo ?? {},
    blocks: Array.isArray(data.blocks) ? data.blocks : [],
  };
}

export function cleanBlocks(config: KernConfig, blocks: BlockData[]) {
  return blocks.map((block) => {
    const def = config.blocks.find((b) => b.type === block.type);
    if (!def) return block;
    const clean = { ...(sanitizeValues(def.fields, block, config.marks) as BlockData), id: block.id, type: block.type };
    // Order and hidden entries of a block that shows a collection (contract §1, `source`).
    if (def.source?.kind === "collection" && "entries" in clean) {
      const raw = clean.entries as Partial<BlockEntries> | null | undefined;
      const ids = (list: unknown) => (Array.isArray(list) ? [...new Set(list.filter((id): id is string => typeof id === "string" && isValidName(id)))] : []);
      const entries: BlockEntries = { order: ids(raw?.order), hidden: ids(raw?.hidden) };
      if (entries.order.length || entries.hidden.length) clean.entries = entries;
      else delete clean.entries;
    }
    return clean;
  });
}

export function normalizePath(input: string) {
  const trimmed = input.trim();
  if (!trimmed || trimmed === "/") return "/";
  const clean = "/" + trimmed.replace(/^\/+|\/+$/g, "").split("/").map(slugify).filter(Boolean).join("/");
  return clean === "/" ? "/" : clean;
}

export async function writePage(dir: string, config: KernConfig, name: string, data: PageData) {
  if (!isValidName(name)) throw new Error("Ungültiger Seitenname.");
  const page: PageData = {
    ...data,
    title: data.title.trim(),
    path: normalizePath(data.path),
    seo: data.seo ?? {},
    blocks: cleanBlocks(config, data.blocks),
  };
  if (!page.title) throw new Error("Die Seite braucht einen Titel.");
  const others = await listPages(dir, config, { unsaved: new Set(), unpublished: new Map(), lastChange: new Map() });
  const clash = others.find((p) => p.path === page.path && p.name !== name);
  if (clash) throw new Error(`Die Adresse ${page.path} gehört schon zur Seite „${clash.title}“.`);
  await writeJson(safeJoin(dir, pageFile(config, name)), page);
  return page;
}

/* ---------- Collections ---------- */

function entryExt(collection: CollectionDef) {
  return collection.format === "md" ? ".md" : ".json";
}

export function entryFile(collection: CollectionDef, id: string) {
  return path.posix.join(collection.path, id + entryExt(collection));
}

/** In markdown collections, the `body` field is the markdown body. */
function bodyField(collection: CollectionDef) {
  return collection.format === "md" ? collection.fields.find((f) => f.name === "body" && f.type === "richtext") : undefined;
}

/* The CMS edits rich text as HTML; markdown files keep markdown so diffs stay readable. */
const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced", emDelimiter: "*" });
turndown.keep(["span"]);
// Default list items get "1.  " / "-   "; use a single space like hand-written markdown.
turndown.addRule("listItem", {
  filter: "li",
  replacement(content, node) {
    const parent = node.parentNode as HTMLElement | null;
    let prefix = "- ";
    if (parent?.nodeName === "OL") {
      const start = Number(parent.getAttribute("start") ?? 1);
      prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
    }
    const text = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n/gm, "\n" + " ".repeat(prefix.length));
    return prefix + text + (node.nextSibling && !/\n$/.test(text) ? "\n" : "");
  },
});

export function markdownToHtml(markdown: string) {
  return (marked.parse(markdown, { async: false, gfm: true }) as string).trim();
}

export function htmlToMarkdown(html: string) {
  return turndown.turndown(html).trim();
}

export function parseMarkdown(source: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match) return { data: {} as EntryValues, body: source.trim() };
  return { data: (parseYaml(match[1]) ?? {}) as EntryValues, body: match[2].trim() };
}

function toMarkdown(data: EntryValues, body: string, blankLineAfterFrontmatter: boolean) {
  const front = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  const doc = new Document(front);
  // Quote ISO dates so YAML parsers keep them as strings instead of turning them into Date objects.
  visit(doc, {
    Scalar(_, node) {
      if (isScalar(node) && typeof node.value === "string" && /^\d{4}-\d{2}-\d{2}/.test(node.value)) node.type = "QUOTE_DOUBLE";
    },
  });
  const yaml = doc.toString({ lineWidth: 0 });
  return `---\n${yaml}---\n${blankLineAfterFrontmatter ? "\n" : ""}${body.trim()}\n`;
}

function normalizeEntryValues(values: EntryValues) {
  // YAML parses dates into Date objects; the CMS works with YYYY-MM-DD strings.
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : v]),
  );
}

export async function readEntry(dir: string, collection: CollectionDef, id: string): Promise<EntryValues> {
  if (!isValidName(id)) throw new Error("Ungültige Eintrags-ID.");
  const source = await readFile(safeJoin(dir, entryFile(collection, id)), "utf8");
  if (collection.format === "json") return normalizeEntryValues(JSON.parse(source));
  const { data, body } = parseMarkdown(source);
  const bf = bodyField(collection);
  return normalizeEntryValues(bf ? { ...data, [bf.name]: markdownToHtml(body) } : data);
}

export async function listEntries(dir: string, collection: CollectionDef, changes: ChangeSet): Promise<EntrySummary[]> {
  const folder = safeJoin(dir, collection.path);
  if (!existsSync(folder)) return [];
  const ext = entryExt(collection);
  const files = (await readdir(folder)).filter((f) => f.endsWith(ext));
  const entries = await Promise.all(
    files.map(async (file): Promise<EntrySummary | null> => {
      const id = file.slice(0, -ext.length);
      const rel = path.posix.join(collection.path, file);
      try {
        const values = await readEntry(dir, collection, id);
        const last = changes.lastChange.get(rel);
        return { id, file: rel, values, status: statusOf(changes, rel), updatedAt: last?.date ?? null, updatedBy: last?.author ?? null };
      } catch {
        return null;
      }
    }),
  );
  return entries
    .filter((e): e is EntrySummary => e !== null)
    .sort((a, b) => compareEntries(collection, a, b));
}

/** The collection's default order: `sort` from the config, else newest date first, else by title. */
export function compareEntries(collection: CollectionDef, a: EntrySummary, b: EntrySummary) {
  const text = (e: EntrySummary, name: string) => String(e.values[name] ?? "");
  if (collection.sort) {
    const { field, desc } = collection.sort;
    const def = collection.fields.find((f) => f.name === field);
    const diff =
      def?.type === "number"
        ? Number(a.values[field] ?? 0) - Number(b.values[field] ?? 0)
        : text(a, field).localeCompare(text(b, field), "de", { numeric: true });
    if (diff !== 0) return desc ? -diff : diff;
  } else {
    const dateField = collection.fields.find((f) => f.type === "date");
    if (dateField) return text(b, dateField.name).localeCompare(text(a, dateField.name));
  }
  return text(a, collection.titleField || "").localeCompare(text(b, collection.titleField || ""), "de") || a.id.localeCompare(b.id);
}

export class ValidationError extends Error {
  constructor(readonly errors: Record<string, string>) {
    super("Bitte prüfe die markierten Felder.");
  }
}

export async function writeEntry(dir: string, config: KernConfig, collection: CollectionDef, id: string, values: EntryValues) {
  if (!isValidName(id)) throw new Error("Ungültige Eintrags-ID.");
  const errors = validateValues(collection.fields, values);
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const clean = sanitizeValues(collection.fields, values, config.marks);
  // Only keep known fields plus unknown keys already in the file, in schema order.
  const ordered: EntryValues = {};
  for (const field of collection.fields) if (clean[field.name] !== undefined) ordered[field.name] = clean[field.name];
  for (const [k, v] of Object.entries(clean)) if (!(k in ordered)) ordered[k] = v;
  const file = safeJoin(dir, entryFile(collection, id));
  if (collection.format === "json") {
    await writeJson(file, ordered);
  } else {
    const bf = bodyField(collection);
    const body = bf ? htmlToMarkdown(String(ordered[bf.name] ?? "")) : "";
    if (bf) delete ordered[bf.name];
    await mkdir(path.dirname(file), { recursive: true });
    const previous = existsSync(file) ? await readFile(file, "utf8") : "";
    const blankLine = previous ? /^---\r?\n[\s\S]*?\r?\n---\r?\n\r?\n/.test(previous) : true;
    await writeFile(file, toMarkdown(ordered, body, blankLine), "utf8");
  }
  return ordered;
}

export async function uniqueName(dir: string, folderRel: string, base: string, ext: string) {
  const root = base || "eintrag";
  let name = root;
  for (let i = 2; existsSync(safeJoin(dir, path.posix.join(folderRel, name + ext))); i++) name = `${root}-${i}`;
  return name;
}

/* ---------- Globals ---------- */

export async function readGlobal(dir: string, global: GlobalDef): Promise<EntryValues> {
  const file = safeJoin(dir, global.path);
  if (!existsSync(file)) return {};
  return readJson<EntryValues>(file);
}

export async function writeGlobal(dir: string, config: KernConfig, global: GlobalDef, values: EntryValues) {
  const errors = validateValues(global.fields, values);
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const clean = sanitizeValues(global.fields, values, config.marks);
  await writeJson(safeJoin(dir, global.path), clean);
  return clean;
}

/* ---------- Redirects ---------- */

export async function readRedirects(dir: string, config: KernConfig): Promise<Redirect[]> {
  if (!config.redirects) return [];
  const file = safeJoin(dir, config.redirects);
  if (!existsSync(file)) return [];
  const data = await readJson<Redirect[]>(file);
  return Array.isArray(data) ? data : [];
}

export async function writeRedirects(dir: string, config: KernConfig, redirects: Redirect[]) {
  if (!config.redirects) throw new Error("In kern.config.yaml ist keine Datei für Weiterleitungen angegeben.");
  const clean = redirects.map((r) => ({
    from: normalizePath(r.from),
    to: /^https?:\/\//.test(r.to) ? r.to : normalizePath(r.to),
    status: r.status === 302 ? 302 : 301,
  }));
  const seen = new Set<string>();
  for (const r of clean) {
    if (r.from === "/") throw new Error("Die Startseite kann nicht weitergeleitet werden.");
    if (seen.has(r.from)) throw new Error(`${r.from} ist doppelt vorhanden.`);
    if (r.from === r.to) throw new Error(`${r.from} leitet auf sich selbst weiter.`);
    seen.add(r.from);
  }
  await writeJson(safeJoin(dir, config.redirects), clean);
  return clean;
}

export async function removeFile(dir: string, rel: string) {
  await rm(safeJoin(dir, rel), { force: true });
}

/* ---------- Where is a value used ---------- */

/** Finds files under the content folders that mention the given string (e.g. a media path). */
export async function findUsages(dir: string, config: KernConfig, needle: string) {
  const roots = [config.pages.path, ...config.collections.map((c) => c.path), ...config.globals.map((g) => path.posix.dirname(g.path))];
  const seen = new Set<string>();
  const hits: string[] = [];
  for (const root of new Set(roots)) {
    const folder = safeJoin(dir, root);
    if (!existsSync(folder)) continue;
    for (const file of await readdir(folder)) {
      const rel = path.posix.join(root, file);
      if (seen.has(rel) || !/\.(json|md|mdx)$/.test(file)) continue;
      seen.add(rel);
      const text = await readFile(path.join(folder, file), "utf8");
      if (text.includes(needle)) hits.push(rel);
    }
  }
  return hits;
}

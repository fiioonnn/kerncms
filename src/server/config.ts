import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type { BlockDef, CollectionDef, FieldDef, FieldType, FormDef, GlobalDef, KernConfig } from "@/lib/kern-types";

export const CONFIG_FILE = "kern.config.yaml";

const fieldTypes = new Set<FieldType>([
  "text",
  "email",
  "textarea",
  "inline",
  "richtext",
  "number",
  "boolean",
  "select",
  "date",
  "image",
  "link",
  "tags",
  "list",
  "blocks",
]);

export class ConfigError extends Error {}

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);
}

function humanize(key: string) {
  const spaced = key.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function parseOptions(raw: unknown) {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((option) =>
    isObject(option) ? { label: str(option.label ?? option.value), value: str(option.value ?? option.label) } : { label: str(option), value: str(option) },
  );
}

function parseFields(raw: unknown, where: string): FieldDef[] {
  if (raw === undefined || raw === null) return [];
  if (!isObject(raw)) throw new ConfigError(`${where}: "fields" muss ein Objekt sein.`);
  return Object.entries(raw).map(([name, def]) => {
    const d: Raw = isObject(def) ? def : { type: def };
    const type = str(d.type, "text") as FieldType;
    if (!fieldTypes.has(type)) throw new ConfigError(`${where}.${name}: unbekannter Feldtyp "${type}".`);
    const field: FieldDef = { name, type, label: str(d.label, humanize(name)) };
    if (d.description) field.description = str(d.description);
    if (d.required) field.required = true;
    if (d.default !== undefined) field.default = d.default;
    if (d.suffix) field.suffix = str(d.suffix);
    if (typeof d.min === "number") field.min = d.min;
    if (typeof d.max === "number") field.max = d.max;
    const options = parseOptions(d.options);
    if (options) field.options = options;
    if (type === "list") {
      field.fields = parseFields(d.fields, `${where}.${name}`);
      if (d.itemLabel) field.itemLabel = str(d.itemLabel);
    }
    return field;
  });
}

function section<T>(raw: unknown, name: string, map: (key: string, value: Raw) => T): T[] {
  if (raw === undefined || raw === null) return [];
  if (!isObject(raw)) throw new ConfigError(`"${name}" muss ein Objekt sein.`);
  return Object.entries(raw).map(([key, value]) => map(key, isObject(value) ? value : {}));
}

/** "datum" → ascending by datum, "-date" → newest first. */
function parseSort(value: unknown, fields: FieldDef[], where: string): CollectionDef["sort"] {
  if (value === undefined || value === null || value === "") return null;
  const raw = String(value).trim();
  const desc = raw.startsWith("-");
  const field = desc ? raw.slice(1) : raw;
  if (!fields.some((f) => f.name === field)) throw new ConfigError(`${where}.sort: Feld "${field}" gibt es nicht.`);
  return { field, desc };
}

export function parseConfig(source: string): KernConfig {
  let raw: unknown;
  try {
    raw = parse(source);
  } catch (error) {
    throw new ConfigError(`${CONFIG_FILE} ist kein gültiges YAML: ${(error as Error).message}`);
  }
  if (!isObject(raw)) throw new ConfigError(`${CONFIG_FILE} ist leer.`);
  const site = isObject(raw.site) ? raw.site : {};
  if (!site.id) throw new ConfigError(`${CONFIG_FILE}: "site.id" fehlt.`);
  const pages = isObject(raw.pages) ? raw.pages : {};

  const blocks = section(raw.blocks, "blocks", (type, v): BlockDef & { sourceKey?: string } => ({
    type,
    label: str(v.label, humanize(type)),
    description: str(v.description),
    icon: str(v.icon, "square"),
    fields: parseFields(v.fields, `blocks.${type}`),
    source: null,
    sourceKey: str(v.source),
  }));

  const collections = section(raw.collections, "collections", (key, v): CollectionDef => {
    const fields = parseFields(v.fields, `collections.${key}`);
    if (!v.path) throw new ConfigError(`collections.${key}: "path" fehlt.`);
    return {
      key,
      label: str(v.label, humanize(key)),
      singular: str(v.singular, str(v.label, humanize(key))),
      description: str(v.description),
      icon: str(v.icon, "folder"),
      path: str(v.path),
      format: v.format === "json" ? "json" : "md",
      titleField: str(v.titleField, fields[0]?.name ?? "title"),
      listFields: Array.isArray(v.listFields) ? v.listFields.map((f) => str(f)) : [],
      sort: parseSort(v.sort, fields, `collections.${key}`),
      fields,
    };
  });

  const globals = section(raw.globals, "globals", (key, v): GlobalDef => {
    if (!v.path) throw new ConfigError(`globals.${key}: "path" fehlt.`);
    return {
      key,
      label: str(v.label, humanize(key)),
      description: str(v.description),
      icon: str(v.icon, "globe"),
      path: str(v.path),
      fields: parseFields(v.fields, `globals.${key}`),
    };
  });

  const forms = section(raw.forms, "forms", (key, v): FormDef => ({
    key,
    label: str(v.label, humanize(key)),
    fields: parseFields(v.fields, `forms.${key}`),
  }));

  const marks = Array.isArray(raw.marks)
    ? raw.marks.filter(isObject).map((m) => ({ id: str(m.id), label: str(m.label, str(m.id)), class: str(m.class) }))
    : [];

  // "source: events" points at a collection or a global; resolved once both are known.
  for (const block of blocks as (BlockDef & { sourceKey?: string })[]) {
    const key = block.sourceKey;
    delete block.sourceKey;
    if (!key) continue;
    if (collections.some((c) => c.key === key)) block.source = { kind: "collection", key };
    else if (globals.some((g) => g.key === key)) block.source = { kind: "global", key };
    else throw new ConfigError(`${CONFIG_FILE}: blocks.${block.type}.source „${key}“ ist weder eine Sammlung noch ein Global.`);
  }

  return {
    site: { id: str(site.id), name: str(site.name, str(site.id)), url: str(site.url) },
    branch: str(raw.branch, "main"),
    preview: { command: str(isObject(raw.preview) ? raw.preview.command : "", "pnpm exec astro dev --port {port} --host 127.0.0.1") },
    build: { command: str(isObject(raw.build) ? raw.build.command : "", "pnpm exec astro build") },
    media: { dir: str(isObject(raw.media) ? raw.media.dir : "", "public/media") },
    marks,
    pages: { label: str(pages.label, "Seiten"), path: str(pages.path, "src/content/pages") },
    blocks,
    collections,
    globals,
    forms,
    redirects: raw.redirects ? str(raw.redirects) : null,
  };
}

const cacheByDir = new Map<string, { mtime: number; config: KernConfig }>();

/** Reads and parses kern.config.yaml from a checkout; cached until the file changes. */
export async function loadConfig(dir: string): Promise<KernConfig> {
  const file = path.join(dir, CONFIG_FILE);
  let mtime: number;
  try {
    mtime = (await stat(file)).mtimeMs;
  } catch {
    throw new ConfigError(`Im Repository fehlt die Datei ${CONFIG_FILE}.`);
  }
  const cached = cacheByDir.get(dir);
  if (cached && cached.mtime === mtime) return cached.config;
  const config = parseConfig(await readFile(file, "utf8"));
  cacheByDir.set(dir, { mtime, config });
  return config;
}

export function findCollection(config: KernConfig, key: string) {
  return config.collections.find((c) => c.key === key);
}

export function findGlobal(config: KernConfig, key: string) {
  return config.globals.find((g) => g.key === key);
}

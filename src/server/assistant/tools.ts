import "server-only";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { CONFIG_FILE, loadConfig } from "../config";
import { git, withSiteLock } from "../git";

/*
 * The assistant's tools: plain file access inside the site's draft checkout (kern/draft worktree),
 * plus a config check. Nothing outside the checkout, nothing in .git or node_modules.
 */

export class ToolError extends Error {}

export type ToolContext = {
  siteId: string;
  dir: string;
  /** Repo-relative paths the run wrote or deleted; committed when the run ends. */
  touched: Set<string>;
};

type Args = Record<string, unknown>;

export type ToolDef = {
  name: string;
  description: string;
  schema: { type: "object"; properties: Record<string, unknown>; required: string[] };
  /** Short German line for the chat, e.g. "Liest src/pages/index.astro". */
  label: (args: Args) => string;
  run: (ctx: ToolContext, args: Args) => Promise<string>;
};

const MAX_READ = 400_000;
const MAX_OUTPUT = 60_000;

function str(args: Args, key: string, required = true): string {
  const value = args[key];
  if (typeof value === "string") return value;
  if (required) throw new ToolError(`Parameter "${key}" fehlt oder ist kein Text.`);
  return "";
}

const BLOCKED = /^(\.git|node_modules|\.kern-data)(\/|$)/;

/** Repo-relative, normalised path; refuses anything outside the checkout or in .git / node_modules. */
function relPath(ctx: ToolContext, input: string) {
  const cleaned = input.trim().replace(/^\.\/+/, "").replace(/^\/+/, "");
  if (!cleaned) throw new ToolError("Leerer Pfad.");
  const full = path.resolve(ctx.dir, cleaned);
  if (!full.startsWith(ctx.dir + path.sep)) throw new ToolError(`Pfad außerhalb der Website: ${input}`);
  const rel = path.relative(ctx.dir, full).split(path.sep).join("/");
  if (BLOCKED.test(rel)) throw new ToolError(`Auf ${rel} hat der Assistent keinen Zugriff.`);
  return { rel, full };
}

/** Like relPath, and also refuses paths that leave the checkout through a symlink. */
async function realPath(ctx: ToolContext, input: string) {
  const resolved = relPath(ctx, input);
  const root = await realpath(ctx.dir);
  // The nearest part of the path that exists decides where it really points.
  let probe = resolved.full;
  for (;;) {
    const real = await realpath(probe).catch(() => null);
    if (real !== null) {
      if (real !== root && !real.startsWith(root + path.sep)) throw new ToolError(`${resolved.rel} zeigt aus der Website heraus.`);
      return resolved;
    }
    const parent = path.dirname(probe);
    if (parent === probe) return resolved;
    probe = parent;
  }
}

function clip(text: string) {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (gekürzt, ${text.length - MAX_OUTPUT} Zeichen mehr)` : text;
}

async function writeTracked(ctx: ToolContext, rel: string, full: string, content: string) {
  await withSiteLock(ctx.siteId, async () => {
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
  });
  ctx.touched.add(rel);
}

export const TOOLS: ToolDef[] = [
  {
    name: "list_files",
    description:
      "Lists the files of the website repository (tracked and new, without ignored files such as node_modules). Optionally only below a folder.",
    schema: { type: "object", properties: { folder: { type: "string", description: "Repo-relative folder, e.g. src/components. Empty for all." } }, required: [] },
    label: (a) => (typeof a.folder === "string" && a.folder ? `Sieht sich ${a.folder} an` : "Sieht sich die Dateien an"),
    async run(ctx, args) {
      const folder = str(args, "folder", false);
      const prefix = folder ? relPath(ctx, folder).rel : "";
      const out = await git(ctx.dir, ["ls-files", "--cached", "--others", "--exclude-standard", "-z", ...(prefix ? ["--", prefix] : [])]);
      const files = [...new Set(out.split("\0").filter(Boolean))].filter((f) => !BLOCKED.test(f) && existsSync(path.join(ctx.dir, f)));
      if (files.length === 0) return "Keine Dateien.";
      const shown = files.slice(0, 1500);
      return shown.join("\n") + (files.length > shown.length ? `\n… und ${files.length - shown.length} weitere` : "");
    },
  },
  {
    name: "read_file",
    description: "Reads a text file of the website repository. Returns the exact content (no line numbers), so it can be used for edit_file.",
    schema: { type: "object", properties: { path: { type: "string", description: "Repo-relative path" } }, required: ["path"] },
    label: (a) => `Liest ${String(a.path ?? "")}`,
    async run(ctx, args) {
      const { rel, full } = await realPath(ctx, str(args, "path"));
      const info = await stat(full).catch(() => null);
      if (!info) throw new ToolError(`${rel} gibt es nicht.`);
      if (info.isDirectory()) throw new ToolError(`${rel} ist ein Ordner. Nutze list_files.`);
      if (info.size > MAX_READ) throw new ToolError(`${rel} ist zu groß (${info.size} Bytes).`);
      const buffer = await readFile(full);
      if (buffer.includes(0)) throw new ToolError(`${rel} ist eine Binärdatei.`);
      return buffer.toString("utf8");
    },
  },
  {
    name: "write_file",
    description: "Creates a file or replaces its whole content. Prefer edit_file for small changes to existing files.",
    schema: {
      type: "object",
      properties: { path: { type: "string", description: "Repo-relative path" }, content: { type: "string", description: "Complete new file content" } },
      required: ["path", "content"],
    },
    label: (a) => `Schreibt ${String(a.path ?? "")}`,
    async run(ctx, args) {
      const { rel, full } = await realPath(ctx, str(args, "path"));
      const content = str(args, "content");
      const existed = existsSync(full);
      await writeTracked(ctx, rel, full, content);
      return `${existed ? "Überschrieben" : "Angelegt"}: ${rel}`;
    },
  },
  {
    name: "edit_file",
    description:
      "Replaces an exact piece of text in a file. old_text must match the file exactly (including whitespace) and be unique, unless replace_all is true. Read the file first.",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Repo-relative path" },
        old_text: { type: "string", description: "Exact text to replace" },
        new_text: { type: "string", description: "Replacement" },
        replace_all: { type: "boolean", description: "Replace every occurrence" },
      },
      required: ["path", "old_text", "new_text"],
    },
    label: (a) => `Ändert ${String(a.path ?? "")}`,
    async run(ctx, args) {
      const { rel, full } = await realPath(ctx, str(args, "path"));
      const oldText = str(args, "old_text");
      const newText = str(args, "new_text");
      if (!oldText) throw new ToolError("old_text ist leer. Zum Anlegen write_file verwenden.");
      const source = await readFile(full, "utf8").catch(() => null);
      if (source === null) throw new ToolError(`${rel} gibt es nicht.`);
      const count = source.split(oldText).length - 1;
      if (count === 0) throw new ToolError(`old_text kommt in ${rel} nicht vor. Datei neu lesen und exakt kopieren.`);
      if (count > 1 && args.replace_all !== true) throw new ToolError(`old_text kommt ${count}-mal vor. Mehr Kontext angeben oder replace_all setzen.`);
      const next = args.replace_all === true ? source.split(oldText).join(newText) : source.replace(oldText, () => newText);
      await writeTracked(ctx, rel, full, next);
      return `Geändert: ${rel} (${args.replace_all === true ? count : 1} Stelle${count > 1 && args.replace_all === true ? "n" : ""})`;
    },
  },
  {
    name: "delete_file",
    description: "Deletes a file of the website repository.",
    schema: { type: "object", properties: { path: { type: "string", description: "Repo-relative path" } }, required: ["path"] },
    label: (a) => `Löscht ${String(a.path ?? "")}`,
    async run(ctx, args) {
      const { rel, full } = await realPath(ctx, str(args, "path"));
      const info = await stat(full).catch(() => null);
      if (!info) throw new ToolError(`${rel} gibt es nicht.`);
      if (info.isDirectory()) throw new ToolError("Ordner werden nicht gelöscht, nur einzelne Dateien.");
      await withSiteLock(ctx.siteId, () => rm(full));
      ctx.touched.add(rel);
      return `Gelöscht: ${rel}`;
    },
  },
  {
    name: "search",
    description: "Searches all text files of the repository with a regular expression (git grep -E). Returns file:line:text.",
    schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Extended regular expression" },
        folder: { type: "string", description: "Only below this folder (optional)" },
        ignore_case: { type: "boolean" },
      },
      required: ["pattern"],
    },
    label: (a) => `Sucht nach „${String(a.pattern ?? "")}“`,
    async run(ctx, args) {
      const pattern = str(args, "pattern");
      const folder = str(args, "folder", false);
      const prefix = folder ? relPath(ctx, folder).rel : "";
      const flags = ["grep", "-n", "-I", "--untracked", "--exclude-standard", "-E", ...(args.ignore_case === true ? ["-i"] : []), "-e", pattern];
      try {
        const out = await git(ctx.dir, [...flags, "--", ...(prefix ? [prefix] : ["."]), ":(exclude)node_modules"]);
        return clip(out.trim()) || "Keine Treffer.";
      } catch {
        // git grep exits with 1 when nothing matches.
        return "Keine Treffer.";
      }
    },
  },
  {
    name: "validate_config",
    description: `Parses ${CONFIG_FILE} exactly like kerncms does and reports errors, or lists blocks, collections, globals and forms when it is valid. Run it after every change to ${CONFIG_FILE}.`,
    schema: { type: "object", properties: {}, required: [] },
    label: () => `Prüft ${CONFIG_FILE}`,
    async run(ctx) {
      try {
        const config = await loadConfig(ctx.dir);
        return `Gültig.\n${JSON.stringify(
          {
            blocks: config.blocks.map((b) => b.type),
            collections: config.collections.map((c) => c.key),
            globals: config.globals.map((g) => `${g.key} → ${g.path}`),
            forms: config.forms.map((f) => f.key),
          },
          null,
          2,
        )}`;
      } catch (error) {
        throw new ToolError(`Ungültig: ${(error as Error).message}`);
      }
    },
  },
];

export async function runTool(ctx: ToolContext, name: string, args: Args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, output: `Unbekanntes Werkzeug ${name}.` };
  try {
    return { ok: true, output: clip(await tool.run(ctx, args ?? {})) };
  } catch (error) {
    if (!(error instanceof ToolError)) console.error("[kern assistant]", error);
    return { ok: false, output: (error as Error).message || "Fehler" };
  }
}

export function toolLabel(name: string, args: Args) {
  const tool = TOOLS.find((t) => t.name === name);
  try {
    return tool ? tool.label(args ?? {}) : name;
  } catch {
    return name;
  }
}

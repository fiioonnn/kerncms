import "server-only";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { CONFIG_FILE, loadConfig } from "../config";
import { git, withSiteLock } from "../git";
import { getPreview } from "../preview";
import { ACTION_TOOLS } from "./action-tools";
import { DATA_TOOLS } from "./data-tools";
import { clip, str, ToolError, type Args, type ToolContext, type ToolDef } from "./tool-kit";

export type { ToolContext } from "./tool-kit";

/*
 * The assistant's tools: plain file access inside the site's draft checkout (kern/draft worktree),
 * plus a config check. Nothing outside the checkout, nothing in .git or node_modules.
 * The read-only tools for the site's data (statistics, forms, history, SEO) are in data-tools.ts.
 */

const MAX_READ = 400_000;

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

async function writeTracked(ctx: ToolContext, rel: string, full: string, content: string) {
  await withSiteLock(ctx.siteId, async () => {
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
  });
  ctx.touched.add(rel);
}

const FILE_TOOLS: ToolDef[] = [
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
    name: "check_preview",
    description:
      "Opens a page of the running preview (the site's dev server on the draft) and reports the HTTP status, whether a text appears, the visible text of the page, and recent dev server errors. Use it after changes to confirm the page renders them, e.g. that a new block shows up. If the site's content schema (src/content.config.ts) rejects a page JSON, the dev server logs the error here and the page keeps showing old content.",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "URL path of the page, e.g. / or /leistungen" },
        contains: { type: "string", description: "Text that should appear on the page (optional)" },
      },
      required: ["path"],
    },
    label: (a) => `Prüft die Vorschau von ${String(a.path ?? "/")}`,
    async run(ctx, args) {
      const urlPath = str(args, "path").trim() || "/";
      if (!urlPath.startsWith("/") || urlPath.startsWith("//")) throw new ToolError("path muss mit / beginnen, z. B. /kontakt.");
      const preview = getPreview(ctx.siteId);
      // From the first problem on, everything after it (Zod lists the failing fields on the following lines).
      const first = preview.log.findIndex((l) => /error|warn|fail|invalid|does not match/i.test(l));
      const logs = first < 0 ? [] : preview.log.slice(first).slice(-30);
      const logText = logs.length ? `\nMeldungen des Dev-Servers (neueste zuletzt):\n${logs.join("\n")}` : "\nKeine Fehler im Log des Dev-Servers.";
      if (preview.status !== "ready" || !preview.port) return `Die Vorschau läuft gerade nicht (Status: ${preview.status}${preview.error ? `, ${preview.error}` : ""}).${logText}`;
      // Give the dev server a moment to pick up files written just now.
      await new Promise((r) => setTimeout(r, 1200));
      const response = await fetch(`http://127.0.0.1:${preview.port}${urlPath}`, { signal: AbortSignal.timeout(30_000) }).catch((error: Error) => error);
      if (response instanceof Error) return `Die Seite konnte nicht geladen werden: ${response.message}${logText}`;
      const html = await response.text();
      const text = html
        .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
      const contains = str(args, "contains", false);
      const found = contains ? (text.toLowerCase().includes(contains.toLowerCase()) ? `\n„${contains}“ steht auf der Seite.` : `\n„${contains}“ steht NICHT auf der Seite.`) : "";
      return `HTTP ${response.status}${found}${logText}\n\nSichtbarer Text:\n${text.slice(0, 12_000)}`;
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

export const TOOLS: ToolDef[] = [...FILE_TOOLS, ...DATA_TOOLS, ...ACTION_TOOLS];

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

import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, sites, type Role, type Site } from "@/db/schema";
import { CONFIG_FILE, findCollection, findGlobal, loadConfig, parseConfig } from "./config";
import { getChangeSet, listEntries, listPages, readEntry, readGlobal, readPage } from "./content";
import { ensureWorktree } from "./git";
import type { TokenUser } from "./oauth";
import { readSkillFile } from "./skill";

/*
 * The kerncms MCP server (Streamable HTTP, stateless, JSON responses). Read-only: it
 * lists the user's sites, reads their config and content, validates a kern.config.yaml
 * and serves the guide for building Astro sites that kerncms can edit.
 */

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `kerncms is a Git-based visual CMS for Astro websites. Before building or changing an Astro site that customers will edit in kerncms, call kerncms_guide and follow it. Use validate_config on every kern.config.yaml you write. Use list_sites, get_site_config and read_content to look at existing sites. Labels shown to customers are German.`;

type Json = Record<string, unknown>;
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  run: (user: TokenUser, args: Json) => Promise<string>;
};

class ToolError extends Error {}

const str = (args: Json, key: string, required = true) => {
  const value = args[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (required) throw new ToolError(`"${key}" fehlt.`);
  return "";
};

/** Sites the user can open, like the site switcher (platform admins see all, as owner). */
async function sitesOf(user: TokenUser): Promise<{ site: Site; role: Role }[]> {
  const rows = await db
    .select({ site: sites, role: memberships.role })
    .from(memberships)
    .innerJoin(sites, eq(sites.id, memberships.siteId))
    .where(eq(memberships.userId, user.id))
    .orderBy(asc(sites.name));
  if (!user.isAdmin) return rows;
  const all = await db.select().from(sites).orderBy(asc(sites.name));
  return all.map((site) => rows.find((r) => r.site.id === site.id) ?? { site, role: "owner" as Role });
}

/** A site by id or (case-insensitive) name, if the user may read it. */
async function siteFor(user: TokenUser, ref: string) {
  const list = await sitesOf(user);
  const wanted = ref.toLowerCase();
  const hit = list.find((r) => r.site.id === ref) ?? list.find((r) => r.site.name.toLowerCase() === wanted);
  if (!hit) throw new ToolError(`Keine Website „${ref}“ gefunden. list_sites zeigt, welche es gibt.`);
  const dir = await ensureWorktree(hit.site);
  return { ...hit, dir };
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

function summary(config: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    site: config.site,
    blocks: config.blocks.map((b) => ({
      type: b.type,
      label: b.label,
      source: b.source,
      fields: b.fields.map((f) => `${f.name}: ${f.type}`),
    })),
    collections: config.collections.map((c) => ({ key: c.key, label: c.label, path: c.path, format: c.format, sort: c.sort })),
    globals: config.globals.map((g) => ({ key: g.key, label: g.label, path: g.path })),
    forms: config.forms.map((f) => ({ key: f.key, label: f.label })),
  };
}

const siteArg = { site: { type: "string", description: "Website-ID oder Name aus list_sites" } };

const TOOLS: Tool[] = [
  {
    name: "kerncms_guide",
    title: "kerncms-Anleitung",
    description:
      "How to build or adapt an Astro site so it is editable in kerncms: workflow and rules (part 'workflow'), the authoritative contract for kern.config.yaml, content files and editor markers ('contract'), and working code ('patterns'). Read it before writing code for a kerncms site.",
    inputSchema: {
      type: "object",
      properties: { part: { type: "string", enum: ["all", "workflow", "contract", "patterns"], description: "Default: all" } },
    },
    async run(_user, args) {
      const part = typeof args.part === "string" ? args.part : "all";
      const files = { workflow: "SKILL.md", contract: "references/contract.md", patterns: "references/patterns.md" } as const;
      const parts = part === "all" ? (Object.keys(files) as (keyof typeof files)[]) : [part as keyof typeof files];
      const out: string[] = [];
      for (const key of parts) {
        const data = files[key] ? await readSkillFile(files[key]) : null;
        if (!data) throw new ToolError(`Unbekannter Teil „${key}“.`);
        out.push(`<!-- ${files[key]} -->\n${data.toString("utf8")}`);
      }
      return out.join("\n\n---\n\n");
    },
  },
  {
    name: "validate_config",
    title: "kern.config.yaml prüfen",
    description: "Parses a kern.config.yaml exactly like kerncms does. Returns the errors, or a summary of blocks, collections, globals and forms when it is valid.",
    inputSchema: { type: "object", properties: { yaml: { type: "string", description: "Inhalt der kern.config.yaml" } }, required: ["yaml"] },
    async run(_user, args) {
      try {
        const config = parseConfig(str(args, "yaml"));
        return `Gültig.\n\n${json(summary(config))}`;
      } catch (error) {
        throw new ToolError(`Ungültig: ${(error as Error).message}`);
      }
    },
  },
  {
    name: "list_sites",
    title: "Websites",
    description: "The kerncms websites the signed-in user can access, with id, name, live URL and role.",
    inputSchema: { type: "object", properties: {} },
    async run(user) {
      const list = await sitesOf(user);
      if (list.length === 0) return "Keine Websites.";
      return json(list.map(({ site, role }) => ({ id: site.id, name: site.name, liveUrl: site.liveUrl, branch: site.branch, role })));
    },
  },
  {
    name: "get_site_config",
    title: "Konfiguration einer Website",
    description: "The site's kern.config.yaml (as in the current draft) plus a parsed summary.",
    inputSchema: { type: "object", properties: siteArg, required: ["site"] },
    async run(user, args) {
      const { dir } = await siteFor(user, str(args, "site"));
      const raw = await readFile(path.join(dir, CONFIG_FILE), "utf8").catch(() => null);
      if (raw === null) throw new ToolError("Die Website hat keine kern.config.yaml.");
      let parsed: string;
      try {
        parsed = json(summary(await loadConfig(dir)));
      } catch (error) {
        parsed = `Fehler beim Lesen: ${(error as Error).message}`;
      }
      return `# ${CONFIG_FILE}\n\n\`\`\`yaml\n${raw}\n\`\`\`\n\n# Zusammenfassung\n\n${parsed}`;
    },
  },
  {
    name: "list_content",
    title: "Inhalte einer Website",
    description: "Pages (name, title, path), collection entries (id, title) and globals of a site, as in the current draft.",
    inputSchema: { type: "object", properties: siteArg, required: ["site"] },
    async run(user, args) {
      const { site, dir } = await siteFor(user, str(args, "site"));
      const config = await loadConfig(dir);
      const changes = await getChangeSet(dir, site.branch);
      const pages = (await listPages(dir, config, changes)).map((p) => ({ name: p.name, title: p.title, path: p.path, blocks: p.blocks, status: p.status }));
      const collections = await Promise.all(
        config.collections.map(async (c) => ({
          key: c.key,
          label: c.label,
          entries: (await listEntries(dir, c, changes)).map((e) => ({ id: e.id, title: String(e.values[c.titleField] ?? e.id), status: e.status })),
        })),
      );
      return json({ pages, collections, globals: config.globals.map((g) => ({ key: g.key, label: g.label })) });
    },
  },
  {
    name: "read_content",
    title: "Inhalt lesen",
    description: "One page (kind 'page', key = page name), collection entry (kind 'entry', key = '<collection>/<id>') or global (kind 'global', key = global key) as JSON.",
    inputSchema: {
      type: "object",
      properties: { ...siteArg, kind: { type: "string", enum: ["page", "entry", "global"] }, key: { type: "string" } },
      required: ["site", "kind", "key"],
    },
    async run(user, args) {
      const { dir } = await siteFor(user, str(args, "site"));
      const config = await loadConfig(dir);
      const key = str(args, "key");
      switch (str(args, "kind")) {
        case "page":
          return json(await readPage(dir, config, key));
        case "entry": {
          const [collectionKey, id] = key.split("/");
          const collection = findCollection(config, collectionKey);
          if (!collection || !id) throw new ToolError("key muss „<sammlung>/<id>“ sein.");
          return json(await readEntry(dir, collection, id));
        }
        case "global": {
          const global = findGlobal(config, key);
          if (!global) throw new ToolError(`Kein Global „${key}“.`);
          return json(await readGlobal(dir, global));
        }
        default:
          throw new ToolError("kind muss page, entry oder global sein.");
      }
    },
  },
];

/* ---------- JSON-RPC ---------- */

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json };
type RpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const ok = (id: RpcRequest["id"], result: unknown): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: RpcRequest["id"], code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** Handles one JSON-RPC message; null for notifications (no reply). */
export async function handleRpc(user: TokenUser, message: RpcRequest): Promise<RpcResponse | null> {
  const isNotification = message.id === undefined;
  if (typeof message.method !== "string") return isNotification ? null : fail(message.id, -32600, "Invalid request");
  if (isNotification) return null;

  switch (message.method) {
    case "initialize": {
      const requested = typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : "";
      return ok(message.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "kerncms", title: "kerncms", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(message.id, {});
    case "tools/list":
      return ok(message.id, {
        tools: TOOLS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema, annotations: { readOnlyHint: true } })),
      });
    case "tools/call": {
      const name = message.params?.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(message.id, -32602, `Unknown tool: ${String(name)}`);
      const args = (message.params?.arguments ?? {}) as Json;
      try {
        return ok(message.id, { content: [{ type: "text", text: await tool.run(user, args) }] });
      } catch (error) {
        if (!(error instanceof ToolError)) console.error("[kern mcp]", error);
        return ok(message.id, { content: [{ type: "text", text: (error as Error).message || "Fehler" }], isError: true });
      }
    }
    case "resources/list":
      return ok(message.id, { resources: [] });
    case "prompts/list":
      return ok(message.id, { prompts: [] });
    default:
      return fail(message.id, -32601, `Method not found: ${message.method}`);
  }
}


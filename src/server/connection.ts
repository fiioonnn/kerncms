import "server-only";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { showFile } from "./git";

/*
 * kern.public.json in the site's repository: the CMS address and the site's public key, read by
 * the website at build time (forms and statistics). Written from Einstellungen → Einbindung, so
 * nobody has to set build variables. Both values are public; they end up in the HTML anyway.
 */
export const CONNECTION_FILE = "kern.public.json";

export type Connection = { url: string; site: string };

function parse(text: string): Connection | null {
  try {
    const data = JSON.parse(text) as Partial<Connection>;
    return { url: String(data.url ?? ""), site: String(data.site ?? "") };
  } catch {
    return null;
  }
}

/** The file in the draft checkout. */
export async function readConnection(dir: string): Promise<Connection | null> {
  const file = path.join(dir, CONNECTION_FILE);
  return existsSync(file) ? parse(await readFile(file, "utf8")) : null;
}

/** The draft's file, else the live branch's (added there directly, not yet in the draft). */
export async function currentConnection(dir: string, liveBranch: string) {
  const draft = await readConnection(dir);
  if (draft) return draft;
  const live = (await showFile(dir, liveBranch, CONNECTION_FILE)) ?? (await showFile(dir, `origin/${liveBranch}`, CONNECTION_FILE));
  return live ? parse(live) : null;
}

export async function writeConnection(dir: string, connection: Connection) {
  const body = {
    $comment: "Verbindung zu kerncms (Formulare, Statistik). Wird in kerncms unter Einstellungen → Einbindung gepflegt.",
    url: connection.url.replace(/\/$/, ""),
    site: connection.site,
  };
  await writeFile(path.join(dir, CONNECTION_FILE), JSON.stringify(body, null, 2) + "\n", "utf8");
}

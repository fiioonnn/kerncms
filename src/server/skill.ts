import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { crc32 } from "node:zlib";

/*
 * The "kerncms-astro" skill for AI coding assistants (Claude Code, claude.ai, …):
 * instructions for building Astro sites that work with kerncms. The contract is served
 * straight from docs/, so the skill never drifts from what the CMS expects.
 */

export const SKILL_NAME = "kerncms-astro";

const FILES: Record<string, string> = {
  "SKILL.md": "skills/kerncms-astro/SKILL.md",
  "references/contract.md": "docs/kern-contract.md",
  "references/patterns.md": "skills/kerncms-astro/references/patterns.md",
};

export const skillFiles = Object.keys(FILES);

export async function readSkillFile(name: string) {
  const source = FILES[name];
  if (!source) return null;
  return readFile(path.join(process.cwd(), source));
}

/** Minimal ZIP writer (no compression) — enough for a handful of Markdown files. */
function zip(entries: { name: string; data: Buffer }[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** The skill as a zip with a top-level "kerncms-astro/" folder. */
export async function skillZip() {
  const entries = await Promise.all(
    skillFiles.map(async (name) => ({ name: `${SKILL_NAME}/${name}`, data: (await readSkillFile(name))! })),
  );
  return zip(entries);
}

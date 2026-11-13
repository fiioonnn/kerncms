import "server-only";
import { existsSync } from "node:fs";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assistantChats } from "@/db/schema";
import { textOf, type Attachment, type Turn } from "@/lib/assistant";
import { findGlobal } from "../config";
import { isValidName, pageFile, readGlobal, readPage, safeJoin } from "../content";
import type { Workspace } from "../sites";
import type { ChatMessage } from "./agent";

/* Stored chats and how attachments become text for the model. */

const MAX_CHATS = 50;
const MAX_ATTACHMENT = 30_000;

export async function listChats(siteId: string, userId: string) {
  const rows = await db
    .select({ id: assistantChats.id, title: assistantChats.title, updatedAt: assistantChats.updatedAt })
    .from(assistantChats)
    .where(and(eq(assistantChats.siteId, siteId), eq(assistantChats.userId, userId)))
    .orderBy(desc(assistantChats.updatedAt))
    .limit(MAX_CHATS);
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function findChat(siteId: string, userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select()
    .from(assistantChats)
    .where(and(eq(assistantChats.id, id), eq(assistantChats.siteId, siteId), eq(assistantChats.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createChat(siteId: string, userId: string, title: string) {
  const [row] = await db.insert(assistantChats).values({ siteId, userId, title, turns: [] }).returning();
  // Keep the list short: drop the oldest chats beyond the limit.
  const all = await db
    .select({ id: assistantChats.id })
    .from(assistantChats)
    .where(and(eq(assistantChats.siteId, siteId), eq(assistantChats.userId, userId)))
    .orderBy(desc(assistantChats.updatedAt));
  for (const old of all.slice(MAX_CHATS)) await db.delete(assistantChats).where(eq(assistantChats.id, old.id));
  return row;
}

export async function saveChatTurns(id: string, turns: Turn[]) {
  await db.update(assistantChats).set({ turns, updatedAt: new Date() }).where(eq(assistantChats.id, id));
}

export async function deleteChat(siteId: string, userId: string, id: string) {
  await db.delete(assistantChats).where(and(eq(assistantChats.id, id), eq(assistantChats.siteId, siteId), eq(assistantChats.userId, userId)));
}

/** Short mention of attachments in earlier messages; their content was given when they were sent. */
function attachmentNote(attachments: Attachment[] | undefined) {
  if (!attachments?.length) return "";
  return `\n\n(Angehängt: ${attachments.map((a) => a.label).join(", ")})`;
}

/** The stored chat as model messages: user text (plus a note on attachments) and the assistant's answers. */
export function historyFrom(turns: Turn[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const turn of turns) {
    const content = turn.role === "user" ? turn.content + attachmentNote(turn.attachments) : textOf(turn) || (turn.error ? `(Abgebrochen: ${turn.error})` : "");
    if (!content.trim()) continue;
    const last = messages.at(-1);
    // Two turns of the same role in a row (e.g. an answer that failed): merge them.
    if (last?.role === turn.role) last.content += `\n\n${content}`;
    else messages.push({ role: turn.role, content: content.slice(0, 20_000) });
  }
  while (messages[0] && messages[0].role !== "user") messages.shift();
  return messages.slice(-30);
}

function valueAt(source: unknown, path: string): unknown {
  let current = source;
  for (const key of path.split(".").filter(Boolean)) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

const json = (value: unknown) => {
  const text = JSON.stringify(value, null, 2) ?? "null";
  return text.length > MAX_ATTACHMENT ? `${text.slice(0, MAX_ATTACHMENT)}\n… (gekürzt)` : text;
};

async function resolve(ws: Workspace, a: Attachment): Promise<string> {
  if (a.kind === "global") {
    const global = findGlobal(ws.config, a.key);
    if (!global) return `<anhang art="global" key="${a.key}">Diesen Bereich gibt es nicht mehr.</anhang>`;
    return `<anhang art="global" key="${global.key}" name="${global.label}" datei="${global.path}">\n${json(await readGlobal(ws.dir, global))}\n</anhang>`;
  }
  if (!isValidName(a.page)) return "";
  const file = pageFile(ws.config, a.page);
  if (!existsSync(safeJoin(ws.dir, file))) return `<anhang art="seite" datei="${file}">Diese Seite gibt es nicht mehr.</anhang>`;
  const page = await readPage(ws.dir, ws.config, a.page);
  if (a.kind === "page") return `<anhang art="seite" titel="${page.title}" url="${page.path}" datei="${file}">Blöcke: ${page.blocks.map((b) => `${b.type} (${b.id})`).join(", ") || "keine"}</anhang>`;

  const index = page.blocks.findIndex((b) => b.id === a.blockId);
  const block = page.blocks[index];
  if (!block) return `<anhang art="bereich" block-id="${a.blockId}" datei="${file}">Diesen Bereich gibt es auf der Seite nicht mehr.</anhang>`;
  const label = ws.config.blocks.find((d) => d.type === block.type)?.label ?? block.type;
  const where = `datei="${file}" block-id="${block.id}" block-typ="${block.type}" block-name="${label}" position="${index + 1} von ${page.blocks.length}"`;
  if (a.kind === "block") return `<anhang art="bereich" ${where}>\n${json(block)}\n</anhang>`;
  return `<anhang art="feld" ${where} feld="${a.field}">\n${json(valueAt(block, a.field) ?? null)}\n</anhang>`;
}

/** The attachments of a new message as text for the model, with their current content from the draft. */
export async function resolveAttachments(ws: Workspace, attachments: Attachment[]) {
  if (attachments.length === 0) return "";
  const parts = await Promise.all(attachments.map((a) => resolve(ws, a).catch(() => "")));
  const body = parts.filter(Boolean).join("\n\n");
  if (!body) return "";
  return `Die Person hat dazu Folgendes angehängt (aktueller Stand im Entwurf). Beziehe „das“, „hier“ oder „diesen Bereich“ darauf:\n\n${body}`;
}

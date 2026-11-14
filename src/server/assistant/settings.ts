import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiSettings, type AiAccess, type AiProvider, type Role } from "@/db/schema";
import { decrypt } from "../crypto";
import { hasRole } from "../sites";

export const DEFAULT_MODELS: Record<AiProvider, string> = { anthropic: "claude-opus-5-5", openai: "gpt-5" };

export const providerLabels: Record<AiProvider, string> = { anthropic: "Anthropic (Claude)", openai: "OpenAI" };

export async function loadAiSettings() {
  const [row] = await db.select().from(aiSettings).where(eq(aiSettings.id, "default")).limit(1);
  return row ?? null;
}

/** The decrypted key of a provider, or null when none is stored (or KERN_SECRET changed since). */
export function providerKey(row: NonNullable<Awaited<ReturnType<typeof loadAiSettings>>>, provider: AiProvider) {
  const stored = provider === "anthropic" ? row.anthropicKey : row.openaiKey;
  if (!stored) return null;
  try {
    return decrypt(stored);
  } catch {
    return null;
  }
}

/** Last four characters, so admins can tell which key is stored without seeing it. */
export function keyHint(row: NonNullable<Awaited<ReturnType<typeof loadAiSettings>>>, provider: AiProvider) {
  const key = providerKey(row, provider);
  return key ? `…${key.slice(-4)}` : null;
}

export function mayUseAssistant(access: AiAccess, user: { isAdmin: boolean }, role: Role) {
  if (user.isAdmin) return true;
  if (access === "app_admin") return false;
  return hasRole(role, access);
}

/** The assistant is usable when it is switched on, the chosen provider has a working key and the user's role is allowed. */
export async function assistantFor(user: { isAdmin: boolean }, role: Role) {
  const row = await loadAiSettings();
  if (!row?.enabled) return null;
  const apiKey = providerKey(row, row.provider);
  if (!apiKey || !mayUseAssistant(row.access, user, role)) return null;
  return { provider: row.provider, model: row.model, apiKey };
}

/** Models the key can use, newest first (Anthropic) or chat models only (OpenAI). Throws on a bad key. */
export async function listModels(provider: AiProvider, apiKey: string) {
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey });
    const ids: string[] = [];
    for await (const model of client.models.list()) ids.push(model.id);
    return ids;
  }
  const client = new OpenAI({ apiKey });
  const ids: string[] = [];
  for await (const model of client.models.list()) ids.push(model.id);
  return ids
    .filter((id) => /^(gpt-|o\d)/.test(id) && !/(audio|realtime|transcribe|tts|image|search|instruct)/.test(id))
    .sort((a, b) => b.localeCompare(a));
}

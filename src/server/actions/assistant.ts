"use server";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { aiSettings, type AiAccess, type AiProvider } from "@/db/schema";
import { run } from "../action";
import { DEFAULT_MODELS, listModels, loadAiSettings, providerKey } from "../assistant/settings";
import { requireAdmin } from "../auth";
import { encrypt } from "../crypto";

const providers: AiProvider[] = ["anthropic", "openai"];
const accessLevels: AiAccess[] = ["app_admin", "owner", "admin", "editor"];

function friendlyKeyError(error: unknown) {
  if (error instanceof Anthropic.AuthenticationError || error instanceof OpenAI.AuthenticationError) return "Der API-Schlüssel wurde abgelehnt.";
  if (error instanceof Anthropic.PermissionDeniedError || error instanceof OpenAI.PermissionDeniedError) return "Der API-Schlüssel hat keinen Zugriff auf die Modelle.";
  if (error instanceof Anthropic.APIConnectionError || error instanceof OpenAI.APIConnectionError) return "Der Anbieter ist gerade nicht erreichbar.";
  return (error as Error).message || "Der Schlüssel konnte nicht geprüft werden.";
}

export type AiSettingsInput = {
  provider: AiProvider;
  model: string;
  access: AiAccess;
  /** New key for the chosen provider; empty keeps the stored one. */
  apiKey: string;
};

/** Saves provider, model and access. A new key is checked against the provider before it is stored. */
export async function saveAiSettings(input: AiSettingsInput) {
  return run(async () => {
    await requireAdmin();
    if (!providers.includes(input.provider)) throw new Error("Unbekannter Anbieter.");
    if (!accessLevels.includes(input.access)) throw new Error("Unbekannte Berechtigung.");
    const current = await loadAiSettings();
    const newKey = input.apiKey.trim();
    const key = newKey || (current ? providerKey(current, input.provider) : null);
    if (!key) throw new Error("Für diesen Anbieter ist noch kein API-Schlüssel hinterlegt.");
    let models: string[];
    try {
      models = await listModels(input.provider, key);
    } catch (error) {
      throw new Error(friendlyKeyError(error));
    }
    const model = input.model.trim() || DEFAULT_MODELS[input.provider];
    if (models.length > 0 && !models.includes(model)) throw new Error(`Das Modell „${model}“ ist mit diesem Schlüssel nicht verfügbar.`);
    const values = {
      provider: input.provider,
      model,
      access: input.access,
      updatedAt: new Date(),
      ...(newKey ? (input.provider === "anthropic" ? { anthropicKey: encrypt(newKey) } : { openaiKey: encrypt(newKey) }) : {}),
    };
    await db.insert(aiSettings).values({ id: "default", ...values }).onConflictDoUpdate({ target: aiSettings.id, set: values });
    revalidatePath("/", "layout");
    return null;
  });
}

/** Models available with the stored key, or with a key typed into the form but not saved yet. */
/** Offers the assistant outside the editor too (sidebar, topbar, its own page), or only in the editor. */
export async function setAssistantEnabled(enabled: boolean) {
  return run(async () => {
    await requireAdmin();
    await db
      .insert(aiSettings)
      .values({ id: "default", enabled })
      .onConflictDoUpdate({ target: aiSettings.id, set: { enabled, updatedAt: new Date() } });
    revalidatePath("/", "layout");
    return null;
  });
}

export async function availableModels(provider: AiProvider, typedKey: string) {
  return run(async () => {
    await requireAdmin();
    if (!providers.includes(provider)) throw new Error("Unbekannter Anbieter.");
    const current = await loadAiSettings();
    const key = typedKey.trim() || (current ? providerKey(current, provider) : null);
    if (!key) return [] as string[];
    try {
      return await listModels(provider, key);
    } catch (error) {
      throw new Error(friendlyKeyError(error));
    }
  });
}

export async function removeAiKey(provider: AiProvider) {
  return run(async () => {
    await requireAdmin();
    if (!providers.includes(provider)) throw new Error("Unbekannter Anbieter.");
    await db
      .insert(aiSettings)
      .values({ id: "default", provider, model: DEFAULT_MODELS[provider], [provider === "anthropic" ? "anthropicKey" : "openaiKey"]: null })
      .onConflictDoUpdate({ target: aiSettings.id, set: { [provider === "anthropic" ? "anthropicKey" : "openaiKey"]: null, updatedAt: new Date() } });
    revalidatePath("/", "layout");
    return null;
  });
}

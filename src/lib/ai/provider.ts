import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { decrypt } from "@/lib/crypto";

// ── Types ──────────────────────────────────────────────────

interface AIProvider {
  complete(prompt: string, system: string): Promise<string>;
}

type ProviderName = "anthropic" | "openai";

// ── Concurrency limiter ────────────────────────────────────

const MAX_CONCURRENT = 3;
let running = 0;
const queue: (() => void)[] = [];

function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(() => { running++; resolve(); }));
}

function release() {
  running--;
  const next = queue.shift();
  if (next) next();
}

// ── Retry logic ────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;

      // Rate limit — exponential backoff
      if (msg.includes("429") && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }

      // Server error — retry once
      if ((msg.includes("500") || msg.includes("502") || msg.includes("503")) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      throw lastError;
    }
  }
  throw lastError ?? new Error("Retry exhausted");
}

// ── Anthropic ──────────────────────────────────────────────

class AnthropicProvider implements AIProvider {
  constructor(private apiKey: string, private model: string) {}

  async complete(prompt: string, system: string): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 16384,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(`Anthropic ${res.status}: ${data.error?.message ?? res.statusText}`);
    }

    const data = await res.json();
    return data.content?.[0]?.text ?? "";
  }
}

// ── OpenAI ─────────────────────────────────────────────────

class OpenAIProvider implements AIProvider {
  constructor(private apiKey: string, private model: string) {}

  async complete(prompt: string, system: string): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 16384,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(`OpenAI ${res.status}: ${data.error?.message ?? res.statusText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
}

// ── Factory ────────────────────────────────────────────────

function createProvider(provider: ProviderName, apiKey: string, model: string): AIProvider {
  switch (provider) {
    case "anthropic": return new AnthropicProvider(apiKey, model);
    case "openai": return new OpenAIProvider(apiKey, model);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── Main entry point ───────────────────────────────────────

export async function getAIResponse(prompt: string, system: string): Promise<string> {
  const settings = await db.select().from(aiSettings).get();
  if (!settings?.apiKey1) {
    throw new Error("No AI provider configured. Add an API key in Settings > AI.");
  }

  let primaryKey: string;
  try {
    primaryKey = decrypt(settings.apiKey1);
  } catch {
    throw new Error("Failed to decrypt primary API key. Check your CRYPTO_KEY.");
  }

  await acquire();
  try {
    // Try primary
    try {
      const primary = createProvider(
        settings.provider1 as ProviderName,
        primaryKey,
        settings.primaryModel,
      );
      return await withRetry(() => primary.complete(prompt, system));
    } catch (primaryError) {
      // Try fallback
      if (settings.apiKey2 && settings.provider2 && settings.fallbackModel) {
        let fallbackKey: string;
        try {
          fallbackKey = decrypt(settings.apiKey2);
        } catch {
          throw primaryError instanceof Error ? primaryError : new Error(String(primaryError));
        }

        const fallback = createProvider(
          settings.provider2 as ProviderName,
          fallbackKey,
          settings.fallbackModel,
        );
        return await withRetry(() => fallback.complete(prompt, system));
      }

      throw primaryError;
    }
  } finally {
    release();
  }
}

export type { AIProvider };

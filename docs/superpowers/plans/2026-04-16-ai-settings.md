# AI Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI integration settings (API keys, model selection, test connectivity) to the admin settings page with encrypted key storage.

**Architecture:** New `ai_settings` DB table stores encrypted API keys and model preferences. `lib/crypto.ts` handles AES-256-GCM encryption. Three API routes handle read/write/test. A new "AI" tab in the settings page provides the UI.

**Tech Stack:** Drizzle ORM (SQLite), Node crypto, Next.js API routes, React (existing UI patterns)

---

### Task 1: Crypto utility

**Files:**
- Create: `src/lib/crypto.ts`

- [ ] **Step 1: Create the crypto utility**

```typescript
// src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.CRYPTO_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("CRYPTO_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(encrypted: string): string {
  const key = getKey();
  const [ivHex, authTagHex, dataHex] = encrypted.split(":");
  if (!ivHex || !authTagHex || !dataHex) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function maskKey(key: string): string {
  if (key.length <= 6) return "••••••••••••";
  return key.slice(0, 6) + "••••••••••••";
}
```

- [ ] **Step 2: Add CRYPTO_KEY to .env.example**

Add this block to the end of `.env.example` before the Setup section:

```
# ── Encryption ───────────────────────────────────────────────────────────────

# 32-byte hex key for encrypting API keys at rest
# Generate one:  openssl rand -hex 32
CRYPTO_KEY=
```

Also generate a key and add it to your local `.env`:
```bash
echo "CRYPTO_KEY=$(openssl rand -hex 32)" >> .env
```

- [ ] **Step 3: Commit**

```
feat: add AES-256-GCM crypto utility for API key encryption
```

---

### Task 2: Database schema

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add ai_settings table to schema**

Add at the bottom of `src/db/schema.ts`, before the closing content tables section:

```typescript
export const aiSettings = sqliteTable("ai_settings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  provider1: text("provider_1", { enum: ["anthropic", "openai"] }).notNull().default("anthropic"),
  apiKey1: text("api_key_1"),
  primaryModel: text("primary_model").notNull().default("claude-sonnet-4-5"),
  provider2: text("provider_2", { enum: ["anthropic", "openai"] }),
  apiKey2: text("api_key_2"),
  fallbackModel: text("fallback_model"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

- [ ] **Step 2: Push schema to database**

```bash
npx drizzle-kit push
```

Expected: Table `ai_settings` created in SQLite.

- [ ] **Step 3: Commit**

```
feat: add ai_settings table for AI integration config
```

---

### Task 3: GET /api/settings/ai

**Files:**
- Create: `src/app/api/settings/ai/route.ts`

- [ ] **Step 1: Create the route with GET handler**

```typescript
// src/app/api/settings/ai/route.ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { decrypt, maskKey } from "@/lib/crypto";

export async function GET() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await db.select().from(aiSettings).get();

  if (!row) {
    return NextResponse.json({
      provider_1: "anthropic",
      masked_key_1: null,
      has_key_1: false,
      primary_model: "claude-sonnet-4-5",
      provider_2: null,
      masked_key_2: null,
      has_key_2: false,
      fallback_model: null,
    });
  }

  let maskedKey1: string | null = null;
  let maskedKey2: string | null = null;

  try {
    if (row.apiKey1) maskedKey1 = maskKey(decrypt(row.apiKey1));
  } catch { /* key unreadable, treat as absent */ }

  try {
    if (row.apiKey2) maskedKey2 = maskKey(decrypt(row.apiKey2));
  } catch { /* key unreadable, treat as absent */ }

  return NextResponse.json({
    provider_1: row.provider1,
    masked_key_1: maskedKey1,
    has_key_1: !!row.apiKey1,
    primary_model: row.primaryModel,
    provider_2: row.provider2,
    masked_key_2: maskedKey2,
    has_key_2: !!row.apiKey2,
    fallback_model: row.fallbackModel,
  });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | grep "settings/ai"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
feat: add GET /api/settings/ai endpoint
```

---

### Task 4: POST /api/settings/ai

**Files:**
- Modify: `src/app/api/settings/ai/route.ts`

- [ ] **Step 1: Add POST handler to the same route file**

Append this to `src/app/api/settings/ai/route.ts`:

```typescript
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/crypto";

export async function POST(request: Request) {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { provider_1, api_key_1, primary_model, provider_2, api_key_2, fallback_model } = body;

  if (!provider_1 || !primary_model) {
    return NextResponse.json({ error: "provider_1 and primary_model are required" }, { status: 400 });
  }

  const existing = await db.select().from(aiSettings).get();

  // Determine what to store for each key
  // If the incoming key looks masked (contains ••) or is empty, keep existing
  const isMasked = (k: string | undefined) => !k || k.includes("••");

  const encKey1 = isMasked(api_key_1) ? existing?.apiKey1 ?? null : encrypt(api_key_1);
  const encKey2 = isMasked(api_key_2) ? existing?.apiKey2 ?? null : encrypt(api_key_2);

  if (existing) {
    await db.update(aiSettings).set({
      provider1: provider_1,
      apiKey1: encKey1,
      primaryModel: primary_model,
      provider2: provider_2 ?? null,
      apiKey2: encKey2,
      fallbackModel: fallback_model ?? null,
      updatedAt: new Date(),
    }).where(eq(aiSettings.id, existing.id));
  } else {
    await db.insert(aiSettings).values({
      provider1: provider_1,
      apiKey1: encKey1,
      primaryModel: primary_model,
      provider2: provider_2 ?? null,
      apiKey2: encKey2,
      fallbackModel: fallback_model ?? null,
    });
  }

  return NextResponse.json({ success: true });
}
```

Note: The imports `eq` and `encrypt` need to be at the top of the file alongside the existing imports. Move them there.

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | grep "settings/ai"
```

- [ ] **Step 3: Commit**

```
feat: add POST /api/settings/ai endpoint with encrypted key storage
```

---

### Task 5: POST /api/settings/ai/test

**Files:**
- Create: `src/app/api/settings/ai/test/route.ts`

- [ ] **Step 1: Create the test endpoint**

```typescript
// src/app/api/settings/ai/test/route.ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { provider, api_key } = await request.json();

  if (!provider || !api_key) {
    return NextResponse.json({ error: "provider and api_key required" }, { status: 400 });
  }

  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": api_key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          error: data.error?.message ?? `HTTP ${res.status}`,
        });
      }
      return NextResponse.json({ success: true });
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          error: data.error?.message ?? `HTTP ${res.status}`,
        });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : "Connection failed",
    });
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | grep "settings/ai"
```

- [ ] **Step 3: Commit**

```
feat: add POST /api/settings/ai/test endpoint for API key validation
```

---

### Task 6: AI Settings UI

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Add "AI" to NAV_ITEMS**

Find the `NAV_ITEMS` array (around line 31) and add after the last item:

```typescript
{
  id: "ai",
  label: "AI",
  icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" /><path d="M22 5h-4" />
    </svg>
  ),
},
```

- [ ] **Step 2: Add the AISection component**

Add this function component in the settings file (before the main `SettingsPage` export):

```typescript
const AI_MODELS = {
  anthropic: [
    { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", badge: "recommended" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", badge: "fast & cheap" },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini", badge: "fast & cheap" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
  ],
};

function AISection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"1" | "2" | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; error?: string }>>({});

  const [provider1, setProvider1] = useState<"anthropic" | "openai">("anthropic");
  const [key1, setKey1] = useState("");
  const [hasKey1, setHasKey1] = useState(false);
  const [provider2, setProvider2] = useState<"anthropic" | "openai">("openai");
  const [key2, setKey2] = useState("");
  const [hasKey2, setHasKey2] = useState(false);
  const [primaryModel, setPrimaryModel] = useState("claude-sonnet-4-5");
  const [fallbackModel, setFallbackModel] = useState("");

  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((data) => {
        setProvider1(data.provider_1 ?? "anthropic");
        if (data.masked_key_1) setKey1(data.masked_key_1);
        setHasKey1(data.has_key_1);
        setPrimaryModel(data.primary_model ?? "claude-sonnet-4-5");
        setProvider2(data.provider_2 ?? "openai");
        if (data.masked_key_2) setKey2(data.masked_key_2);
        setHasKey2(data.has_key_2);
        setFallbackModel(data.fallback_model ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleTest(slot: "1" | "2") {
    const provider = slot === "1" ? provider1 : provider2;
    const apiKey = slot === "1" ? key1 : key2;
    if (!apiKey || apiKey.includes("••")) {
      toast.error("Enter a valid API key to test.");
      return;
    }
    setTesting(slot);
    setTestResult((prev) => ({ ...prev, [slot]: undefined as any }));
    try {
      const res = await fetch("/api/settings/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, api_key: apiKey }),
      });
      const data = await res.json();
      setTestResult((prev) => ({ ...prev, [slot]: data }));
      if (data.success) toast.success(`${provider === "anthropic" ? "Anthropic" : "OpenAI"} API key is valid.`);
      else toast.error(data.error ?? "Test failed.");
    } catch {
      setTestResult((prev) => ({ ...prev, [slot]: { success: false, error: "Request failed" } }));
      toast.error("Connection failed.");
    } finally {
      setTesting(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_1: provider1,
          api_key_1: key1.includes("••") ? undefined : key1 || undefined,
          primary_model: primaryModel,
          provider_2: provider2,
          api_key_2: key2.includes("••") ? undefined : key2 || undefined,
          fallback_model: fallbackModel || undefined,
        }),
      });
      if (res.ok) {
        toast.success("AI settings saved.");
        // Refresh masked keys
        const data = await fetch("/api/settings/ai").then((r) => r.json());
        if (data.masked_key_1) { setKey1(data.masked_key_1); setHasKey1(true); }
        if (data.masked_key_2) { setKey2(data.masked_key_2); setHasKey2(true); }
      } else {
        toast.error("Failed to save settings.");
      }
    } finally {
      setSaving(false);
    }
  }

  const availableModels = [
    ...(hasKey1 || !key1.includes("••") && key1 ? AI_MODELS[provider1] : []),
    ...(hasKey2 || !key2.includes("••") && key2 ? AI_MODELS[provider2] : []),
  ];
  // Deduplicate if both providers are the same
  const uniqueModels = availableModels.length > 0
    ? availableModels
    : [...AI_MODELS.anthropic, ...AI_MODELS.openai];

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  function ProviderBlock({ slot, provider, setProvider, apiKey, setApiKey, hasKey }: {
    slot: "1" | "2";
    provider: "anthropic" | "openai";
    setProvider: (v: "anthropic" | "openai") => void;
    apiKey: string;
    setApiKey: (v: string) => void;
    hasKey: boolean;
  }) {
    const result = testResult[slot];
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setProvider("anthropic")}
            className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${provider === "anthropic" ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            Anthropic
          </button>
          <button
            type="button"
            onClick={() => setProvider("openai")}
            className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${provider === "openai" ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            OpenAI
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm shrink-0 w-16">API Key</Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? "••••••••••••" : provider === "anthropic" ? "sk-ant-..." : "sk-..."}
            className="flex-1 font-mono text-xs"
          />
          <Button
            variant="outline"
            size="xs"
            disabled={testing !== null || !apiKey || apiKey.includes("••")}
            onClick={() => handleTest(slot)}
          >
            {testing === slot ? (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" />
              </svg>
            ) : result?.success ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg>
            ) : (
              "Test"
            )}
          </Button>
        </div>
        {result && !result.success && (
          <p className="text-xs text-destructive">{result.error}</p>
        )}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">AI Integrations</h2>
        <p className="text-xs text-muted-foreground mt-1">Configure AI providers for content analysis and extraction.</p>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Primary Provider</span>
          <ProviderBlock slot="1" provider={provider1} setProvider={setProvider1} apiKey={key1} setApiKey={setKey1} hasKey={hasKey1} />
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fallback Provider (optional)</span>
          <ProviderBlock slot="2" provider={provider2} setProvider={setProvider2} apiKey={key2} setApiKey={setKey2} hasKey={hasKey2} />
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Primary Model</Label>
            <select
              value={primaryModel}
              onChange={(e) => setPrimaryModel(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {Object.entries(AI_MODELS).map(([prov, models]) => (
                <optgroup key={prov} label={prov === "anthropic" ? "Anthropic" : "OpenAI"}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}{m.badge ? ` (${m.badge})` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Fallback Model</Label>
            <select
              value={fallbackModel}
              onChange={(e) => setFallbackModel(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">None</option>
              {Object.entries(AI_MODELS).map(([prov, models]) => (
                <optgroup key={prov} label={prov === "anthropic" ? "Anthropic" : "OpenAI"}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}{m.badge ? ` (${m.badge})` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Primary model is used for all AI operations. Fallback is used when primary fails or rate limits are hit.
        </p>

        <Button onClick={handleSave} disabled={saving} className="w-fit">
          {saving ? "Saving..." : "Save AI Settings"}
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add the section to the render output**

Find the section rendering block (around line 1035) and add:

```typescript
{section === "ai" && <AISection />}
```

After the existing `{section === "permissions" && ...}` line.

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | grep "settings/page"
```

- [ ] **Step 5: Test in browser**

1. Navigate to `/settings` and click the "AI" tab
2. Verify the form renders with provider toggles, key inputs, model dropdowns
3. Enter a test API key and click "Test" — verify spinner then result
4. Click "Save" — verify toast and keys become masked on reload

- [ ] **Step 6: Commit**

```
feat: add AI settings tab with provider config, key test, and model selection
```

---

### Task 7: Update .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add CRYPTO_KEY section**

Add before the `# ── Setup` section:

```
# ── Encryption ───────────────────────────────────────────────────────────────

# 32-byte hex key for encrypting API keys at rest
# Generate one:  openssl rand -hex 32
CRYPTO_KEY=
```

- [ ] **Step 2: Commit**

```
chore: add CRYPTO_KEY to .env.example
```

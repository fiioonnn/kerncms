# Phase 1: AI Settings — Design Spec

## Overview

Add AI integration settings to the admin settings page. Users configure Anthropic and/or OpenAI API keys, select primary and fallback models, and test connectivity. Keys are AES-256 encrypted at rest using a `CRYPTO_KEY` env var.

This phase is standalone — it stores configuration that Phase 2+ consumes.

## Database

New table `ai_settings` in `src/db/schema.ts`:

```
ai_settings
├── id              text PK (crypto.randomUUID)
├── provider_1      text enum: "anthropic" | "openai"
├── api_key_1       text (AES-256-GCM encrypted)
├── primary_model   text
├── provider_2      text enum: "anthropic" | "openai" | null
├── api_key_2       text (AES-256-GCM encrypted, nullable)
├── fallback_model  text (nullable)
├── updated_at      integer timestamp
```

Single-row table (one global AI config). Use upsert pattern — insert on first save, update thereafter.

## Encryption

New file `src/lib/crypto.ts`:

- `encrypt(plaintext: string): string` — AES-256-GCM, returns `iv:authTag:ciphertext` (hex-encoded)
- `decrypt(encrypted: string): string` — reverses the above
- Uses `CRYPTO_KEY` env var (32-byte hex string)
- `maskKey(key: string): string` — returns `sk-ant-••••••••••` (first 6 chars + dots)

## API Endpoints

### `GET /api/settings/ai`

- Requires admin role (`requireSession` + system admin check)
- Returns settings with keys masked
- Response: `{ provider_1, masked_key_1, primary_model, provider_2, masked_key_2, fallback_model, has_key_1, has_key_2 }`

### `POST /api/settings/ai`

- Requires admin role
- Body: `{ provider_1, api_key_1?, primary_model, provider_2?, api_key_2?, fallback_model? }`
- If `api_key_1` is provided (not masked placeholder), encrypt and store
- If omitted or masked, keep existing key unchanged
- Upsert into `ai_settings`

### `POST /api/settings/ai/test`

- Requires admin role
- Body: `{ provider: "anthropic" | "openai", api_key: string }`
- Sends minimal test request:
  - Anthropic: `POST /v1/messages` with `max_tokens: 1`
  - OpenAI: `POST /v1/chat/completions` with `max_tokens: 1`
- Returns `{ success: boolean, error?: string }`
- Does NOT store the key — just tests it

## Settings UI

Add new tab "AI" to `NAV_ITEMS` in settings page with a sparkles/brain icon.

### `AISection` component

Layout follows existing settings sections pattern:

**Anthropic block:**
- Label: "Anthropic"
- API key input (password type, placeholder shows masked key if saved)
- "Test" button inline (shows spinner, then checkmark or error)
- "Save" button

**OpenAI block:**
- Same pattern as Anthropic

**Model selection:**
- "Primary Model" — dropdown with all models from both providers
- "Fallback Model" — dropdown (optional, can be "None")
- Info text below: "Primary model is used for all AI operations. Fallback is used when primary fails or rate limits are hit."

**Model options:**

Anthropic:
- `claude-opus-4-5`
- `claude-sonnet-4-5` (label: "recommended")
- `claude-haiku-4-5` (label: "fast & cheap")

OpenAI:
- `gpt-4o`
- `gpt-4o-mini` (label: "fast & cheap")
- `gpt-4-turbo`

Models in dropdown are grouped by provider. Only show models for configured providers (has key).

**State behavior:**
- On mount: fetch `GET /api/settings/ai` to populate fields
- Keys show masked value if saved, empty if not
- User types new key → field shows plaintext while editing
- "Test" sends raw key to test endpoint, shows inline result
- "Save" sends to POST endpoint
- Toast on success/failure

## File Structure

```
src/lib/crypto.ts                    — encrypt/decrypt/mask
src/app/api/settings/ai/route.ts     — GET + POST settings
src/app/api/settings/ai/test/route.ts — POST test key
src/db/schema.ts                     — add ai_settings table
```

UI is inline in the existing settings page as a new section component, following the same pattern as `GeneralSection`, `MembersSection`, etc.

## Environment

Add to `.env.example`:
```
CRYPTO_KEY=           # 32-byte hex string for AES-256 encryption
```

## Scope boundaries

- No AI provider abstraction layer yet (Phase 2)
- No AI button in topbar yet (Phase 3)
- No analyze/generate functionality yet (Phase 3+4)
- This phase only stores and tests API keys

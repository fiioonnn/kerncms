# Phase 2: AI Provider Abstraction — Design Spec

## Overview

Create `lib/ai/provider.ts` — a unified interface for making AI completions via Anthropic or OpenAI, with automatic fallback, rate limiting, and retry logic. Reads configuration from the `ai_settings` table (Phase 1).

## Interface

```typescript
interface AIProvider {
  complete(prompt: string, system: string): Promise<string>
}
```

## Provider Implementations

### AnthropicProvider
- POST to `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`
- Body: `{ model, max_tokens: 4096, system, messages: [{ role: "user", content: prompt }] }`
- Extract: `response.content[0].text`

### OpenAIProvider
- POST to `https://api.openai.com/v1/chat/completions`
- Headers: `Authorization: Bearer {key}`
- Body: `{ model, max_tokens: 4096, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }`
- Extract: `response.choices[0].message.content`

## Main Entry Point

```typescript
async function getAIResponse(prompt: string, system: string): Promise<string>
```

1. Load settings from `ai_settings` table
2. Decrypt API keys
3. Try primary provider
4. On failure (rate limit, error, timeout): try fallback if configured
5. If both fail: throw with combined error messages

## Rate Limiting

- Max 3 concurrent requests (semaphore)
- Retry on 429 with exponential backoff (1s, 2s, 4s) — max 3 retries
- Retry on 500/502/503 once

## File Structure

```
src/lib/ai/provider.ts    — AIProvider interface, implementations, getAIResponse
src/lib/ai/prompts.ts     — System prompts for analyze/generate (placeholder for Phase 3)
```

## Scope

- No API endpoints (this is a library, not a route)
- No UI changes
- prompts.ts is just an empty file with exports for Phase 3

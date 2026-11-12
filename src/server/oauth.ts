import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { oauthClients, oauthGrants, oauthTokens, users } from "@/db/schema";
import { hashToken } from "./auth";

/*
 * A small OAuth 2.1 authorization server for the MCP connector (MCP authorization spec):
 * metadata (RFC 8414, RFC 9728), dynamic client registration (RFC 7591), authorization
 * code with PKCE (S256 only) and rotating refresh tokens. Tokens are opaque; only their
 * SHA-256 is stored.
 */

export const SCOPE = "kerncms";
const CODE_TTL = 10 * 60_000;
const ACCESS_TTL = 60 * 60_000;
const REFRESH_TTL = 30 * 24 * 60 * 60_000;

/** Public base URL of the CMS, e.g. https://cms.example.com (no trailing slash). */
export { publicBaseUrl as baseUrl } from "@/lib/public-url";

export const mcpResource = (base: string) => `${base}/mcp`;

export function authorizationServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
  };
}

export function protectedResourceMetadata(base: string) {
  return {
    resource: mcpResource(base),
    authorization_servers: [base],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "kerncms",
  };
}

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const token = () => randomBytes(32).toString("base64url");

/** https anywhere, http only for local development clients. */
function validRedirect(uri: string) {
  try {
    const url = new URL(uri);
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

/* ---------- Clients ---------- */

export async function registerClient(input: { client_name?: unknown; redirect_uris?: unknown }) {
  const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(validRedirect)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris müssen https-Adressen sein (http nur für localhost).");
  }
  const name = typeof input.client_name === "string" && input.client_name.trim() ? input.client_name.trim().slice(0, 100) : "Unbekannte App";
  const id = `kc_${randomBytes(16).toString("hex")}`;
  await db.insert(oauthClients).values({ id, name, redirectUris: uris });
  return { id, name, redirectUris: uris };
}

export async function findClient(id: string) {
  const [client] = await db.select().from(oauthClients).where(eq(oauthClients.id, id));
  return client ?? null;
}

/* ---------- Authorization codes ---------- */

export async function issueCode(input: { clientId: string; userId: string; redirectUri: string; codeChallenge: string; scope: string }) {
  const [grant] = await db
    .insert(oauthGrants)
    .values({ clientId: input.clientId, userId: input.userId, scope: input.scope })
    .returning({ id: oauthGrants.id });
  const code = token();
  await db.insert(oauthTokens).values({
    id: hashToken(code),
    kind: "code",
    grantId: grant.id,
    codeChallenge: input.codeChallenge,
    redirectUri: input.redirectUri,
    expiresAt: new Date(Date.now() + CODE_TTL),
  });
  return code;
}

async function issueTokens(grantId: string, scope: string) {
  const access = token();
  const refresh = token();
  const now = Date.now();
  await db.insert(oauthTokens).values([
    { id: hashToken(access), kind: "access", grantId, expiresAt: new Date(now + ACCESS_TTL) },
    { id: hashToken(refresh), kind: "refresh", grantId, expiresAt: new Date(now + REFRESH_TTL) },
  ]);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope };
}

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export async function exchangeCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string }) {
  const id = hashToken(input.code);
  // Single use: delete first, then check what was deleted.
  const [row] = await db.delete(oauthTokens).where(and(eq(oauthTokens.id, id), eq(oauthTokens.kind, "code"))).returning();
  if (!row || row.expiresAt.getTime() < Date.now()) throw new OAuthError("invalid_grant", "Der Code ist ungültig oder abgelaufen.");
  const [grant] = await db.select().from(oauthGrants).where(eq(oauthGrants.id, row.grantId));
  if (!grant || grant.clientId !== input.clientId) throw new OAuthError("invalid_grant", "Der Code gehört zu einer anderen App.");
  if (row.redirectUri !== input.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri stimmt nicht.");
  if (!input.codeVerifier || row.codeChallenge !== s256(input.codeVerifier)) throw new OAuthError("invalid_grant", "PKCE-Prüfung fehlgeschlagen.");
  return issueTokens(grant.id, grant.scope);
}

export async function refreshTokens(input: { refreshToken: string; clientId: string }) {
  const id = hashToken(input.refreshToken);
  const [row] = await db.delete(oauthTokens).where(and(eq(oauthTokens.id, id), eq(oauthTokens.kind, "refresh"))).returning();
  if (!row || row.expiresAt.getTime() < Date.now()) throw new OAuthError("invalid_grant", "Der Refresh-Token ist ungültig oder abgelaufen.");
  const [grant] = await db.select().from(oauthGrants).where(eq(oauthGrants.id, row.grantId));
  if (!grant || grant.clientId !== input.clientId) throw new OAuthError("invalid_grant", "Der Token gehört zu einer anderen App.");
  return issueTokens(grant.id, grant.scope);
}

/* ---------- Checking bearer tokens ---------- */

export type TokenUser = { id: string; email: string; name: string; isAdmin: boolean; grantId: string };

/** The user behind `Authorization: Bearer …`, or null. */
export async function userFromBearer(request: Request): Promise<TokenUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const [row] = await db
    .select({ grantId: oauthGrants.id, id: users.id, email: users.email, name: users.name, isAdmin: users.isAdmin, disabled: users.disabled })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId))
    .innerJoin(users, eq(users.id, oauthGrants.userId))
    .where(and(eq(oauthTokens.id, hashToken(match[1].trim())), eq(oauthTokens.kind, "access"), gt(oauthTokens.expiresAt, new Date())));
  if (!row || row.disabled) return null;
  void db.update(oauthGrants).set({ lastUsedAt: new Date() }).where(eq(oauthGrants.id, row.grantId)).catch(() => {});
  return { id: row.id, email: row.email, name: row.name, isAdmin: row.isAdmin, grantId: row.grantId };
}

/* ---------- Connected apps (profile) ---------- */

export async function listGrants(userId: string) {
  return db
    .select({ id: oauthGrants.id, app: oauthClients.name, createdAt: oauthGrants.createdAt, lastUsedAt: oauthGrants.lastUsedAt })
    .from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
    .where(eq(oauthGrants.userId, userId));
}

export async function revokeGrant(userId: string, grantId: string) {
  await db.delete(oauthGrants).where(and(eq(oauthGrants.id, grantId), eq(oauthGrants.userId, userId)));
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

/** JSON response with CORS, so browser-based clients can reach the OAuth endpoints. */
export function oauthJson(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, { ...init, headers: { ...CORS, "Cache-Control": "no-store", ...init.headers } });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });

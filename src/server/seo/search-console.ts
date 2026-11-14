import "server-only";
import { createSign } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleSettings } from "@/db/schema";
import { decrypt } from "../crypto";

/*
 * Google Search Console, read with a service account (JWT bearer flow, no user consent screen).
 * Admins add the service account's address as a user to each site's property; the property of a
 * site is found by its live URL. Results are cached for a few hours: Google updates them daily.
 */

export type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export type Metrics = { clicks: number; impressions: number; ctr: number; position: number };
export type QueryRow = Metrics & { query: string };

export type PagePerformance = {
  property: string;
  url: string | null;
  range: { start: string; end: string };
  current: Metrics | null;
  previous: Metrics | null;
  queries: QueryRow[];
};

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API = "https://www.googleapis.com/webmasters/v3";
const TTL = 3 * 60 * 60 * 1000;

type Cache = Map<string, { at: number; value: unknown }>;
const cache: Cache = ((globalThis as { __kernSearchConsole?: Cache }).__kernSearchConsole ??= new Map());
const tokens = ((globalThis as { __kernGoogleTokens?: Map<string, { token: string; expires: number }> }).__kernGoogleTokens ??= new Map());

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearSearchConsoleCache() {
  cache.clear();
  tokens.clear();
}

/** Parses a pasted JSON key; throws a readable error when it is not a service account key. */
export function parseServiceAccount(json: string): ServiceAccount {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Das ist kein gültiges JSON. Füge den Inhalt der heruntergeladenen Schlüsseldatei ein.");
  }
  const d = data as Record<string, unknown>;
  if (d?.type !== "service_account" || typeof d.client_email !== "string" || typeof d.private_key !== "string") {
    throw new Error("Das ist kein Schlüssel eines Dienstkontos (type „service_account“ mit client_email und private_key).");
  }
  return { client_email: d.client_email, private_key: d.private_key, token_uri: typeof d.token_uri === "string" ? d.token_uri : undefined };
}

export async function loadGoogleSettings() {
  const [row] = await db.select().from(googleSettings).where(eq(googleSettings.id, "default")).limit(1);
  return row ?? null;
}

/** The stored service account, or null when none is stored (or KERN_SECRET changed since). */
export async function storedServiceAccount() {
  const row = await loadGoogleSettings();
  if (!row?.serviceAccount) return null;
  try {
    return parseServiceAccount(decrypt(row.serviceAccount));
  } catch {
    return null;
  }
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

async function accessToken(account: ServiceAccount) {
  const known = tokens.get(account.client_email);
  if (known && known.expires - 60_000 > Date.now()) return known.token;
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }),
  )}`;
  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64url");
  } catch {
    throw new Error("Der private Schlüssel im Dienstkonto ist beschädigt.");
  }
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google hat den Schlüssel abgelehnt: ${json.error_description ?? json.error ?? res.status}.`);
  tokens.set(account.client_email, { token: json.access_token, expires: Date.now() + (json.expires_in ?? 3600) * 1000 });
  return json.access_token;
}

async function google<T>(account: ServiceAccount, path: string, body?: unknown): Promise<T> {
  const token = await accessToken(account);
  const res = await fetch(API + path, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    if (res.status === 403) throw new Error("Das Dienstkonto hat keinen Zugriff auf diese Property in der Search Console.");
    throw new Error(`Search Console: ${json.error?.message ?? `Fehler ${res.status}`}`);
  }
  return json;
}

/** Properties the service account may read (URL prefixes like https://example.com/ and domains like sc-domain:example.com). */
export async function listProperties(account: ServiceAccount, fresh = false) {
  const load = async () => {
    const json = await google<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(account, "/sites");
    return (json.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => s.siteUrl);
  };
  if (fresh) cache.delete(`props:${account.client_email}`);
  return cached(`props:${account.client_email}`, load);
}

/** The property that covers a live URL: the longest matching URL prefix, otherwise a domain property. */
export function matchProperty(properties: string[], liveUrl: string | null) {
  if (!liveUrl) return null;
  let url: URL;
  try {
    url = new URL(liveUrl);
  } catch {
    return null;
  }
  const href = url.origin + (url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`);
  const prefixes = properties.filter((p) => !p.startsWith("sc-domain:") && href.startsWith(p.endsWith("/") ? p : `${p}/`)).sort((a, b) => b.length - a.length);
  if (prefixes[0]) return prefixes[0];
  const host = url.hostname.toLowerCase();
  return properties.find((p) => p.startsWith("sc-domain:") && (host === p.slice(10) || host.endsWith(`.${p.slice(10)}`))) ?? null;
}

const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

/** The last 28 days with final data (up to yesterday) and the 28 days before. */
function ranges() {
  return { current: { start: day(28), end: day(1) }, previous: { start: day(56), end: day(29) } };
}

type Row = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };
const metrics = (r: Row): Metrics => ({ clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });

async function pageRows(account: ServiceAccount, property: string, range: { start: string; end: string }) {
  return cached(`pages:${property}:${range.start}:${range.end}`, async () => {
    const json = await google<{ rows?: Row[] }>(account, `/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      startDate: range.start,
      endDate: range.end,
      dimensions: ["page"],
      rowLimit: 5000,
    });
    return Object.fromEntries((json.rows ?? []).map((r) => [r.keys![0], metrics(r)])) as Record<string, Metrics>;
  });
}

/** Strips the trailing slash so /ueber-uns and /ueber-uns/ count as the same page. */
const pathKey = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

/** Metrics of a page from rows keyed by URL: all URLs of the site's host(s) whose path matches. */
function pickPage(rows: Record<string, Metrics>, liveUrl: string, path: string) {
  const live = new URL(liveUrl);
  const bareHost = live.hostname.replace(/^www\./, "");
  let best: { url: string; m: Metrics } | null = null;
  for (const [url, m] of Object.entries(rows)) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    if (u.hostname.replace(/^www\./, "") !== bareHost || pathKey(u.pathname) !== pathKey(path)) continue;
    if (!best || m.impressions > best.m.impressions) best = { url, m };
  }
  return best;
}

/** Search Console figures of one page: totals now and before, and its search queries. */
export async function pagePerformance(account: ServiceAccount, property: string, liveUrl: string, path: string): Promise<PagePerformance> {
  const { current, previous } = ranges();
  const [now, before] = await Promise.all([pageRows(account, property, current), pageRows(account, property, previous)]);
  const hit = pickPage(now, liveUrl, path);
  const earlier = pickPage(before, liveUrl, path);
  const url = hit?.url ?? earlier?.url ?? null;
  const queries = url
    ? await cached(`queries:${property}:${url}:${current.start}`, async () => {
        const json = await google<{ rows?: Row[] }>(account, `/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
          startDate: current.start,
          endDate: current.end,
          dimensions: ["query"],
          dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: url }] }],
          rowLimit: 25,
        });
        return (json.rows ?? []).map((r) => ({ query: r.keys![0], ...metrics(r) }));
      })
    : [];
  return { property, url, range: current, current: hit?.m ?? null, previous: earlier?.m ?? null, queries };
}

/** Position, clicks and impressions of every page of a site, keyed by path (without trailing slash). */
export async function sitePerformance(account: ServiceAccount, property: string, liveUrl: string) {
  const { current } = ranges();
  const rows = await pageRows(account, property, current);
  const bareHost = new URL(liveUrl).hostname.replace(/^www\./, "");
  const byPath: Record<string, Metrics> = {};
  for (const [url, m] of Object.entries(rows)) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    if (u.hostname.replace(/^www\./, "") !== bareHost) continue;
    const key = pathKey(u.pathname);
    if (!byPath[key] || m.impressions > byPath[key].impressions) byPath[key] = m;
  }
  return byPath;
}

/** Account and property of a site, or why there is none. */
export async function searchConsoleFor(liveUrl: string | null) {
  const account = await storedServiceAccount();
  if (!account) return { state: "off" as const };
  if (!liveUrl) return { state: "no-url" as const, email: account.client_email };
  const properties = await listProperties(account);
  const property = matchProperty(properties, liveUrl);
  if (!property) return { state: "no-property" as const, email: account.client_email };
  return { state: "ok" as const, account, property, liveUrl };
}

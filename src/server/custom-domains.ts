import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { db } from "@/db";
import { customers, type DomainStatus } from "@/db/schema";

/*
 * Customer domains (cms.kundendomain.de) via Cloudflare for SaaS.
 * The customer points a CNAME at KERN_CUSTOM_DOMAIN_TARGET; Cloudflare issues the certificate
 * and forwards to the fallback origin, so this server sees the customer's host name.
 * Without Cloudflare credentials a domain can still be saved; it then has to reach the server some other way.
 */

const API = "https://api.cloudflare.com/client/v4";

export function cloudflareConfigured() {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID);
}

/** Where customers point their CNAME, e.g. customers.kerncms.com. */
export function cnameTarget() {
  return process.env.KERN_CUSTOM_DOMAIN_TARGET || null;
}

export function appOrigin() {
  return process.env.KERN_PUBLIC_URL?.replace(/\/+$/, "") ?? null;
}

export function appHost() {
  const origin = appOrigin();
  if (!origin) return null;
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Accepts "https://cms.example.de/", "CMS.example.de" etc. and returns the bare host name. */
export function normalizeDomain(input: string) {
  let host = input.trim().toLowerCase();
  host = host.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  if (!host) return null;
  if (host.length > 253 || !/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(host)) {
    throw new Error("Bitte gib eine Domain wie cms.kundendomain.de ein.");
  }
  const own = appHost();
  // app.kerncms.com → nothing under kerncms.com; those names are ours, not a customer's.
  const parent = own && own.split(".").length > 2 ? own.split(".").slice(1).join(".") : null;
  if (own && (host === own || (parent && (host === parent || host.endsWith(`.${parent}`))))) {
    throw new Error("Das ist eine Adresse von kerncms selbst, keine Kundendomain.");
  }
  return host;
}

/* ---------- Cloudflare API ---------- */

type CfRecord = { name: string; value: string };

export type HostnameInfo = {
  status: DomainStatus;
  /** Cloudflare's own wording, for the details line. */
  hostnameStatus: string;
  sslStatus: string;
  /** Only needed when the CNAME alone does not verify, e.g. the customer proxies through Cloudflare themselves. */
  txtRecords: CfRecord[];
  errors: string[];
};

type CfHostname = {
  id: string;
  hostname: string;
  status: string;
  ssl?: {
    status?: string;
    validation_records?: { txt_name?: string; txt_value?: string }[];
    validation_errors?: { message: string }[];
  };
  ownership_verification?: { type?: string; name?: string; value?: string };
  verification_errors?: string[];
};

async function cf<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!cloudflareConfigured()) throw new Error("Cloudflare ist nicht eingerichtet (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID).");
  const res = await fetch(`${API}/zones/${process.env.CLOUDFLARE_ZONE_ID}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { code: number; message: string }[] } | null;
  if (!res.ok || !json?.success) {
    const message = json?.errors?.map((e) => e.message).join(", ") || `HTTP ${res.status}`;
    throw new Error(`Cloudflare: ${message}`);
  }
  return json.result as T;
}

function describe(h: CfHostname): HostnameInfo {
  const sslStatus = h.ssl?.status ?? "unknown";
  const active = h.status === "active" && sslStatus === "active";
  const failed = ["blocked", "moved", "deleted"].includes(h.status) || /timed_out|failed/.test(sslStatus);
  const txtRecords: CfRecord[] = [];
  if (h.status !== "active" && h.ownership_verification?.name && h.ownership_verification.value) {
    txtRecords.push({ name: h.ownership_verification.name, value: h.ownership_verification.value });
  }
  if (sslStatus !== "active") {
    for (const r of h.ssl?.validation_records ?? []) if (r.txt_name && r.txt_value) txtRecords.push({ name: r.txt_name, value: r.txt_value });
  }
  return {
    status: active ? "active" : failed ? "error" : "pending",
    hostnameStatus: h.status,
    sslStatus,
    txtRecords,
    errors: [...(h.verification_errors ?? []), ...(h.ssl?.validation_errors ?? []).map((e) => e.message)],
  };
}

export async function registerHostname(hostname: string) {
  // An earlier attempt may have left the hostname in Cloudflare; reuse it.
  const existing = await cf<CfHostname[]>("GET", `/custom_hostnames?hostname=${encodeURIComponent(hostname)}`);
  const row =
    existing.find((h) => h.hostname === hostname) ??
    (await cf<CfHostname>("POST", "/custom_hostnames", { hostname, ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } }));
  return { id: row.id, info: describe(row) };
}

export async function hostnameInfo(id: string) {
  return describe(await cf<CfHostname>("GET", `/custom_hostnames/${id}`));
}

export async function removeHostname(id: string) {
  try {
    await cf("DELETE", `/custom_hostnames/${id}`);
  } catch (error) {
    // Already gone in Cloudflare is fine.
    if (!/not found|1436|1551/i.test(String(error))) throw error;
  }
}

/* ---------- Request host ---------- */

export const requestHost = cache(async () => {
  const h = await headers();
  return (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().replace(/:\d+$/, "").toLowerCase();
});

/** The customer whose domain this request came in on, if any. */
export const hostCustomer = cache(async () => {
  const host = await requestHost();
  if (!host || host === appHost()) return null;
  const [row] = await db.select({ id: customers.id, name: customers.name, domain: customers.domain }).from(customers).where(eq(customers.domain, host)).limit(1);
  return row ?? null;
});

/** Base URL for links (invites, form notifications) to a customer's sites: their domain once it works, else the app. */
export async function cmsOrigin(customerId: string | null | undefined) {
  if (customerId) {
    const [row] = await db
      .select({ domain: customers.domain, status: customers.domainStatus })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (row?.domain && row.status === "active") {
      const local = /(^|\.)localhost$/.test(row.domain);
      const port = local ? new URL(appOrigin() ?? "http://localhost:3000").port || process.env.PORT || "3000" : "";
      return local ? `http://${row.domain}:${port}` : `https://${row.domain}`;
    }
  }
  const app = appOrigin();
  if (app) return app;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
}

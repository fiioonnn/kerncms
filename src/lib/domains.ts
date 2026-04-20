import { db } from "@/db";
import { customDomains, domainTransferTokens } from "@/db/schema";
import { eq, and, gt, lt } from "drizzle-orm";

const MAIN_DOMAIN = process.env.NEXT_PUBLIC_APP_URL ?? "";

export function getMainDomain(): string {
  return MAIN_DOMAIN;
}

export function getMainOrigin(): string {
  try {
    return new URL(MAIN_DOMAIN).origin;
  } catch {
    return MAIN_DOMAIN;
  }
}

export function isMainDomain(host: string): boolean {
  try {
    const mainHost = new URL(MAIN_DOMAIN).host;
    return host === mainHost;
  } catch {
    return true;
  }
}

export function getEnabledDomains(): { id: string; domain: string }[] {
  try {
    return db.select({ id: customDomains.id, domain: customDomains.domain })
      .from(customDomains)
      .where(eq(customDomains.enabled, true))
      .all();
  } catch {
    return [];
  }
}

export function isDomainRegistered(host: string): boolean {
  if (isMainDomain(host)) return true;
  const row = db.select({ id: customDomains.id })
    .from(customDomains)
    .where(and(eq(customDomains.domain, host), eq(customDomains.enabled, true)))
    .get();
  return !!row;
}

export function createTransferToken(sessionToken: string, targetDomain: string): string {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60_000);
  db.insert(domainTransferTokens)
    .values({ token, sessionToken, targetDomain, expiresAt })
    .run();
  return token;
}

export function redeemTransferToken(token: string, host: string): string | null {
  const row = db.select()
    .from(domainTransferTokens)
    .where(and(
      eq(domainTransferTokens.token, token),
      eq(domainTransferTokens.targetDomain, host),
      gt(domainTransferTokens.expiresAt, new Date()),
    ))
    .get();

  if (!row) return null;

  db.delete(domainTransferTokens)
    .where(eq(domainTransferTokens.token, token))
    .run();

  return row.sessionToken;
}

export function cleanExpiredTokens(): void {
  db.delete(domainTransferTokens)
    .where(lt(domainTransferTokens.expiresAt, new Date()))
    .run();
}

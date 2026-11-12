"use server";

import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { and, eq, gt, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { customers, githubApp, invites, memberships, sessions, sites, users, type Role } from "@/db/schema";
import { roleLabels } from "@/lib/kern-types";
import { run } from "../action";
import { hashToken, newToken, requireAdmin } from "../auth";
import { parseConfig } from "../config";
import { git, worktreeDir } from "../git";
import { fetchRemote, listBranches, listRepos, readRemoteConfig } from "../github";
import { sendDomainInstructions, sendInvite, type DnsRecordMail } from "../mail";
import { stopPreview } from "../preview";
import { cloudflareConfigured, cmsOrigin, cnameTarget, domainReachable, hostnameInfo, normalizeDomain, registerHostname, removeHostname } from "../custom-domains";
import { connectGithubSite, connectSite, inspectRepo } from "../sites";

function refresh() {
  revalidatePath("/", "layout");
}

const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/* ---------- Customers ---------- */

export type CustomerInput = { name: string; contactName: string; contactEmail: string; phone: string; notes: string; status?: "active" | "paused" | "archived" };

function cleanCustomer(input: CustomerInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Der Kunde braucht einen Namen.");
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (contactEmail && !validEmail(contactEmail)) throw new Error("Bitte gib eine gültige E-Mail-Adresse ein.");
  return {
    name,
    contactName: input.contactName.trim(),
    contactEmail,
    phone: input.phone.trim(),
    notes: input.notes.trim(),
    ...(input.status ? { status: input.status } : {}),
  };
}

export async function createCustomer(input: CustomerInput) {
  return run(async () => {
    await requireAdmin();
    const [row] = await db.insert(customers).values(cleanCustomer(input)).returning({ id: customers.id });
    refresh();
    return { id: row.id };
  });
}

export async function updateCustomer(id: string, input: CustomerInput) {
  return run(async () => {
    await requireAdmin();
    await db.update(customers).set(cleanCustomer(input)).where(eq(customers.id, id));
    refresh();
    return null;
  });
}

/** Deletes the customer record; its sites stay and become unassigned. */
export async function deleteCustomer(id: string) {
  return run(async () => {
    await requireAdmin();
    const [row] = await db.select({ hostnameId: customers.domainHostnameId }).from(customers).where(eq(customers.id, id));
    if (row?.hostnameId) await removeHostname(row.hostnameId);
    await db.delete(customers).where(eq(customers.id, id));
    refresh();
    return null;
  });
}

/* ---------- Customer domain ---------- */

/** Sets the customer's own CMS address and registers it with Cloudflare for SaaS when that is set up. */
export async function setCustomerDomain(id: string, input: string) {
  return run(async () => {
    await requireAdmin();
    const domain = normalizeDomain(input);
    if (!domain) throw new Error("Bitte gib eine Domain ein.");
    const [current] = await db.select().from(customers).where(eq(customers.id, id));
    if (!current) throw new Error("Unbekannter Kunde.");
    const [taken] = await db.select({ name: customers.name }).from(customers).where(and(eq(customers.domain, domain), ne(customers.id, id)));
    if (taken) throw new Error(`${domain} gehört schon zu ${taken.name}.`);
    if (current.domainHostnameId && current.domain !== domain) await removeHostname(current.domainHostnameId);
    let hostnameId: string | null = null;
    let status: "pending" | "active" | "error" = "active";
    if (cloudflareConfigured()) {
      const registered = await registerHostname(domain);
      hostnameId = registered.id;
      status = (await domainReachable(domain)) ? "active" : registered.info.status;
    }
    await db.update(customers).set({ domain, domainHostnameId: hostnameId, domainStatus: status }).where(eq(customers.id, id));
    refresh();
    return null;
  });
}

/** Asks Cloudflare whether DNS and certificate are ready and stores the result. A domain that already answers counts as active. */
export async function checkCustomerDomain(id: string) {
  return run(async () => {
    await requireAdmin();
    const [row] = await db.select().from(customers).where(eq(customers.id, id));
    if (!row?.domain) throw new Error("Der Kunde hat keine eigene Domain.");
    if (!row.domainHostnameId) return { status: row.domainStatus ?? "active" };
    const [info, reachable] = await Promise.all([hostnameInfo(row.domainHostnameId), domainReachable(row.domain)]);
    const status = reachable ? "active" : info.status;
    await db.update(customers).set({ domainStatus: status }).where(eq(customers.id, id));
    refresh();
    return { status };
  });
}

/** Mails the customer the DNS records their own CMS address needs. */
export async function mailDomainInstructions(id: string, input: { email: string }) {
  return run(async () => {
    await requireAdmin();
    const email = input.email.trim().toLowerCase();
    if (!validEmail(email)) throw new Error("Bitte gib eine gültige E-Mail-Adresse ein.");
    const [row] = await db.select().from(customers).where(eq(customers.id, id));
    if (!row?.domain) throw new Error("Der Kunde hat keine eigene Domain.");
    const target = cnameTarget();
    if (!target) throw new Error("KERN_CUSTOM_DOMAIN_TARGET ist nicht gesetzt, es gibt kein Ziel für den CNAME.");
    const records: DnsRecordMail[] = [{ type: "CNAME", name: row.domain, value: target, note: "Bei Cloudflare: Nur DNS (graue Wolke)" }];
    if (row.domainHostnameId) {
      const info = await hostnameInfo(row.domainHostnameId).catch(() => null);
      for (const r of info?.txtRecords ?? []) records.push({ type: "TXT", name: r.name, value: r.value, note: "Nur nötig, falls der CNAME allein nicht reicht." });
    }
    const greeting = row.contactName && email === row.contactEmail?.toLowerCase() ? `Hallo ${row.contactName},` : "Hallo,";
    try {
      await sendDomainInstructions(email, { greeting, domain: row.domain, records });
    } catch (error) {
      console.error("[kern] Mailversand fehlgeschlagen:", error);
      throw new Error("Die E-Mail konnte nicht verschickt werden.");
    }
    return null;
  });
}

export async function removeCustomerDomain(id: string) {
  return run(async () => {
    await requireAdmin();
    const [row] = await db.select().from(customers).where(eq(customers.id, id));
    if (row?.domainHostnameId) await removeHostname(row.domainHostnameId);
    await db.update(customers).set({ domain: null, domainHostnameId: null, domainStatus: null }).where(eq(customers.id, id));
    refresh();
    return null;
  });
}

export async function assignSiteCustomer(siteId: string, customerId: string | null) {
  return run(async () => {
    await requireAdmin();
    await db.update(sites).set({ customerId }).where(eq(sites.id, siteId));
    refresh();
    return null;
  });
}

/* ---------- Connecting sites ---------- */

export async function githubRepos(installationId: string) {
  return run(async () => {
    await requireAdmin();
    const [repos, connected] = await Promise.all([listRepos(installationId), db.select({ repo: sites.githubRepo }).from(sites)]);
    const taken = new Set(connected.map((c) => c.repo));
    return repos.map((r) => ({ ...r, connected: taken.has(r.fullName) }));
  });
}

export async function githubBranches(installationId: string, repo: string) {
  return run(async () => {
    await requireAdmin();
    return listBranches(installationId, repo);
  });
}

/** Checks kern.config.yaml before connecting, so the admin sees what the CMS will offer. */
export async function inspectGithubRepo(installationId: string, repo: string, branch: string) {
  return run(async () => {
    await requireAdmin();
    const config = parseConfig(await readRemoteConfig(installationId, repo, branch));
    return summarize(config);
  });
}

export async function inspectLocalRepo(folder: string) {
  return run(async () => {
    await requireAdmin();
    const { repoPath, branch, config } = await inspectRepo(folder);
    return { ...summarize(config), repoPath, branch };
  });
}

function summarize(config: ReturnType<typeof parseConfig>) {
  return {
    name: config.site.name,
    key: config.site.id,
    url: config.site.url,
    pages: config.pages.path,
    blocks: config.blocks.map((b) => b.label),
    collections: config.collections.map((c) => c.label),
    globals: config.globals.map((g) => g.label),
    forms: config.forms.map((f) => f.label),
  };
}

export async function connectGithubRepository(input: { installationId: string; repo: string; branch: string; customerId?: string | null }) {
  return run(async () => {
    await requireAdmin();
    const site = await connectGithubSite(input);
    refresh();
    return { id: site.id, name: site.name };
  });
}

export async function connectLocalRepository(input: { folder: string; customerId?: string | null }) {
  return run(async () => {
    const admin = await requireAdmin();
    const site = await connectSite(admin.id, input.folder, input.customerId);
    refresh();
    return { id: site.id, name: site.name };
  });
}

export async function syncSiteNow(siteId: string) {
  return run(async () => {
    await requireAdmin();
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
    if (!site) throw new Error("Unbekannte Website.");
    if (site.source !== "github") throw new Error("Nur GitHub-Websites werden abgeglichen.");
    await fetchRemote(site);
    refresh();
    return null;
  });
}

/** Removes a site from kerncms. The repository on GitHub or on disk is not touched, only the CMS's copy. */
export async function removeSite(siteId: string, confirmName: string) {
  return run(async () => {
    await requireAdmin();
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
    if (!site) throw new Error("Unbekannte Website.");
    if (confirmName.trim() !== site.name) throw new Error("Der Name stimmt nicht überein.");
    stopPreview(site.id);
    const dir = worktreeDir(site);
    if (site.source === "github") {
      await rm(path.dirname(dir), { recursive: true, force: true });
    } else if (existsSync(dir)) {
      await git(site.repoPath, ["worktree", "remove", "--force", dir]).catch(() => rm(dir, { recursive: true, force: true }));
    }
    await db.delete(sites).where(eq(sites.id, site.id));
    refresh();
    return null;
  });
}

/* ---------- People ---------- */

/** Invites someone to a site, e.g. the customer's contact as owner. Sends the link by mail and returns it. */
export async function inviteToSite(input: { siteId: string; email: string; role: Role }) {
  return run(async () => {
    const admin = await requireAdmin();
    const email = input.email.trim().toLowerCase();
    if (!validEmail(email)) throw new Error("Bitte gib eine gültige E-Mail-Adresse ein.");
    const [site] = await db.select().from(sites).where(eq(sites.id, input.siteId));
    if (!site) throw new Error("Unbekannte Website.");
    const [member] = await db
      .select()
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.siteId, site.id), eq(users.email, email)));
    if (member) throw new Error(`${email} hat schon Zugriff auf ${site.name}.`);
    await db.delete(invites).where(and(eq(invites.siteId, site.id), eq(invites.email, email)));
    const token = newToken();
    await db.insert(invites).values({
      id: hashToken(token),
      siteId: site.id,
      email,
      role: input.role,
      invitedBy: admin.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });
    const link = `${await cmsOrigin(site.customerId)}/invite/${token}`;
    let mailed = true;
    try {
      await sendInvite(email, site.name, admin.name, roleLabels[input.role], link);
    } catch {
      mailed = false;
    }
    refresh();
    return { link, mailed };
  });
}

export async function setUserAdmin(userId: string, isAdmin: boolean) {
  return run(async () => {
    const admin = await requireAdmin();
    if (userId === admin.id && !isAdmin) throw new Error("Du kannst dir die Admin-Rechte nicht selbst entziehen.");
    await db.update(users).set({ isAdmin }).where(eq(users.id, userId));
    refresh();
    return null;
  });
}

/** Blocks or unblocks sign-in; blocking also ends all sessions. */
export async function setUserDisabled(userId: string, disabled: boolean) {
  return run(async () => {
    const admin = await requireAdmin();
    if (userId === admin.id) throw new Error("Du kannst dich nicht selbst sperren.");
    await db.update(users).set({ disabled }).where(eq(users.id, userId));
    if (disabled) await db.delete(sessions).where(eq(sessions.userId, userId));
    refresh();
    return null;
  });
}

export async function setMembershipRole(siteId: string, userId: string, role: Role | null) {
  return run(async () => {
    await requireAdmin();
    if (role === null) await db.delete(memberships).where(and(eq(memberships.siteId, siteId), eq(memberships.userId, userId)));
    else {
      await db
        .insert(memberships)
        .values({ siteId, userId, role })
        .onConflictDoUpdate({ target: [memberships.siteId, memberships.userId], set: { role } });
    }
    refresh();
    return null;
  });
}

export async function deleteUser(userId: string) {
  return run(async () => {
    const admin = await requireAdmin();
    if (userId === admin.id) throw new Error("Du kannst dein eigenes Konto hier nicht löschen.");
    const [other] = await db.select({ id: users.id }).from(users).where(and(eq(users.isAdmin, true), ne(users.id, userId))).limit(1);
    if (!other) throw new Error("Es muss mindestens ein Admin übrig bleiben.");
    await db.delete(users).where(eq(users.id, userId));
    refresh();
    return null;
  });
}

/* ---------- GitHub App ---------- */

export async function disconnectGithubApp() {
  return run(async () => {
    await requireAdmin();
    const [inUse] = await db.select({ id: sites.id }).from(sites).where(eq(sites.source, "github")).limit(1);
    if (inUse) throw new Error("Es sind noch GitHub-Websites verbunden. Entferne sie zuerst.");
    await db.delete(githubApp);
    refresh();
    return null;
  });
}

export async function pendingInviteCount() {
  await requireAdmin();
  const rows = await db.select({ id: invites.id }).from(invites).where(gt(invites.expiresAt, new Date()));
  return rows.length;
}

"use server";

import { and, desc, eq, gt, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { invites, loginCodes, memberships, sessions, users } from "@/db/schema";
import { run } from "../action";
import { adminEmail, createSession, destroySession, getUser, hashToken, maySignUp, newLoginCode, requireUser, SESSION_COOKIE, userCount } from "../auth";
import { sendLoginCode } from "../mail";
import { clientIp, rateLimited } from "../public";
import { notify } from "../notifications";
import { revokeGrant } from "../oauth";
import { SITE_COOKIE } from "../sites";

function cleanEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Step 1 of signing in: mails a six-digit code.
 * kerncms is invite-only: unknown addresses get no code, except KERN_ADMIN_EMAIL
 * (or, in development without it, the very first person), whose account is created as admin.
 */
export async function requestLoginCode(input: { email: string; name?: string }) {
  return run(async () => {
    const email = cleanEmail(input.email);
    if (!validEmail(email)) throw new Error("Bitte gib eine gültige E-Mail-Adresse ein.");
    const ip = clientIp(new Request("http://x", { headers: await headers() }));
    if (rateLimited(`code:${email}`, 5, 15 * 60_000) || rateLimited(`code-ip:${ip}`, 20, 15 * 60_000)) {
      throw new Error("Zu viele Codes angefordert. Bitte warte ein paar Minuten.");
    }
    // Same rule as the login page: the form asks for a name only when the first account can be created.
    const firstRun = (await userCount()) === 0 && (!!adminEmail() || process.env.NODE_ENV !== "production");
    if (firstRun && !input.name?.trim()) throw new Error("Bitte gib deinen Namen ein.");
    const [user] = await db.select({ id: users.id, disabled: users.disabled }).from(users).where(eq(users.email, email)).limit(1);
    if (user?.disabled) return { firstRun };
    const signUp = !user && maySignUp(email, firstRun);
    // For unknown addresses we answer the same way, so nobody can probe which accounts exist.
    if (!user && !signUp) return { firstRun };
    const code = newLoginCode();
    await db.delete(loginCodes).where(eq(loginCodes.email, email));
    await db.insert(loginCodes).values({
      email,
      codeHash: hashToken(`${email}:${code}`),
      name: signUp ? input.name?.trim() || email.split("@")[0] : null,
      expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
    });
    try {
      await sendLoginCode(email, code);
    } catch (error) {
      console.error("[kern] Mailversand fehlgeschlagen:", error);
      throw new Error("Die E-Mail konnte nicht verschickt werden. Läuft der Mailserver?");
    }
    return { firstRun };
  });
}

/** Step 2: checks the code and signs in. */
export async function verifyLoginCode(input: { email: string; code: string; next?: string }) {
  const result = await run(async () => {
    const email = cleanEmail(input.email);
    const code = input.code.replace(/\D/g, "");
    const [row] = await db
      .select()
      .from(loginCodes)
      .where(and(eq(loginCodes.email, email), gt(loginCodes.expiresAt, new Date())))
      .orderBy(desc(loginCodes.createdAt))
      .limit(1);
    if (!row) throw new Error("Der Code stimmt nicht oder ist abgelaufen. Bitte fordere einen neuen an.");
    if (row.attempts >= MAX_ATTEMPTS) throw new Error("Zu viele Versuche. Bitte fordere einen neuen Code an.");
    if (row.codeHash !== hashToken(`${email}:${code}`)) {
      await db.update(loginCodes).set({ attempts: row.attempts + 1 }).where(eq(loginCodes.id, row.id));
      const left = MAX_ATTEMPTS - row.attempts - 1;
      throw new Error(left > 0 ? `Der Code stimmt nicht. Noch ${left} ${left === 1 ? "Versuch" : "Versuche"}.` : "Der Code stimmt nicht. Bitte fordere einen neuen an.");
    }
    await db.delete(loginCodes).where(eq(loginCodes.email, email));
    let [user] = await db.select({ id: users.id, isAdmin: users.isAdmin }).from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      if (!row.name || !maySignUp(email, (await userCount()) === 0)) throw new Error("Für diese E-Mail-Adresse gibt es kein Konto.");
      // KERN_ADMIN_EMAIL (or the very first account in development) runs the instance.
      [user] = await db.insert(users).values({ name: row.name, email, isAdmin: true }).returning({ id: users.id, isAdmin: users.isAdmin });
    } else if (!user.isAdmin && email === adminEmail()) {
      await db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id));
    }
    await createSession(user.id);
    return null;
  });
  if (result.ok) redirect(input.next?.startsWith("/") && !input.next.startsWith("//") ? input.next : "/");
  return result;
}

export async function acceptInvite(input: { token: string; name?: string }) {
  const result = await run(async () => {
    const [invite] = await db
      .select()
      .from(invites)
      .where(and(eq(invites.id, hashToken(input.token)), gt(invites.expiresAt, new Date())))
      .limit(1);
    if (!invite) throw new Error("Diese Einladung ist abgelaufen oder wurde zurückgezogen.");

    let userId = (await getUser())?.id;
    if (!userId) {
      const [existing] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1);
      if (existing) throw new Error("Für diese E-Mail-Adresse gibt es schon ein Konto. Bitte melde dich zuerst an.");
      if (!input.name?.trim()) throw new Error("Bitte gib deinen Namen ein.");
      // The invite link reached this mailbox, so it proves the address.
      const [user] = await db.insert(users).values({ name: input.name.trim(), email: invite.email }).returning();
      userId = user.id;
      await createSession(user.id);
    }
    await db
      .insert(memberships)
      .values({ siteId: invite.siteId, userId, role: invite.role })
      .onConflictDoUpdate({ target: [memberships.siteId, memberships.userId], set: { role: invite.role } });
    await db.delete(invites).where(eq(invites.id, invite.id));
    (await cookies()).set(SITE_COOKIE, invite.siteId, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 31_536_000 });
    const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    await notify(invite.siteId, null, "team", `${user?.name ?? invite.email} ist dem Team beigetreten`, "/team");
    return null;
  });
  if (result.ok) redirect("/");
  return result;
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function updateProfile(input: { name: string; email: string }) {
  return run(async () => {
    const user = await requireUser();
    const email = cleanEmail(input.email);
    if (!input.name.trim()) throw new Error("Bitte gib deinen Namen ein.");
    if (!validEmail(email)) throw new Error("Bitte gib eine gültige E-Mail-Adresse ein.");
    const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, user.id)));
    if (taken) throw new Error("Diese E-Mail-Adresse wird schon verwendet.");
    await db.update(users).set({ name: input.name.trim(), email }).where(eq(users.id, user.id));
    return null;
  });
}

export async function updatePreferences(preferences: Record<string, boolean>) {
  return run(async () => {
    const user = await requireUser();
    await db.update(users).set({ preferences: { ...user.preferences, ...preferences } }).where(eq(users.id, user.id));
    return null;
  });
}

/** Signs out every other browser. */
export async function revokeOtherSessions() {
  return run(async () => {
    const user = await requireUser();
    const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
    const removed = await db
      .delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, hashToken(token))))
      .returning({ id: sessions.id });
    return removed.length;
  });
}

/** Removes an app's access (MCP connector, OAuth). */
export async function disconnectApp(grantId: string) {
  return run(async () => {
    const user = await requireUser();
    await revokeGrant(user.id, grantId);
    return null;
  });
}

/** Deletes the own account. The user confirms by typing their email address. */
export async function deleteAccount(input: { confirmEmail: string }) {
  const result = await run(async () => {
    const session = await requireUser();
    const [user] = await db.select().from(users).where(eq(users.id, session.id));
    if (cleanEmail(input.confirmEmail) !== user.email) throw new Error("Die E-Mail-Adresse stimmt nicht.");
    const owned = await db.select().from(memberships).where(and(eq(memberships.userId, user.id), eq(memberships.role, "owner")));
    for (const m of owned) {
      const owners = await db.select().from(memberships).where(and(eq(memberships.siteId, m.siteId), eq(memberships.role, "owner")));
      if (owners.length === 1) throw new Error("Du bist einziger Inhaber einer Website. Übertrage sie zuerst an jemand anderen.");
    }
    await db.delete(users).where(eq(users.id, user.id));
    (await cookies()).delete(SESSION_COOKIE);
    return null;
  });
  if (result.ok) redirect("/login");
  return result;
}

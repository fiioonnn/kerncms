"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { invites, memberships, users, type Role } from "@/db/schema";
import { run } from "../action";
import { roleLabels } from "@/lib/kern-types";
import { hashToken, newToken } from "../auth";
import { cmsOrigin } from "../custom-domains";
import { sendInvite } from "../mail";
import { hasRole, requireRole } from "../sites";

const ROLES: Role[] = ["owner", "admin", "editor", "viewer"];

/** Creates an invite and returns the link. There is no mail server; the link is shared by hand. */
export async function inviteMember(input: { email: string; role: Role }) {
  return run(async () => {
    const ctx = await requireRole("admin");
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Bitte gib eine gültige E-Mail-Adresse ein.");
    if (!ROLES.includes(input.role)) throw new Error("Unbekannte Rolle.");
    if (input.role === "owner" && ctx.role !== "owner") throw new Error("Nur Inhaber können Inhaber einladen.");
    const [member] = await db
      .select()
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.siteId, ctx.site.id), eq(users.email, email)));
    if (member) throw new Error(`${email} ist schon im Team.`);
    await db.delete(invites).where(and(eq(invites.siteId, ctx.site.id), eq(invites.email, email)));
    const token = newToken();
    await db.insert(invites).values({
      id: hashToken(token),
      siteId: ctx.site.id,
      email,
      role: input.role,
      invitedBy: ctx.user.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });
    const link = `${await cmsOrigin(ctx.site.customerId)}/invite/${token}`;
    let mailed = true;
    try {
      await sendInvite(email, ctx.site.name, ctx.user.name, roleLabels[input.role], link);
    } catch (error) {
      console.error("[kern] Einladung konnte nicht verschickt werden:", error);
      mailed = false;
    }
    revalidatePath("/team");
    return { link, mailed };
  });
}

export async function revokeInvite(id: string) {
  return run(async () => {
    const ctx = await requireRole("admin");
    await db.delete(invites).where(and(eq(invites.id, id), eq(invites.siteId, ctx.site.id)));
    revalidatePath("/team");
    return null;
  });
}

async function ownerCount(siteId: string) {
  return (await db.select().from(memberships).where(and(eq(memberships.siteId, siteId), eq(memberships.role, "owner")))).length;
}

export async function changeRole(userId: string, role: Role) {
  return run(async () => {
    const ctx = await requireRole("admin");
    if (!ROLES.includes(role)) throw new Error("Unbekannte Rolle.");
    const [member] = await db.select().from(memberships).where(and(eq(memberships.siteId, ctx.site.id), eq(memberships.userId, userId)));
    if (!member) throw new Error("Diese Person ist nicht im Team.");
    if ((role === "owner" || member.role === "owner") && !hasRole(ctx.role, "owner")) throw new Error("Nur Inhaber können Inhaber ändern.");
    if (member.role === "owner" && role !== "owner" && (await ownerCount(ctx.site.id)) === 1) {
      throw new Error("Die Website braucht mindestens einen Inhaber.");
    }
    await db.update(memberships).set({ role }).where(and(eq(memberships.siteId, ctx.site.id), eq(memberships.userId, userId)));
    revalidatePath("/team");
    return null;
  });
}

export async function removeMember(userId: string) {
  return run(async () => {
    const ctx = await requireRole("admin");
    if (userId === ctx.user.id) throw new Error("Du kannst dich nicht selbst entfernen.");
    const [member] = await db.select().from(memberships).where(and(eq(memberships.siteId, ctx.site.id), eq(memberships.userId, userId)));
    if (!member) throw new Error("Diese Person ist nicht im Team.");
    if (member.role === "owner" && !hasRole(ctx.role, "owner")) throw new Error("Nur Inhaber können Inhaber entfernen.");
    await db.delete(memberships).where(and(eq(memberships.siteId, ctx.site.id), eq(memberships.userId, userId)));
    revalidatePath("/team");
    return null;
  });
}

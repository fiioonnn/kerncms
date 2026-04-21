import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { projectMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export function isAdminRole(role: string | undefined | null): boolean {
  return role === "admin" || role === "superadmin";
}

export function isSuperAdminRole(role: string | undefined | null): boolean {
  return role === "superadmin";
}

export async function getSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}

export async function getMemberRole(projectId: string, userId: string) {
  const member = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .get();
  return member?.role ?? null;
}

export async function requireRole(projectId: string, userId: string, allowedRoles: string[]) {
  const session = await getSession();
  if (session && isAdminRole(session.user.role)) {
    return "admin";
  }

  const role = await getMemberRole(projectId, userId);
  if (!role || !allowedRoles.includes(role)) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return role;
}

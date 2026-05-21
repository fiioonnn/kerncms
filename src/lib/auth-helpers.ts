import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { projectMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export class HttpError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : "HTTP Error");
    this.status = status;
    this.body = body;
  }
}

export function withApi<T extends (...args: any[]) => Promise<Response>>(handler: T): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json(error.body, { status: error.status });
      }
      throw error;
    }
  }) as T;
}

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
    throw new HttpError(401, { error: "Unauthorized" });
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
    throw new HttpError(403, { error: "Forbidden" });
  }
  return role;
}

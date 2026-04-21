import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { systemConfig, invitations, projectMembers, user, session as sessionTable, account } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { createTransferToken, isDomainRegistered } from "@/lib/domains";

function getRequestOrigin(request: NextRequest): string {
  const h = request.headers;
  const proto = h.get("x-forwarded-proto") ?? (request.url.startsWith("https") ? "https" : "http");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${proto}://${host}`;
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl;
  return new URL(request.url).origin;
}

function appUrl(path: string, request: NextRequest) {
  return new URL(path, getRequestOrigin(request));
}

const SESSION_COOKIE = process.env.BETTER_AUTH_URL?.startsWith("https")
  ? "__Secure-better-auth.session_token"
  : "better-auth.session_token";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.redirect(appUrl("/auth", request));
  }

  const userId = session.user.id;
  const userEmail = session.user.email;
  const cookies = request.cookies;

  // ── Check if setup is complete ──
  const setupRow = db.select().from(systemConfig).where(eq(systemConfig.key, "setup_complete")).get();
  if (setupRow?.value !== "true") {
    return NextResponse.redirect(appUrl("/setup", request));
  }

  // ── Block uninvited users ──
  const dbUser = db.select({ role: user.role }).from(user).where(eq(user.id, userId)).get();
  const isPrivileged = dbUser?.role === "superadmin" || dbUser?.role === "admin";

  if (!isPrivileged) {
    const hasInvite = db.select({ id: invitations.id }).from(invitations)
      .where(eq(invitations.email, userEmail)).get();
    const hasMembership = db.select({ projectId: projectMembers.projectId }).from(projectMembers)
      .where(eq(projectMembers.userId, userId)).get();

    if (!hasInvite && !hasMembership) {
      db.delete(sessionTable).where(eq(sessionTable.userId, userId)).run();
      db.delete(account).where(eq(account.userId, userId)).run();
      db.delete(user).where(eq(user.id, userId)).run();
      const response = NextResponse.redirect(appUrl("/auth?error=not_invited", request));
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
  }

  // ── Handle invite redemption ──
  const inviteToken = cookies.get("invite_token")?.value;
  if (inviteToken) {
    const invite = db
      .select()
      .from(invitations)
      .where(eq(invitations.token, inviteToken))
      .get();

    if (invite && new Date(invite.expiresAt) > new Date()) {
      const existing = db
        .select()
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, invite.projectId), eq(projectMembers.userId, userId)))
        .get();

      if (!existing) {
        db.insert(projectMembers)
          .values({
            projectId: invite.projectId,
            userId,
            role: invite.role,
          })
          .run();
      }

      if (invite.systemRole === "admin" || invite.systemRole === "member") {
        db.update(user)
          .set({ role: invite.systemRole as "admin" | "member" })
          .where(eq(user.id, userId))
          .run();
      }

      db.delete(invitations).where(eq(invitations.id, invite.id)).run();
    }

    const returnDomain = cookies.get("return_domain")?.value;
    if (returnDomain && isDomainRegistered(returnDomain)) {
      const sessionToken = cookies.get(SESSION_COOKIE)?.value;
      if (sessionToken) {
        const transferToken = createTransferToken(sessionToken, returnDomain);
        const targetUrl = new URL(`/api/auth/domain-transfer`, `https://${returnDomain}`);
        targetUrl.searchParams.set("token", transferToken);
        const response = NextResponse.redirect(targetUrl);
        response.cookies.delete("invite_token");
        response.cookies.delete("return_domain");
        return response;
      }
    }

    const response = NextResponse.redirect(appUrl("/", request));
    response.cookies.delete("invite_token");
    return response;
  }

  // ── Default redirect ──
  const returnDomain = cookies.get("return_domain")?.value;
  if (returnDomain && isDomainRegistered(returnDomain)) {
    const sessionToken = cookies.get(SESSION_COOKIE)?.value;
    if (sessionToken) {
      const transferToken = createTransferToken(sessionToken, returnDomain);
      const targetUrl = new URL(`/api/auth/domain-transfer`, `https://${returnDomain}`);
      targetUrl.searchParams.set("token", transferToken);
      const response = NextResponse.redirect(targetUrl);
      response.cookies.delete("return_domain");
      return response;
    }
  }

  return NextResponse.redirect(appUrl("/", request));
}

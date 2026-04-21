import { NextResponse } from "next/server";
import { db } from "@/db";
import { user, invitations, projects } from "@/db/schema";
import { eq, gt, notInArray } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { getResendClient, getResendFromAddress } from "@/lib/resend";
import InviteAppEmail from "@/emails/invite-app";

export async function GET() {
  const session = await requireSession();
  const currentRole = (session.user as { role?: string }).role;
  if (currentRole !== "admin" && currentRole !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existingEmails = db.select({ email: user.email }).from(user).all().map((u) => u.email);

  const pending = db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.systemRole,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(gt(invitations.expiresAt, new Date()))
    .all()
    .filter((inv) => inv.role && !existingEmails.includes(inv.email));

  const seen = new Set<string>();
  const unique = pending.filter((inv) => {
    if (seen.has(inv.email)) return false;
    seen.add(inv.email);
    return true;
  });

  return NextResponse.json(unique);
}

export async function POST(request: Request) {
  const session = await requireSession();
  const currentRole = (session.user as { role?: string }).role;
  if (currentRole !== "admin" && currentRole !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resend = getResendClient();
  if (!resend) {
    return NextResponse.json({ error: "Email not configured. Set up Resend in Settings > Integrations." }, { status: 503 });
  }

  const { email, role: appRole = "member" } = await request.json();
  const validRoles = ["admin", "member"];
  const systemRole = validRoles.includes(appRole) ? appRole : "member";

  const existing = db.select({ id: user.id }).from(user).where(eq(user.email, email)).get();
  if (existing) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  // Create an invitation record in the first project so the callback-handler allows sign-up
  const firstProject = db.select({ id: projects.id }).from(projects).limit(1).get();
  let inviteToken: string | undefined;
  if (firstProject) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    try {
      const [invite] = db.insert(invitations).values({
        projectId: firstProject.id,
        email,
        role: "viewer",
        systemRole,
        invitedBy: session.user.id,
        expiresAt,
      }).returning().all();
      inviteToken = invite.token;
    } catch { /* unique constraint — invitation already exists */ }
  }

  const signupUrl = inviteToken
    ? `${process.env.NEXT_PUBLIC_APP_URL}/auth?invite=${inviteToken}`
    : `${process.env.NEXT_PUBLIC_APP_URL}/auth`;

  const { error } = await resend.emails.send({
    from: getResendFromAddress(),
    to: email,
    subject: `You've been invited to kerncms`,
    react: InviteAppEmail({
      inviterName: session.user.name,
      inviteUrl: signupUrl,
    }),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";
import { db } from "@/db";
import { invitations, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole } from "@/lib/auth-helpers";
import InviteEmail from "@/emails/invite";
import { getResendClient, getResendFromAddress } from "@/lib/resend";

export async function POST(request: Request) {
  const session = await requireSession();
  const { projectId, email, role } = await request.json();

  await requireRole(projectId, session.user.id, ["admin"]);

  const resend = getResendClient();
  if (!resend) {
    return NextResponse.json({ error: "Email not configured. Ask an admin to set up Resend in Integrations." }, { status: 503 });
  }

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  let invite;
  try {
    [invite] = db.insert(invitations).values({
      projectId,
      email,
      role,
      invitedBy: session.user.id,
      expiresAt,
    }).returning().all();
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return NextResponse.json({ error: "Invitation already sent to this email" }, { status: 409 });
    }
    throw e;
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth?invite=${invite.token}`;

  const { error } = await resend.emails.send({
    from: getResendFromAddress(),
    to: email,
    subject: `You've been invited to ${project.name}`,
    react: InviteEmail({
      projectName: project.name,
      inviterName: session.user.name,
      role: role.charAt(0).toUpperCase() + role.slice(1),
      inviteUrl,
    }),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: invite.id });
}

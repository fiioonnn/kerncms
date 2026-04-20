import { NextResponse } from "next/server";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { getResendClient, getResendFromAddress } from "@/lib/resend";

export async function POST(request: Request) {
  const session = await requireSession();
  const currentUser = db.select({ role: user.role }).from(user).where(eq(user.id, session.user.id)).get();
  if (currentUser?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resend = getResendClient();
  if (!resend) {
    return NextResponse.json({ error: "Email not configured. Set up Resend in Settings > Integrations." }, { status: 503 });
  }

  const { email } = await request.json();

  const existing = db.select({ id: user.id }).from(user).where(eq(user.email, email)).get();
  if (existing) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const signupUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth`;

  const { error } = await resend.emails.send({
    from: getResendFromAddress(),
    to: email,
    subject: `You've been invited to kern CMS`,
    html: `
      <div style="font-family: -apple-system, sans-serif; background: #0a0a0a; padding: 40px 20px;">
        <div style="max-width: 460px; margin: 0 auto; background: #141414; border-radius: 12px; border: 1px solid #262626; overflow: hidden;">
          <div style="padding: 32px;">
            <h1 style="font-size: 20px; font-weight: 600; color: #fafafa; margin: 0 0 8px;">You've been invited</h1>
            <p style="font-size: 14px; color: #a1a1aa; margin: 0 0 24px; line-height: 1.6;">
              ${session.user.name} invited you to join kern CMS. Sign in to get started.
            </p>
            <a href="${signupUrl}" style="display: block; text-align: center; background: #fafafa; color: #0a0a0a; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
              Sign In
            </a>
          </div>
        </div>
      </div>
    `,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

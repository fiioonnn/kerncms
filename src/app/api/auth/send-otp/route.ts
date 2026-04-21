import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getResendClient, getResendFromAddress } from "@/lib/resend";
import OTPEmail from "@/emails/otp";

export async function POST(request: Request) {
  const { email, type } = await request.json();
  if (!email || !type) {
    return NextResponse.json({ error: "Missing email or type" }, { status: 400 });
  }

  const otp = await auth.api.createVerificationOTP({
    body: { email, type },
    headers: request.headers,
  });

  const resend = getResendClient();
  if (!resend) {
    console.log(`[OTP] No Resend client configured. ${type} code for ${email}: ${otp}`);
    return NextResponse.json({ error: "Email service not configured. Check server logs for OTP." }, { status: 503 });
  }

  const from = getResendFromAddress();
  console.log(`[OTP] Sending to=${email} from=${from}`);

  const { data, error } = await resend.emails.send({
    from,
    to: email,
    subject: `Your login code: ${otp}`,
    react: OTPEmail({ otp, email }),
  });

  if (error) {
    console.error("[OTP] Resend error:", JSON.stringify(error));
    return NextResponse.json({ error: "Failed to send email. Please check your Resend configuration." }, { status: 500 });
  }

  console.log(`[OTP] Sent successfully, id=${data?.id}`);

  return NextResponse.json({ success: true });
}

import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

const transport = ((globalThis as { __kernMail?: Transporter }).__kernMail ??= nodemailer.createTransport(
  process.env.SMTP_URL ?? "smtp://localhost:1025",
));

const FROM = process.env.MAIL_FROM ?? "kerncms <cms@kerncms.local>";

function layout(title: string, body: string) {
  return `<!doctype html><html lang="de"><body style="margin:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:480px;margin:0 auto;padding:40px 24px">
<div style="font-size:20px;font-weight:700;margin-bottom:24px">kerncms</div>
<div style="background:#fff;border:1px solid #e7e7e3;border-radius:16px;padding:32px">
<h1 style="font-size:22px;margin:0 0 12px">${title}</h1>${body}</div>
<p style="font-size:13px;color:#6b6b72;margin-top:20px">Du hast diese Mail nicht angefordert? Dann kannst du sie ignorieren.</p>
</div></body></html>`;
}

export async function sendLoginCode(email: string, code: string) {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  if (process.env.NODE_ENV !== "production") console.info(`[kern] Anmeldecode für ${email}: ${code}`);
  await transport.sendMail({
    from: FROM,
    to: email,
    subject: `${spaced} ist dein Anmeldecode für kerncms`,
    text: `Dein Anmeldecode: ${spaced}\n\nDer Code ist 10 Minuten gültig.`,
    html: layout(
      "Dein Anmeldecode",
      `<p style="font-size:15px;color:#6b6b72;margin:0 0 20px">Gib diesen Code im Anmeldefenster ein. Er ist 10 Minuten gültig.</p>
<div style="font-size:34px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,Menlo,monospace;background:#f6f6f4;border-radius:12px;padding:16px;text-align:center">${spaced}</div>`,
    ),
  });
}

export async function sendInvite(email: string, siteName: string, inviter: string, role: string, link: string) {
  await transport.sendMail({
    from: FROM,
    to: email,
    subject: `${inviter} lädt dich zu ${siteName} ein`,
    text: `${inviter} lädt dich als ${role} zu ${siteName} ein.\n\nEinladung annehmen: ${link}\n\nDer Link ist 7 Tage gültig.`,
    html: layout(
      `Einladung zu ${siteName}`,
      `<p style="font-size:15px;color:#6b6b72;margin:0 0 24px">${inviter} lädt dich als ${role} ein, die Website mit kerncms zu bearbeiten.</p>
<a href="${link}" style="display:inline-block;background:#2f5bea;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">Einladung annehmen</a>
<p style="font-size:13px;color:#6b6b72;margin:20px 0 0">Der Link ist 7 Tage gültig.</p>`,
    ),
  });
}

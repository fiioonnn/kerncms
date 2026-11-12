import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export const defaultTransport = ((globalThis as { __kernMail?: Transporter }).__kernMail ??= nodemailer.createTransport(
  process.env.SMTP_URL ?? "smtp://localhost:1025",
));

export const DEFAULT_FROM = process.env.MAIL_FROM ?? "kerncms <cms@kerncms.local>";

export function mailLayout(title: string, body: string, opts: { brand?: string; footer?: string | null } = {}) {
  const brand = (opts.brand ?? "kerncms").replace(/[<>&]/g, "");
  const footer = opts.footer === undefined ? "Du hast diese Mail nicht angefordert? Dann kannst du sie ignorieren." : opts.footer;
  return `<!doctype html><html lang="de"><body style="margin:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:480px;margin:0 auto;padding:40px 24px">
<div style="font-size:20px;font-weight:700;margin-bottom:24px">${brand}</div>
<div style="background:#fff;border:1px solid #e7e7e3;border-radius:16px;padding:32px">
<h1 style="font-size:22px;margin:0 0 12px">${title}</h1>${body}</div>
${footer ? `<p style="font-size:13px;color:#6b6b72;margin-top:20px">${footer}</p>` : ""}
</div></body></html>`;
}

export async function sendLoginCode(email: string, code: string) {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  if (process.env.NODE_ENV !== "production") console.info(`[kern] Anmeldecode für ${email}: ${code}`);
  await defaultTransport.sendMail({
    from: DEFAULT_FROM,
    to: email,
    subject: `${spaced} ist dein Anmeldecode für kerncms`,
    text: `Dein Anmeldecode: ${spaced}\n\nDer Code ist 10 Minuten gültig.`,
    html: mailLayout(
      "Dein Anmeldecode",
      `<p style="font-size:15px;color:#6b6b72;margin:0 0 20px">Gib diesen Code im Anmeldefenster ein. Er ist 10 Minuten gültig.</p>
<div style="font-size:34px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,Menlo,monospace;background:#f6f6f4;border-radius:12px;padding:16px;text-align:center">${spaced}</div>`,
    ),
  });
}

export async function sendInvite(email: string, siteName: string, inviter: string, role: string, link: string) {
  await defaultTransport.sendMail({
    from: DEFAULT_FROM,
    to: email,
    subject: `${inviter} lädt dich zu ${siteName} ein`,
    text: `${inviter} lädt dich als ${role} zu ${siteName} ein.\n\nEinladung annehmen: ${link}\n\nDer Link ist 7 Tage gültig.`,
    html: mailLayout(
      `Einladung zu ${siteName}`,
      `<p style="font-size:15px;color:#6b6b72;margin:0 0 24px">${inviter} lädt dich als ${role} ein, die Website mit kerncms zu bearbeiten.</p>
<a href="${link}" style="display:inline-block;background:#2f5bea;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">Einladung annehmen</a>
<p style="font-size:13px;color:#6b6b72;margin:20px 0 0">Der Link ist 7 Tage gültig.</p>`,
    ),
  });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type DnsRecordMail = { type: string; name: string; value: string; note?: string };

/** Tells a customer which DNS records their own CMS address needs. */
export async function sendDomainInstructions(to: string, opts: { greeting: string; domain: string; records: DnsRecordMail[] }) {
  const { domain, records } = opts;
  const text = [
    `${opts.greeting}`,
    "",
    `damit du das CMS unter ${domain} öffnen kannst, lege bitte bei deinem Domain-Anbieter diesen DNS-Eintrag an:`,
    "",
    ...records.flatMap((r) => [`Typ:  ${r.type}`, `Name: ${r.name}`, `Ziel: ${r.value}`, ...(r.note ? [`Hinweis: ${r.note}`] : []), ""]),
    "Liegt deine Domain bei Cloudflare, stell den Eintrag auf „Nur DNS“ (graue Wolke).",
    `Sobald der Eintrag aktiv ist, meist nach wenigen Minuten, erreichst du das CMS unter https://${domain}.`,
  ].join("\n");
  const cell = "padding:8px 0;vertical-align:top;font-size:14px";
  const label = `${cell};color:#6b6b72;width:56px`;
  const mono = `${cell};font-family:ui-monospace,Menlo,monospace;word-break:break-all`;
  const blocks = records
    .map(
      (r) => `<div style="background:#f6f6f4;border-radius:12px;padding:12px 16px;margin:0 0 12px">
<table style="width:100%;border-collapse:collapse">
<tr><td style="${label}">Typ</td><td style="${mono};font-weight:700">${esc(r.type)}</td></tr>
<tr><td style="${label}">Name</td><td style="${mono}">${esc(r.name)}</td></tr>
<tr><td style="${label}">Ziel</td><td style="${mono}">${esc(r.value)}</td></tr>
${r.note ? `<tr><td style="${label}">Hinweis</td><td style="${cell}">${esc(r.note)}</td></tr>` : ""}
</table></div>`,
    )
    .join("");
  await defaultTransport.sendMail({
    from: DEFAULT_FROM,
    to,
    subject: `DNS-Eintrag für ${domain}`,
    text,
    html: mailLayout(
      `Dein CMS unter ${esc(domain)}`,
      `<p style="font-size:15px;color:#6b6b72;margin:0 0 20px">${esc(opts.greeting)}<br>damit du das CMS unter deiner eigenen Adresse öffnen kannst, lege bitte bei deinem Domain-Anbieter ${records.length === 1 ? "diesen DNS-Eintrag" : "diese DNS-Einträge"} an:</p>
${blocks}
<p style="font-size:14px;color:#6b6b72;margin:8px 0 0">Liegt deine Domain bei Cloudflare, stell den Eintrag auf <strong>„Nur DNS“</strong> (graue Wolke). Sobald er aktiv ist, meist nach wenigen Minuten, erreichst du das CMS unter <a href="https://${esc(domain)}" style="color:#2f5bea">${esc(domain)}</a>.</p>`,
      { footer: "Fragen dazu? Antworte einfach auf diese Mail." },
    ),
  });
}

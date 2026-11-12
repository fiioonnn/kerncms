import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export const defaultTransport = ((globalThis as { __kernMail?: Transporter }).__kernMail ??= nodemailer.createTransport(
  process.env.SMTP_URL ?? "smtp://localhost:1025",
));

export const DEFAULT_FROM = process.env.MAIL_FROM ?? "kerncms <cms@kerncms.local>";

/* ---------- Layout ----------
 * Mail clients ignore most CSS: tables for layout, inline styles, no flex or grid, PNG instead of SVG.
 */

const C = { page: "#f4f4f5", card: "#ffffff", line: "#e4e4e7", ink: "#09090b", text: "#3f3f46", muted: "#71717a", faint: "#a1a1aa", soft: "#f4f4f5", accent: "#2f5bea" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Absolute URL of the logo PNG; mail clients need a public address, so none without KERN_PUBLIC_URL. */
function logoUrl() {
  const base = process.env.KERN_PUBLIC_URL?.replace(/\/+$/, "");
  return base ? `${base}/kern-icon-512.png` : null;
}

function brandMark(size: number) {
  const url = logoUrl();
  return url ? `<img src="${url}" width="${size}" height="${size}" alt="" style="display:block;border:0;border-radius:${Math.round(size / 4)}px">` : "";
}

/** A paragraph in the card. `html` must already be escaped. */
export function mailText(html: string, opts: { muted?: boolean; small?: boolean; top?: number } = {}) {
  const size = opts.small ? 13 : 15;
  return `<p style="margin:${opts.top ?? 16}px 0 0;font:${size}px/1.6 ${FONT};color:${opts.muted ? C.muted : C.text}">${html}</p>`;
}

/** A button that also works in Outlook (table cell with background). */
export function mailButton(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0"><tr>
<td bgcolor="${C.accent}" style="border-radius:10px">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;font:600 15px/1.2 ${FONT};color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/** Label/value pairs, stacked so long values never break the layout. Values are escaped; `mono` sets them in a code font. */
export function mailFields(rows: { label: string; value: string; mono?: boolean }[], opts: { boxed?: boolean } = {}) {
  const cells = rows
    .map(
      (r, i) => `<tr><td style="padding:${i === 0 ? 0 : 14}px 0 ${i === rows.length - 1 ? 0 : 14}px;${i === rows.length - 1 ? "" : `border-bottom:1px solid ${opts.boxed ? "#e4e4e7" : C.line};`}">
<div style="font:600 12px/1.4 ${FONT};color:${C.muted};text-transform:uppercase;letter-spacing:.04em">${escapeHtml(r.label)}</div>
<div style="margin-top:4px;font:${r.mono ? `14px/1.5 ${MONO}` : `15px/1.55 ${FONT}`};color:${C.ink};white-space:pre-wrap;word-break:break-word">${escapeHtml(r.value)}</div>
</td></tr>`,
    )
    .join("");
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table>`;
  return opts.boxed
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0"><tr><td bgcolor="${C.soft}" style="padding:18px 20px;border-radius:12px">${table}</td></tr></table>`
    : `<div style="margin:24px 0 0;padding:20px 0 0;border-top:1px solid ${C.line}">${table}</div>`;
}

/**
 * The frame of every mail: logo and name on top, a white card, a quiet footer.
 * `title` and `body` must already be escaped. `brand` names a customer's site instead of kerncms (form notifications).
 */
export function mailLayout(title: string, body: string, opts: { brand?: string; footer?: string | null; preheader?: string } = {}) {
  const footer = opts.footer === undefined ? "Du hast diese Mail nicht angefordert? Dann kannst du sie ignorieren." : opts.footer;
  const site = opts.brand ? escapeHtml(opts.brand) : null;
  const header = site
    ? `<td style="font:700 18px/1.2 ${FONT};color:${C.ink}">${site}</td>`
    : `${logoUrl() ? `<td width="40" style="padding-right:10px">${brandMark(30)}</td>` : ""}<td style="font:700 20px/1 ${FONT};color:${C.ink};letter-spacing:-.02em">kerncms</td>`;
  const sentWith = site
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 10px"><tr>${logoUrl() ? `<td style="padding-right:6px">${brandMark(16)}</td>` : ""}<td style="font:12px/1 ${FONT};color:${C.faint}">Gesendet mit kerncms</td></tr></table>`
    : "";
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${title}</title>
<style>@media (max-width:600px){.card{padding:28px 22px!important}.outer{padding:24px 12px!important}}</style></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}"><tr><td class="outer" align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="padding:0 4px 20px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${header}</tr></table></td></tr>
<tr><td class="card" bgcolor="${C.card}" style="padding:36px 40px;border:1px solid ${C.line};border-radius:16px">
<h1 style="margin:0;font:600 22px/1.3 ${FONT};color:${C.ink};letter-spacing:-.01em">${title}</h1>
${body}
</td></tr>
<tr><td align="center" style="padding:24px 16px 0">${sentWith}${footer ? `<div style="font:12px/1.6 ${FONT};color:${C.faint}">${footer}</div>` : ""}</td></tr>
</table></td></tr></table></body></html>`;
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
      `${mailText("Gib diesen Code im Anmeldefenster ein. Er ist 10 Minuten gültig.", { top: 10 })}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0"><tr>
<td align="center" bgcolor="${C.soft}" style="padding:22px 16px;border-radius:12px;font:700 34px/1 ${MONO};letter-spacing:.18em;color:${C.ink}">${spaced}</td>
</tr></table>`,
      { preheader: `Dein Code: ${spaced}` },
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
      `Einladung zu ${escapeHtml(siteName)}`,
      `${mailText(`<strong style="color:${C.ink}">${escapeHtml(inviter)}</strong> lädt dich als ${escapeHtml(role)} ein, die Website <strong style="color:${C.ink}">${escapeHtml(siteName)}</strong> mit kerncms zu bearbeiten.`, { top: 10 })}
${mailButton(link, "Einladung annehmen")}
${mailText("Der Link ist 7 Tage gültig. Du brauchst kein Passwort: Zum Anmelden bekommst du jedes Mal einen Code per Mail.", { muted: true, small: true, top: 24 })}`,
      { preheader: `${inviter} lädt dich als ${role} zu ${siteName} ein.` },
    ),
  });
}

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
  const blocks = records
    .map((r) =>
      mailFields(
        [
          { label: "Typ", value: r.type, mono: true },
          { label: "Name", value: r.name, mono: true },
          { label: "Ziel", value: r.value, mono: true },
          ...(r.note ? [{ label: "Hinweis", value: r.note }] : []),
        ],
        { boxed: true },
      ),
    )
    .join("");
  await defaultTransport.sendMail({
    from: DEFAULT_FROM,
    to,
    subject: `DNS-Eintrag für ${domain}`,
    text,
    html: mailLayout(
      `Dein CMS unter ${escapeHtml(domain)}`,
      `${mailText(`${escapeHtml(opts.greeting)}<br>damit du das CMS unter deiner eigenen Adresse öffnen kannst, lege bitte bei deinem Domain-Anbieter ${records.length === 1 ? "diesen DNS-Eintrag" : "diese DNS-Einträge"} an:`, { top: 10 })}
${blocks}
${mailText(`Liegt deine Domain bei Cloudflare, stell den Eintrag auf <strong style="color:${C.ink}">„Nur DNS“</strong> (graue Wolke). Sobald er aktiv ist, meist nach wenigen Minuten, erreichst du das CMS unter <a href="https://${escapeHtml(domain)}" style="color:${C.accent};text-decoration:none">${escapeHtml(domain)}</a>.`, { top: 24 })}`,
      { footer: "Fragen dazu? Antworte einfach auf diese Mail.", preheader: `So richtest du ${domain} für dein CMS ein.` },
    ),
  });
}

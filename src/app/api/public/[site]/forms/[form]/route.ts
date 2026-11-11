import { db } from "@/db";
import { formSubmissions } from "@/db/schema";
import { loadConfig } from "@/server/config";
import { ensureWorktree } from "@/server/git";
import { notify } from "@/server/notifications";
import { clientIp, corsHeaders, json, originAllowed, rateLimited, siteByPublicKey } from "@/server/public";
import { sendSubmissionMails } from "@/server/site-mail";
import { validateValues } from "@/server/sanitize";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

async function readBody(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const data = (await request.json()) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")]));
  }
  const form = await request.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : v.name]));
}

export async function POST(request: Request, ctx: RouteContext<"/api/public/[site]/forms/[form]">) {
  const { site: key, form: formKey } = await ctx.params;
  const site = await siteByPublicKey(key);
  if (!site) return json({ ok: false, error: "Unbekannte Website." }, 404);
  if (!originAllowed(request, site)) return json({ ok: false, error: "Diese Domain darf das Formular nicht verwenden." }, 403);
  const config = await loadConfig(await ensureWorktree(site));
  const form = config.forms.find((f) => f.key === formKey);
  if (!form) return json({ ok: false, error: "Unbekanntes Formular." }, 404);
  if (rateLimited(`form:${site.id}:${clientIp(request)}`, 5, 60_000)) {
    return json({ ok: false, error: "Zu viele Anfragen. Bitte versuche es gleich noch einmal." }, 429);
  }

  let body: Record<string, string>;
  try {
    body = await readBody(request);
  } catch {
    return json({ ok: false, error: "Ungültige Anfrage." }, 400);
  }
  // Honeypot: bots fill every field. Pretend success.
  if (body._gotcha) return json({ ok: true });

  const data: Record<string, string> = {};
  for (const field of form.fields) data[field.name] = (body[field.name] ?? "").toString().trim().slice(0, 5000);
  const errors = validateValues(form.fields, data);
  if (Object.keys(errors).length) return json({ ok: false, errors }, 422);

  let page: string | null = null;
  try {
    page = body._page || (request.headers.get("referer") ? new URL(request.headers.get("referer")!).pathname : null);
  } catch {
    page = null;
  }
  const [submission] = await db.insert(formSubmissions).values({ siteId: site.id, form: form.key, data, page }).returning({ id: formSubmissions.id });
  const who = data.name || data.email || "Jemand";
  await notify(site.id, null, "form", `Neue Nachricht von ${who} über „${form.label}“`, "/forms");
  // Mail in the background: the visitor gets the answer right away.
  const cmsUrl = process.env.KERN_PUBLIC_URL ?? new URL(request.url).origin;
  void sendSubmissionMails({ site, form, submissionId: submission.id, data, page, cmsUrl });
  return json({ ok: true });
}

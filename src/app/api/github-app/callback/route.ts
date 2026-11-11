import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { githubApp } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { encrypt } from "@/server/crypto";

/** GitHub redirects here after the app was created; exchange the one-time code for the app's credentials. */
export async function GET(request: NextRequest) {
  await requireAdmin();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/github?${q}`, request.url));
  if (!code || !state || state !== request.cookies.get("kern_github_state")?.value) return back("error=state");

  const res = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", "User-Agent": "kerncms" },
  });
  if (!res.ok) return back("error=exchange");
  const data = (await res.json()) as {
    id: number;
    slug: string;
    name: string;
    client_id: string;
    client_secret: string;
    pem: string;
    webhook_secret: string | null;
    owner?: { login?: string };
  };
  const values = {
    appId: String(data.id),
    slug: data.slug,
    name: data.name,
    clientId: data.client_id,
    clientSecret: encrypt(data.client_secret),
    privateKey: encrypt(data.pem),
    webhookSecret: data.webhook_secret ? encrypt(data.webhook_secret) : null,
    owner: data.owner?.login ?? null,
  };
  await db.insert(githubApp).values({ id: "default", ...values }).onConflictDoUpdate({ target: githubApp.id, set: values });
  const response = back("created=1");
  response.cookies.delete("kern_github_state");
  return response;
}

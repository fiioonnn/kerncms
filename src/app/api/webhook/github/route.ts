import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { githubApp, sites } from "@/db/schema";
import { decrypt } from "@/server/crypto";
import { fetchRemote } from "@/server/github";

/** Push events from GitHub: fetch right away so the CMS sees developer changes without waiting. */
export async function POST(request: Request) {
  const body = await request.text();
  const [app] = await db.select().from(githubApp).limit(1);
  if (!app?.webhookSecret) return new Response("not configured", { status: 404 });
  const expected = "sha256=" + createHmac("sha256", decrypt(app.webhookSecret)).update(body).digest("hex");
  const given = request.headers.get("x-hub-signature-256") ?? "";
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response("bad signature", { status: 401 });
  }
  if (request.headers.get("x-github-event") !== "push") return new Response("ignored", { status: 202 });
  const payload = JSON.parse(body) as { repository?: { full_name?: string } };
  const repo = payload.repository?.full_name;
  if (repo) {
    const matches = await db.select().from(sites).where(and(eq(sites.githubRepo, repo), eq(sites.source, "github")));
    for (const site of matches) void fetchRemote(site).catch(() => {});
  }
  return new Response("ok", { status: 202 });
}

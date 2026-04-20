import { NextResponse } from "next/server";
import { getGitHubAppConfig } from "@/lib/github-app-config";
import { verifyWebhookSignature, handlePushEvent } from "@/lib/webhook/github-handler";

export async function POST(request: Request) {
  const event = request.headers.get("x-github-event");
  if (event === "ping") return NextResponse.json({ ok: true });
  if (event !== "push") return NextResponse.json({ ignored: true }, { status: 200 });

  const body = await request.text();

  const config = getGitHubAppConfig();
  if (!config?.webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const signature = request.headers.get("x-hub-signature-256") ?? "";
  if (!verifyWebhookSignature(body, signature, config.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Respond immediately, process in background
  const promise = handlePushEvent(payload).catch((err) => {
    console.error("Webhook handler error:", err);
  });

  // Use waitUntil if available (Vercel/Edge), otherwise fire-and-forget
  if (typeof globalThis !== "undefined" && "waitUntil" in globalThis) {
    (globalThis as unknown as { waitUntil: (p: Promise<unknown>) => void }).waitUntil(promise);
  }

  return NextResponse.json({ ok: true, processing: true });
}

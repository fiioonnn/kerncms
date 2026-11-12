"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { findClient, issueCode, SCOPE } from "@/server/oauth";

export type AuthorizeRequest = { clientId: string; redirectUri: string; codeChallenge: string; state: string };

function back(redirectUri: string, params: Record<string, string>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

/** The user allowed the app: issue a code and send the browser back to the app. */
export async function approve(request: AuthorizeRequest) {
  const user = await requireUser();
  const client = await findClient(request.clientId);
  if (!client || !client.redirectUris.includes(request.redirectUri)) throw new Error("Unbekannte App oder Rücksprungadresse.");
  if (!/^[A-Za-z0-9_-]{43}$/.test(request.codeChallenge)) throw new Error("Ungültige PKCE-Challenge.");
  const code = await issueCode({ clientId: client.id, userId: user.id, redirectUri: request.redirectUri, codeChallenge: request.codeChallenge, scope: SCOPE });
  redirect(back(request.redirectUri, { code, state: request.state }));
}

export async function deny(request: AuthorizeRequest) {
  const client = await findClient(request.clientId);
  if (!client || !client.redirectUris.includes(request.redirectUri)) redirect("/");
  redirect(back(request.redirectUri, { error: "access_denied", state: request.state }));
}

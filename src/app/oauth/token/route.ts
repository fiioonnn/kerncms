import { exchangeCode, OAuthError, oauthJson, preflight, refreshTokens } from "@/server/oauth";

/** Token endpoint: authorization_code (with PKCE) and refresh_token. Public clients, no secret. */
export async function POST(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  const params = type.includes("application/json")
    ? new URLSearchParams(Object.entries((await request.json().catch(() => ({}))) as Record<string, string>))
    : new URLSearchParams(await request.text());
  const get = (key: string) => params.get(key) ?? "";
  try {
    const clientId = get("client_id");
    if (!clientId) throw new OAuthError("invalid_client", "client_id fehlt.", 401);
    switch (get("grant_type")) {
      case "authorization_code":
        return oauthJson(await exchangeCode({ code: get("code"), clientId, redirectUri: get("redirect_uri"), codeVerifier: get("code_verifier") }));
      case "refresh_token":
        return oauthJson(await refreshTokens({ refreshToken: get("refresh_token"), clientId }));
      default:
        throw new OAuthError("unsupported_grant_type", "Nur authorization_code und refresh_token.");
    }
  } catch (error) {
    if (error instanceof OAuthError) return oauthJson({ error: error.code, error_description: error.message }, { status: error.status });
    throw error;
  }
}

export const OPTIONS = preflight;

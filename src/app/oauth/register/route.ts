import { OAuthError, oauthJson, preflight, registerClient } from "@/server/oauth";

/** Dynamic client registration (RFC 7591): Claude registers itself before the first login. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return oauthJson({ error: "invalid_client_metadata", error_description: "JSON erwartet." }, { status: 400 });
  try {
    const client = await registerClient(body);
    return oauthJson(
      {
        client_id: client.id,
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        client_id_issued_at: Math.floor(Date.now() / 1000),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof OAuthError) return oauthJson({ error: error.code, error_description: error.message }, { status: error.status });
    throw error;
  }
}

export const OPTIONS = preflight;

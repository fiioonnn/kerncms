import { authorizationServerMetadata, baseUrl, oauthJson, preflight } from "@/server/oauth";

/** RFC 8414 metadata; clients may append the issuer path, so any suffix answers the same. */
export function GET(request: Request) {
  return oauthJson(authorizationServerMetadata(baseUrl(request)));
}

export const OPTIONS = preflight;

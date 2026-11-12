import { baseUrl, oauthJson, preflight, protectedResourceMetadata } from "@/server/oauth";

/** RFC 9728 metadata for the MCP endpoint (/.well-known/oauth-protected-resource/mcp). */
export function GET(request: Request) {
  return oauthJson(protectedResourceMetadata(baseUrl(request)));
}

export const OPTIONS = preflight;

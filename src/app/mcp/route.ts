import { handleRpc } from "@/server/mcp";
import { baseUrl, CORS, preflight, userFromBearer } from "@/server/oauth";

/*
 * MCP endpoint (Streamable HTTP, stateless). Add it in the Claude app as a custom
 * connector: <cms>/mcp. Without a valid token it answers 401 and points to the
 * OAuth metadata, which starts the login.
 */

function unauthorized(request: Request) {
  const base = baseUrl(request);
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Anmeldung erforderlich." } },
    {
      status: 401,
      headers: { ...CORS, "WWW-Authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` },
    },
  );
}

export async function POST(request: Request) {
  const user = await userFromBearer(request);
  if (!user) return unauthorized(request);

  const body = await request.json().catch(() => undefined);
  if (body === undefined) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }
  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map((m) => handleRpc(user, m ?? {})))).filter((r) => r !== null);
  // Only notifications or responses: nothing to answer.
  if (replies.length === 0) return new Response(null, { status: 202, headers: CORS });
  return Response.json(Array.isArray(body) ? replies : replies[0], { headers: CORS });
}

/** No server-initiated stream: this server never sends requests or notifications on its own. */
export async function GET(request: Request) {
  if (!(await userFromBearer(request))) return unauthorized(request);
  return new Response("Method Not Allowed", { status: 405, headers: { ...CORS, Allow: "POST" } });
}

export async function DELETE() {
  return new Response("Method Not Allowed", { status: 405, headers: { ...CORS, Allow: "POST" } });
}

export const OPTIONS = preflight;

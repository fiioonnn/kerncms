import "server-only";
import http from "node:http";
import net from "node:net";

/*
 * Makes the preview dev servers reachable from outside the container.
 * They listen on 127.0.0.1:<port>; this gateway listens on KERN_PREVIEW_PORT (default 3100) and
 * forwards https://preview-<siteId>.<KERN_PREVIEW_DOMAIN> to the matching port, websockets included
 * (Vite's hot reload). The reverse proxy in front (Traefik, Cloudflare) terminates TLS.
 */

const PREFIX = "preview-";

export function previewDomain() {
  return process.env.KERN_PREVIEW_DOMAIN?.trim().toLowerCase().replace(/^\.+|\.+$/g, "") || null;
}

/**
 * Public address of a site's preview, or null when previews are only reachable locally.
 * The protocol follows KERN_PUBLIC_URL; KERN_PREVIEW_DOMAIN may carry a port for local testing (localhost:3100).
 */
export function publicPreviewUrl(siteId: string) {
  const domain = previewDomain();
  if (!domain) return null;
  const protocol = process.env.KERN_PUBLIC_URL?.startsWith("http://") ? "http" : "https";
  return `${protocol}://${PREFIX}${siteId}.${domain}`;
}

type Lookup = (siteId: string) => number | null;
/** Called with +1 / -1 when a websocket to a preview opens or closes (an open editor keeps one open). */
type OnSocket = (siteId: string, delta: 1 | -1) => void;

function siteIdFromHost(host: string | undefined) {
  const domain = previewDomain()?.split(":")[0];
  if (!host || !domain) return null;
  const name = host.split(":")[0].toLowerCase();
  if (!name.startsWith(PREFIX) || !name.endsWith(`.${domain}`)) return null;
  const id = name.slice(PREFIX.length, -(domain.length + 1));
  return /^[0-9a-f-]{36}$/.test(id) ? id : null;
}

function headersFor(req: http.IncomingMessage, port: number) {
  // The dev server only accepts its own host name (Vite's allowedHosts); the browser keeps using the public one.
  return { ...req.headers, host: `127.0.0.1:${port}`, "x-forwarded-host": req.headers.host ?? "" };
}

function notFound(res: http.ServerResponse, message: string) {
  res.writeHead(502, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end(message);
}

/** Starts the gateway once per process. `lookup` returns the port of a running preview. */
export function startPreviewGateway(lookup: Lookup, onSocket?: OnSocket) {
  const g = globalThis as { __kernPreviewGateway?: http.Server };
  if (g.__kernPreviewGateway || !previewDomain()) return;
  const port = Number(process.env.KERN_PREVIEW_PORT || 3100);

  const server = http.createServer((req, res) => {
    const siteId = siteIdFromHost(req.headers.host);
    const target = siteId ? lookup(siteId) : null;
    if (!target) return notFound(res, "Diese Vorschau läuft gerade nicht. Öffne die Seite im kerncms-Editor, dann startet sie.");
    const upstream = http.request({ host: "127.0.0.1", port: target, method: req.method, path: req.url, headers: headersFor(req, target) }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on("error", () => (res.headersSent ? res.destroy() : notFound(res, "Die Vorschau antwortet nicht.")));
    req.pipe(upstream);
  });

  // Websocket upgrades (hot reload): replay the request line and headers, then pipe both ways.
  server.on("upgrade", (req, socket, head) => {
    const siteId = siteIdFromHost(req.headers.host);
    const target = siteId ? lookup(siteId) : null;
    if (!target) return socket.destroy();
    const upstream = net.connect(target, "127.0.0.1", () => {
      const headers = headersFor(req, target);
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [key, value] of Object.entries(headers)) {
        for (const v of Array.isArray(value) ? value : [value]) if (v !== undefined) lines.push(`${key}: ${v}`);
      }
      upstream.write(lines.join("\r\n") + "\r\n\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
      onSocket?.(siteId!, 1);
      let closed = false;
      const done = () => {
        if (closed) return;
        closed = true;
        onSocket?.(siteId!, -1);
      };
      socket.on("close", done);
      upstream.on("close", done);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });

  server.on("error", (error) => console.error("[kern] Vorschau-Gateway:", error.message));
  server.listen(port, "0.0.0.0", () => console.info(`[kern] Vorschau-Gateway auf Port ${port} für *.${previewDomain()}`));
  g.__kernPreviewGateway = server;
}

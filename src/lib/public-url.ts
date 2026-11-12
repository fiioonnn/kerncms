/**
 * Public base URL of the CMS, e.g. https://app.kerncms.com (no trailing slash).
 * Behind a proxy `request.url` carries the container's own address (http://0.0.0.0:3000),
 * so redirects must be built from KERN_PUBLIC_URL or the forwarded headers instead.
 */
export function publicBaseUrl(request: Request) {
  if (process.env.KERN_PUBLIC_URL) return process.env.KERN_PUBLIC_URL.replace(/\/+$/, "");
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** An absolute URL on the CMS for redirects, e.g. publicUrl("/login", request). */
export function publicUrl(path: string, request: Request) {
  return new URL(path, publicBaseUrl(request) + "/");
}

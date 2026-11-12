"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<Device, string> = { desktop: "100%", tablet: "820px", mobile: "390px" };
const HOME_PAGE_NAMES = ["home", "index", "default", "start", "landing"];

export function defaultPathFor(page: string) {
  return HOME_PAGE_NAMES.includes(page.toLowerCase()) ? "/" : `/${page}`;
}

function pageForPath(pathname: string, pageNames: string[]) {
  const seg = pathname.replace(/^\/+|\/+$/g, "").split("/")[0] ?? "";
  if (!seg) return pageNames.find((p) => HOME_PAGE_NAMES.includes(p.toLowerCase())) ?? null;
  return pageNames.find((p) => p.toLowerCase() === seg.toLowerCase()) ?? null;
}

/**
 * Read-only preview of the deployed site for the page being edited. It shows
 * the published site, so unpublished drafts appear after publish + deploy.
 * Key it by page name: each page keeps its own remembered path.
 */
export function SitePreview({
  projectId,
  siteUrl,
  pageName,
  pageNames,
  reloadKey,
  onNavigatePage,
  onClose,
}: {
  projectId: string;
  siteUrl?: string | null;
  pageName: string;
  pageNames: string[];
  reloadKey: number;
  onNavigatePage: (pageName: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const storageKey = `kern-preview-path:${projectId}:${pageName}`;
  const [path, setPath] = useState(() => {
    try { return localStorage.getItem(storageKey) ?? defaultPathFor(pageName); } catch { return defaultPathFor(pageName); }
  });
  const [pathInput, setPathInput] = useState(path);
  const [html, setHtml] = useState<string | null>(null);
  const [siteOrigin, setSiteOrigin] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [frameKey, setFrameKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async (p: string) => {
    if (!siteUrl) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/kern/preview?path=${encodeURIComponent(p)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Preview failed (${res.status})`);
      setHtml(data.html);
      setSiteOrigin(data.siteOrigin);
      setFrameKey((k) => k + 1);
    } catch (e) {
      setHtml(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId, siteUrl]);

  useEffect(() => { load(path); }, [load, path, reloadKey]);

  function navigate(p: string) {
    const next = p.startsWith("/") ? p : `/${p}`;
    setPathInput(next);
    try { localStorage.setItem(storageKey, next); } catch { /* */ }
    if (next === path) load(next);
    else setPath(next);
  }

  // Link clicks inside the preview arrive as messages from the (opaque-origin) frame.
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; });
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const data = e.data as { type?: string; href?: string } | null;
      if (data?.type !== "kern-preview-link" || typeof data.href !== "string") return;
      let url: URL;
      try { url = new URL(data.href); } catch { return; }
      if (!siteOrigin || url.origin !== siteOrigin) {
        toast.info("External links open outside the preview.");
        return;
      }
      const target = url.pathname + url.search;
      const nextPage = pageForPath(url.pathname, pageNames);
      if (nextPage && nextPage !== pageName) {
        try { localStorage.setItem(`kern-preview-path:${projectId}:${nextPage}`, target); } catch { /* */ }
        onNavigatePage(nextPage);
        return;
      }
      navigateRef.current(target);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [siteOrigin, pageNames, pageName, projectId, onNavigatePage]);

  return (
    <div className="flex h-full min-w-0 flex-col border-l border-border bg-muted/20">
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <form
          className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-input bg-background/60 px-2 text-xs"
          onSubmit={(e) => { e.preventDefault(); navigate(pathInput.trim() || "/"); }}
        >
          <span className="max-w-[40%] truncate text-muted-foreground/60">{(siteOrigin ?? siteUrl ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
          <input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            className="min-w-0 flex-1 bg-transparent font-mono outline-none"
            spellCheck={false}
            aria-label="Page path"
          />
        </form>
        <button
          onClick={() => load(path)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          title="Reload"
          aria-label="Reload preview"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? "animate-spin" : ""}>
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
          </svg>
        </button>
        <div className="flex items-center rounded-md border border-border p-0.5">
          {(["desktop", "tablet", "mobile"] as Device[]).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              title={d[0].toUpperCase() + d.slice(1)}
              aria-label={`${d} width`}
              aria-pressed={device === d}
              className={`flex h-6 w-6 items-center justify-center rounded ${device === d ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {d === "desktop" && <><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></>}
                {d === "tablet" && <><rect width="16" height="20" x="4" y="2" rx="2" /><line x1="12" x2="12.01" y1="18" y2="18" /></>}
                {d === "mobile" && <><rect width="12" height="20" x="6" y="2" rx="2" /><line x1="12" x2="12.01" y1="18" y2="18" /></>}
              </svg>
            </button>
          ))}
        </div>
        {siteOrigin && (
          <a
            href={`${siteOrigin}${path}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            title="Open in new tab"
            aria-label="Open in new tab"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </a>
        )}
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          title="Close preview"
          aria-label="Close preview"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {!siteUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="max-w-xs text-sm text-muted-foreground">Add your website&apos;s URL in project settings to preview it here.</p>
            <Button variant="outline" size="sm" onClick={() => router.push("/settings")}>Open settings</Button>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="max-w-xs text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => load(path)}>Try again</Button>
          </div>
        ) : html ? (
          <iframe
            key={frameKey}
            ref={iframeRef}
            title="Site preview"
            // Scripts run so the site renders like the real thing, but in an opaque origin: it can't reach the CMS.
            sandbox="allow-scripts"
            srcDoc={html}
            className="mx-auto block h-full bg-white transition-[width] duration-200"
            style={{ width: DEVICE_WIDTH[device], border: 0, boxShadow: device === "desktop" ? undefined : "0 0 0 1px var(--border)" }}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading preview…</p>
          </div>
        )}
      </div>
      <p className="shrink-0 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        Live site. Unpublished changes show up here after you publish and the site redeploys.
      </p>
    </div>
  );
}

import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { Site } from "@/db/schema";
import type { KernConfig } from "@/lib/kern-types";
import { loadConfig } from "./config";
import { linkNodeModules } from "./git";
import { publicPreviewUrl, startPreviewGateway } from "./preview-gateway";

export type PreviewState = {
  status: "installing" | "starting" | "ready" | "error" | "stopped";
  port: number | null;
  url: string | null;
  /**
   * Address a phone can open: the public preview address (KERN_PREVIEW_DOMAIN, reachable from anywhere)
   * or else the address on the local network (same Wi-Fi). Null when neither exists.
   */
  phoneUrl: string | null;
  /** True when phoneUrl works from any network, not only the same Wi-Fi. */
  phoneAnywhere: boolean;
  error: string | null;
  log: string[];
  startedAt: number;
};

/** Phones on the same network can open the preview, unless KERN_PREVIEW_LAN=0. */
function lanEnabled() {
  return process.env.KERN_PREVIEW_LAN !== "0";
}

/** First private IPv4 address of this machine, e.g. 192.168.178.95. */
export function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(net.address)) return net.address;
    }
  }
  return null;
}

type Entry = PreviewState & {
  /** Last time the editor asked for this preview or the gateway served it (ms). */
  lastUsed: number;
  /** Open websockets through the gateway, i.e. editors showing this preview right now. */
  sockets: number;
  proc: ChildProcess | null;
  ready: Promise<void> | null;
  /** What it was started with, to start it again (see restartPreviewFor). */
  args: { site: Site; dir: string; cmsUrl: string };
};

const registry = ((globalThis as { __kernPreviews?: Map<string, Entry> }).__kernPreviews ??= new Map());

// With KERN_PREVIEW_DOMAIN set, previews are reached through the gateway instead of 127.0.0.1:<port>.
startPreviewGateway((siteId) => {
  const entry = registry.get(siteId);
  if (!entry || entry.status === "stopped" || entry.status === "error") return null;
  entry.lastUsed = Date.now();
  return entry.port;
}, (siteId, delta) => {
  const entry = registry.get(siteId);
  if (!entry) return;
  entry.sockets = Math.max(0, entry.sockets + delta);
  entry.lastUsed = Date.now();
});

/**
 * Dev servers cost a few hundred MB each. One that nobody used for KERN_PREVIEW_IDLE_MINUTES (default 30)
 * is stopped; opening the editor starts it again. The editor polls the status every few seconds while open.
 */
const IDLE_MS = Number(process.env.KERN_PREVIEW_IDLE_MINUTES || 30) * 60_000;
const gIdle = globalThis as { __kernPreviewIdle?: NodeJS.Timeout };
if (!gIdle.__kernPreviewIdle && IDLE_MS > 0) {
  gIdle.__kernPreviewIdle = setInterval(() => {
    for (const [siteId, entry] of registry) {
      if (entry.status === "installing" || entry.status === "starting" || entry.sockets > 0) continue;
      if (Date.now() - entry.lastUsed > IDLE_MS) {
        console.info(`[kern] Vorschau ${entry.args.site.name} wird nach ${IDLE_MS / 60_000} Minuten ohne Nutzung gestoppt.`);
        stopPreview(siteId);
      }
    }
  }, 60_000);
  gIdle.__kernPreviewIdle.unref();
}

function pushLog(entry: Entry, chunk: string) {
  for (const line of chunk.split("\n")) {
    if (!line.trim()) continue;
    // Strip ANSI colours.
    entry.log.push(line.replace(/\x1b\[[0-9;]*m/g, ""));
  }
  if (entry.log.length > 200) entry.log.splice(0, entry.log.length - 200);
}

function freePort(start: number): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(freePort(start + 1)));
    server.listen(start, "127.0.0.1", () => {
      server.close(() => resolve(start));
    });
  });
}

async function waitForHttp(url: string, entry: Entry, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (entry.status === "error" || entry.status === "stopped") return;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Die Vorschau hat nicht rechtzeitig geantwortet.");
}

function run(command: string, cwd: string, env: Record<string, string>, entry: Entry) {
  const proc = spawn(command, { cwd, env: { ...process.env, ...env }, shell: true, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout?.on("data", (d: Buffer) => pushLog(entry, d.toString()));
  proc.stderr?.on("data", (d: Buffer) => pushLog(entry, d.toString()));
  return proc;
}

function killTree(proc: ChildProcess | null) {
  if (!proc?.pid) return;
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    proc.kill();
  }
}

function runToEnd(command: string, cwd: string, entry: Entry) {
  return new Promise<void>((resolve, reject) => {
    const proc = run(command, cwd, {}, entry);
    proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`„${command}“ ist mit Code ${code} beendet.`))));
    proc.on("error", reject);
  });
}

/** Current state of a site's preview. `touch` marks it as in use (the editor's status polling). */
export function getPreview(siteId: string, opts: { touch?: boolean } = {}): PreviewState {
  const entry = registry.get(siteId);
  if (entry && opts.touch) entry.lastUsed = Date.now();
  if (!entry) return { status: "stopped", port: null, url: null, phoneUrl: null, phoneAnywhere: false, error: null, log: [], startedAt: 0 };
  return {
    status: entry.status,
    port: entry.port,
    url: entry.url,
    phoneUrl: entry.phoneUrl,
    phoneAnywhere: entry.phoneAnywhere,
    error: entry.error,
    startedAt: entry.startedAt,
    log: entry.log.slice(-40),
  };
}

/** Starts (or reuses) the site's dev server on the draft worktree. Resolves when it answers. */
export function ensurePreview(site: Site, dir: string, config: KernConfig, cmsUrl: string) {
  const existing = registry.get(site.id);
  if (existing && existing.status !== "error" && existing.status !== "stopped" && existing.ready) return existing.ready;

  const entry: Entry = {
    status: "starting",
    port: null,
    url: null,
    phoneUrl: null,
    phoneAnywhere: false,
    error: null,
    log: existing?.log ?? [],
    startedAt: Date.now(),
    lastUsed: Date.now(),
    sockets: 0,
    proc: null,
    ready: null,
    args: { site, dir, cmsUrl },
  };
  registry.set(site.id, entry);

  entry.ready = (async () => {
    try {
      // Local folders share the developer's node_modules; GitHub clones install into the draft checkout.
      const installDir = site.source === "github" ? dir : site.repoPath;
      if (!existsSync(path.join(installDir, "node_modules"))) {
        entry.status = "installing";
        pushLog(entry, "Abhängigkeiten werden installiert…");
        await runToEnd("pnpm install --frozen-lockfile=false", installDir, entry);
        entry.status = "starting";
      }
      if (site.source !== "github") await linkNodeModules(site.repoPath, dir);
      const port = await freePort(4400 + (registry.size % 50) * 2);
      entry.port = port;
      const local = `http://127.0.0.1:${port}`;
      const publicUrl = publicPreviewUrl(site.id);
      entry.url = publicUrl ?? local;
      // Listen on all interfaces so a phone in the same network can open the preview too.
      const host = lanEnabled() ? "0.0.0.0" : "127.0.0.1";
      const lan = lanEnabled() ? lanAddress() : null;
      entry.phoneUrl = publicUrl ?? (lan ? `http://${lan}:${port}` : null);
      entry.phoneAnywhere = Boolean(publicUrl);
      const command = config.preview.command
        .replaceAll("{port}", String(port))
        .replaceAll("{host}", host)
        .replace(/--host[ =]127\.0\.0\.1\b/, `--host ${host}`);
      pushLog(entry, `$ ${command}`);
      const proc = run(command, dir, { KERN_PREVIEW: "1", KERN_CMS_URL: cmsUrl, BROWSER: "none" }, entry);
      entry.proc = proc;
      proc.on("exit", (code) => {
        if (registry.get(site.id) !== entry) return;
        if (entry.status === "stopped") return;
        entry.status = "error";
        entry.error = `Der Vorschau-Server wurde beendet (Code ${code}).`;
      });
      await waitForHttp(local, entry, 90_000);
      if (entry.status === "starting") entry.status = "ready";
    } catch (error) {
      entry.status = "error";
      entry.error = (error as Error).message;
      killTree(entry.proc);
      throw error;
    }
  })();
  entry.ready.catch(() => {});
  return entry.ready;
}

export function stopPreview(siteId: string) {
  const entry = registry.get(siteId);
  if (!entry) return;
  entry.status = "stopped";
  killTree(entry.proc);
  registry.delete(siteId);
}

/**
 * Files whose change a running dev server does not pick up reliably. Astro, for one,
 * stops reloading content after src/content.config.ts changes underneath it.
 */
export const RESTART_FILES = /^(astro\.config\.[cm]?[jt]s|src\/content\.config\.[cm]?[jt]s|src\/content\/config\.[cm]?[jt]s|kern\.config\.yaml|package\.json|pnpm-lock\.yaml)$/;

/** Starts a running preview again, e.g. after the draft took over a config change. */
export async function restartPreviewFor(siteId: string) {
  const entry = registry.get(siteId);
  if (!entry || entry.status === "stopped") return;
  const { site, dir, cmsUrl } = entry.args;
  pushLog(entry, "Konfiguration geändert, Vorschau startet neu…");
  stopPreview(siteId);
  void ensurePreview(site, dir, await loadConfig(dir), cmsUrl);
}

// Stop all preview servers when the CMS process exits.
const g = globalThis as { __kernPreviewCleanup?: boolean };
if (!g.__kernPreviewCleanup) {
  g.__kernPreviewCleanup = true;
  const cleanup = () => {
    for (const entry of registry.values()) killTree(entry.proc);
  };
  process.once("exit", cleanup);
  process.once("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });
}

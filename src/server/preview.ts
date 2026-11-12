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

export type PreviewState = {
  status: "installing" | "starting" | "ready" | "error" | "stopped";
  port: number | null;
  url: string | null;
  /** Address on the local network (same Wi-Fi), e.g. for a phone. Null when the preview only listens locally. */
  lanUrl: string | null;
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
  proc: ChildProcess | null;
  ready: Promise<void> | null;
  /** What it was started with, to start it again (see restartPreviewFor). */
  args: { site: Site; dir: string; cmsUrl: string };
};

const registry = ((globalThis as { __kernPreviews?: Map<string, Entry> }).__kernPreviews ??= new Map());

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

export function getPreview(siteId: string): PreviewState {
  const entry = registry.get(siteId);
  if (!entry) return { status: "stopped", port: null, url: null, lanUrl: null, error: null, log: [], startedAt: 0 };
  return {
    status: entry.status,
    port: entry.port,
    url: entry.url,
    lanUrl: entry.lanUrl,
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
    lanUrl: null,
    error: null,
    log: existing?.log ?? [],
    startedAt: Date.now(),
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
      entry.url = `http://127.0.0.1:${port}`;
      // Listen on all interfaces so a phone in the same network can open the preview too.
      const host = lanEnabled() ? "0.0.0.0" : "127.0.0.1";
      const lan = lanEnabled() ? lanAddress() : null;
      entry.lanUrl = lan ? `http://${lan}:${port}` : null;
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
      await waitForHttp(entry.url, entry, 90_000);
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

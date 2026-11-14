import "server-only";
import type { Role, Site } from "@/db/schema";
import type { KernConfig } from "@/lib/kern-types";

/* Shared shape of the assistant's tools (file tools and data tools). */

export class ToolError extends Error {}

export type ToolContext = {
  siteId: string;
  dir: string;
  site: Site;
  config: KernConfig;
  /** The signed-in person's role on the site; data tools check it like the matching CMS pages. */
  role: Role;
  /** Repo-relative paths the run wrote or deleted; committed when the run ends. */
  touched: Set<string>;
  /** Saves the run's file edits to the draft now (before CMS actions such as publish, which work on saved state). */
  flush: () => Promise<void>;
};

export type Args = Record<string, unknown>;

export type ToolDef = {
  name: string;
  description: string;
  schema: { type: "object"; properties: Record<string, unknown>; required: string[] };
  /** Short German line for the chat, e.g. "Liest src/pages/index.astro". */
  label: (args: Args) => string;
  run: (ctx: ToolContext, args: Args) => Promise<string>;
};

export const MAX_OUTPUT = 60_000;

export function str(args: Args, key: string, required = true): string {
  const value = args[key];
  if (typeof value === "string") return value;
  if (required) throw new ToolError(`Parameter "${key}" fehlt oder ist kein Text.`);
  return "";
}

/** A whole number within bounds, or the fallback. */
export function int(args: Args, key: string, fallback: number, min: number, max: number) {
  const value = Number(args[key]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clip(text: string) {
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (gekürzt, ${text.length - MAX_OUTPUT} Zeichen mehr)` : text;
}

export const json = (value: unknown) => JSON.stringify(value, null, 1);

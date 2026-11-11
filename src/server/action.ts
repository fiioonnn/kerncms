import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ValidationError } from "./content";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; errors?: Record<string, string> };

/** Runs a server action body and turns thrown errors into a result the UI can show. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ValidationError) return { ok: false, error: error.message, errors: error.errors };
    console.error("[kern]", error);
    return { ok: false, error: (error as Error).message || "Etwas ist schiefgelaufen." };
  }
}

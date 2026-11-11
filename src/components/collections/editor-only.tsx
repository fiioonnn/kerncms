"use client";

import { useCan } from "@/components/kern/kern-provider";
import type { RoleName } from "@/lib/kern-types";

/** Renders its children only for users with at least the given role (default: editor). */
export function EditorOnly({ role = "editor", children }: { role?: RoleName; children: React.ReactNode }) {
  return useCan(role) ? children : null;
}

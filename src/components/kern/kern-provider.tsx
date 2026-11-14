"use client";

import { createContext, use } from "react";
import type { ContentStatus, KernConfig, RoleName } from "@/lib/kern-types";

export type KernClientData = {
  user: { id: string; name: string; email: string; isAdmin: boolean };
  role: RoleName;
  site: {
    id: string;
    key: string;
    name: string;
    liveUrl: string | null;
    branch: string;
    requireApproval: boolean;
    source: "github" | "local";
    /** Public key for forms and analytics (/api/public/<key>/…). */
    publicKey: string;
    githubRepo: string | null;
  };
  sites: { id: string; name: string; liveUrl: string | null; role: RoleName }[];
  config: KernConfig;
  pages: { name: string; title: string; path: string; status: ContentStatus }[];
  /** e.g. "/media/" — stored image values start with this. */
  mediaPrefix: string;
  /** The AI assistant is set up and this user may use it (in the editor). */
  assistant: boolean;
  /** It is also offered outside the editor: sidebar, topbar, command palette and its own page. */
  assistantPage: boolean;
};

const KernContext = createContext<KernClientData | null>(null);

export function KernProvider({ value, children }: { value: KernClientData; children: React.ReactNode }) {
  return <KernContext value={value}>{children}</KernContext>;
}

export function useKern() {
  const value = use(KernContext);
  if (!value) throw new Error("useKern must be used inside <KernProvider>");
  return value;
}

/** Same as useKern, but null outside a site (e.g. login, styleguide demos). */
export function useOptionalKern() {
  return use(KernContext);
}

const rank = { viewer: 0, editor: 1, admin: 2, owner: 3 } as const;

export function useCan(min: RoleName) {
  const kern = useOptionalKern();
  return kern ? rank[kern.role] >= rank[min] : true;
}

/** URL the CMS can display an image from, given its stored value (e.g. /media/x.jpg). */
export function mediaSrc(value: string | undefined | null, mediaPrefix = "/media/") {
  if (!value) return "";
  if (/^(https?:)?\/\//.test(value) || value.startsWith("data:")) return value;
  if (value.startsWith(mediaPrefix)) return `/api/media/${encodeURIComponent(value.slice(mediaPrefix.length))}`;
  if (!value.startsWith("/")) return `/api/media/${encodeURIComponent(value)}`;
  // Other site paths (/logo.svg) live in the site's public folder, not in the CMS.
  return `/api/site-file?path=${encodeURIComponent(value)}`;
}

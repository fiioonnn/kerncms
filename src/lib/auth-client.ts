import { createAuthClient } from "better-auth/react";

export const mainDomain = process.env.NEXT_PUBLIC_APP_URL ?? "";

export const authClient = createAuthClient({
  baseURL: typeof window === "undefined"
    ? "http://localhost:3000"
    : window.location.origin,
});

export const { signIn, signOut, useSession } = authClient;

export function useIsAdmin() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  return role === "admin" || role === "superadmin";
}

export function useIsSuperAdmin() {
  const { data: session } = useSession();
  return (session?.user as { role?: string } | undefined)?.role === "superadmin";
}

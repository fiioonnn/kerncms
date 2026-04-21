import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

export const mainDomain = process.env.NEXT_PUBLIC_APP_URL ?? "";

export const authClient = createAuthClient({
  baseURL: typeof window === "undefined"
    ? "http://localhost:3000"
    : window.location.origin,
  plugins: [emailOTPClient()],
});

export const { signIn, signOut, useSession, emailOtp } = authClient;

export function useIsAdmin() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  return role === "admin" || role === "superadmin";
}

export function useIsSuperAdmin() {
  const { data: session } = useSession();
  return (session?.user as { role?: string } | undefined)?.role === "superadmin";
}

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getEnabledDomains, getMainOrigin } from "@/lib/domains";

function buildTrustedOrigins(): string[] {
  const origins: string[] = [];
  const mainOrigin = getMainOrigin();
  if (mainOrigin) origins.push(mainOrigin);

  for (const { domain } of getEnabledDomains()) {
    origins.push(`https://${domain}`);
  }

  return origins;
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  trustedOrigins: buildTrustedOrigins(),
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "member",
        input: false,
      },
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  advanced: {
    useSecureCookies: process.env.BETTER_AUTH_URL?.startsWith("https"),
  },
  session: {
    cookieCache: {
      enabled: false,
    },
  },
});

export type Session = typeof auth.$Infer.Session;

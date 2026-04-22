import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { isDiceBearConfig } from "@/lib/avatar";
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
      oauthImage: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          if (user.image && !isDiceBearConfig(user.image)) {
            await db.update(schema.user).set({ oauthImage: user.image }).where(
              eq(schema.user.id, user.id)
            );
          }
        },
      },
      update: {
        after: async (user) => {
          if (user.image && !isDiceBearConfig(user.image)) {
            await db.update(schema.user).set({ oauthImage: user.image }).where(
              eq(schema.user.id, user.id)
            );
          }
        },
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
  plugins: [
    emailOTP({
      async sendVerificationOTP() {
        // Email sending is handled by /api/auth/send-otp for proper error reporting
      },
    }),
  ],
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

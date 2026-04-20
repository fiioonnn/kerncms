import { db } from "@/db";
import { githubAppConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

type GitHubAppConfig = {
  appId: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  installationId: string | null;
};

export function getGitHubAppConfig(): GitHubAppConfig | null {
  const row = db.select().from(githubAppConfig).where(eq(githubAppConfig.id, "default")).get();

  if (row) {
    return {
      appId: row.appId,
      privateKey: decrypt(row.privateKey),
      clientId: row.clientId,
      clientSecret: decrypt(row.clientSecret),
      webhookSecret: row.webhookSecret ? decrypt(row.webhookSecret) : "",
      installationId: row.installationId,
    };
  }

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) return null;

  return {
    appId,
    privateKey,
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    webhookSecret: "",
    installationId: null,
  };
}

import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { getGitHubAppConfig } from "@/lib/github-app-config";

let cachedOctokit: Octokit | null = null;
let cachedConfigHash: string | null = null;

function normalizePem(raw: string): string {
  const body = raw
    .replace(/\\n/g, " ")
    .replace(/-----BEGIN[^-]*-----/, "")
    .replace(/-----END[^-]*-----/, "")
    .replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN RSA PRIVATE KEY-----\n${lines.join("\n")}\n-----END RSA PRIVATE KEY-----\n`;
}

export function clearOctokitCache() {
  cachedOctokit = null;
  cachedConfigHash = null;
}

export async function getOctokit() {
  const config = getGitHubAppConfig();
  if (!config) return null;

  const configHash = `${config.appId}:${config.installationId ?? ""}`;
  if (cachedOctokit && cachedConfigHash === configHash) return cachedOctokit;

  cachedOctokit = null;
  cachedConfigHash = null;

  const key = normalizePem(config.privateKey);

  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: config.appId, privateKey: key },
  });

  if (config.installationId) {
    cachedOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: config.appId,
        privateKey: key,
        installationId: Number(config.installationId),
      },
    });
    cachedConfigHash = configHash;
    return cachedOctokit;
  }

  const { data: installations } = await appOctokit.rest.apps.listInstallations({ per_page: 1 });
  if (installations.length === 0) return null;

  cachedOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.appId,
      privateKey: key,
      installationId: installations[0].id,
    },
  });
  cachedConfigHash = configHash;
  return cachedOctokit;
}

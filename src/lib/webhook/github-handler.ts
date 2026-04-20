import { createHmac, timingSafeEqual } from "crypto";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { db } from "@/db";
import { projects, webhookLogs, autofixSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getGitHubAppConfig } from "@/lib/github-app-config";
import {
  validateJsonSyntax,
  validateAgainstSchema,
  applyFixes,
  type ValidationError,
} from "@/lib/kern/validator";
import { getKernTypesPath } from "@/lib/github-content";

interface PushEvent {
  ref: string;
  after: string;
  commits: Commit[];
  repository: { full_name: string };
  installation: { id: number };
  sender?: { login: string };
}

interface Commit {
  added: string[];
  modified: string[];
  removed: string[];
}

interface FileFix {
  path: string;
  filename: string;
  fixedContent: Record<string, unknown>;
  sha: string;
  errors: ValidationError[];
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!secret || !signature) return false;
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  const expected = Buffer.from(`sha256=${hmac.digest("hex")}`);
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

function normalizePem(raw: string): string {
  const body = raw
    .replace(/\\n/g, " ")
    .replace(/-----BEGIN[^-]*-----/, "")
    .replace(/-----END[^-]*-----/, "")
    .replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN RSA PRIVATE KEY-----\n${lines.join("\n")}\n-----END RSA PRIVATE KEY-----\n`;
}

function getInstallationOctokit(installationId: number): Octokit | null {
  const config = getGitHubAppConfig();
  if (!config) return null;

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.appId,
      privateKey: normalizePem(config.privateKey),
      installationId,
    },
  });
}

function getKernFiles(commits: Commit[], srcDir: string): string[] {
  const prefix = (srcDir ? `${srcDir}/kern/` : "kern/").replace(/^\//, "");
  const files = new Set<string>();

  for (const commit of commits) {
    const changed = [...commit.added, ...commit.modified];
    changed
      .filter(
        (f) =>
          f.startsWith(prefix) &&
          f.endsWith(".json") &&
          !f.endsWith(".kern.json") &&
          !f.endsWith("types.json"),
      )
      .forEach((f) => files.add(f));
  }

  return Array.from(files);
}

async function getFileWithSha(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<{ content: string; sha: string } | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    if ("content" in data && data.encoding === "base64") {
      return {
        content: Buffer.from(data.content, "base64").toString("utf-8"),
        sha: data.sha,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export async function handlePushEvent(event: PushEvent): Promise<void> {
  const branch = event.ref.replace("refs/heads/", "");
  const repoFullName = event.repository.full_name;
  const [owner, repo] = repoFullName.split("/");

  const project = db
    .select()
    .from(projects)
    .where(eq(projects.repo, repoFullName))
    .get();

  if (!project || !project.kernInstalled) return;
  if (project.branch && project.branch !== branch) return;

  // Skip commits made by our bot to avoid loops
  const config = getGitHubAppConfig();
  if (config) {
    const allBotCommits = event.commits.every(
      (c) => c.added.length === 0 && c.modified.length === 0 && c.removed.length === 0,
    );
    if (allBotCommits) return;
  }
  if (event.sender?.login?.endsWith("[bot]")) return;

  const kernFiles = getKernFiles(event.commits, project.srcDir ?? "");
  if (kernFiles.length === 0) return;

  const settings = db
    .select()
    .from(autofixSettings)
    .where(eq(autofixSettings.projectId, project.id))
    .get();

  const fixSyntax = settings?.fixSyntax ?? true;
  const fixMissing = settings?.fixMissingFields ?? true;
  const fixTypes = settings?.fixTypeMismatches ?? true;
  const removeUnknown = settings?.removeUnknownFields ?? false;

  const octokit = getInstallationOctokit(event.installation.id);
  if (!octokit) return;

  const typesPath = getKernTypesPath(project.srcDir);
  const typesFile = await getFileWithSha(octokit, owner, repo, branch, typesPath);
  let typesJson: Record<string, Record<string, Record<string, unknown>>> | null = null;

  if (typesFile) {
    try {
      typesJson = JSON.parse(typesFile.content);
    } catch {
      typesJson = null;
    }
  }

  const allErrorsFound: ValidationError[] = [];
  const allErrorsFixed: ValidationError[] = [];
  const fixes: FileFix[] = [];
  let failedFile: string | null = null;

  for (const filePath of kernFiles) {
    const file = await getFileWithSha(octokit, owner, repo, branch, filePath);
    if (!file) continue;

    const syntaxResult = validateJsonSyntax(file.content);

    if (!syntaxResult.valid) {
      if (fixSyntax && syntaxResult.fixed) {
        allErrorsFound.push({
          type: "syntax_error",
          path: filePath,
          expected: "valid JSON",
          actual: syntaxResult.error,
          fix: "auto-fixed",
        });
        allErrorsFixed.push(allErrorsFound[allErrorsFound.length - 1]);

        let data: Record<string, unknown>;
        try {
          data = JSON.parse(syntaxResult.fixed);
        } catch {
          failedFile = filePath;
          allErrorsFound.push({
            type: "syntax_error",
            path: filePath,
            expected: "valid JSON",
            actual: syntaxResult.error,
            fix: null,
          });
          continue;
        }

        const schemaErrors = getSchemaErrors(data, filePath, typesJson, project.srcDir, {
          fixMissing,
          fixTypes,
          removeUnknown,
        });
        allErrorsFound.push(...schemaErrors);

        if (schemaErrors.length > 0) {
          const fixedData = applyFixes(data, schemaErrors);
          allErrorsFixed.push(...schemaErrors);
          fixes.push({
            path: filePath,
            filename: filePath.split("/").pop()!,
            fixedContent: fixedData,
            sha: file.sha,
            errors: [...schemaErrors, allErrorsFound[allErrorsFound.length - schemaErrors.length - 1]],
          });
        } else {
          fixes.push({
            path: filePath,
            filename: filePath.split("/").pop()!,
            fixedContent: data,
            sha: file.sha,
            errors: [allErrorsFound[allErrorsFound.length - 1]],
          });
        }
        continue;
      }

      failedFile = filePath;
      allErrorsFound.push({
        type: "syntax_error",
        path: filePath,
        expected: "valid JSON",
        actual: syntaxResult.error,
        fix: null,
      });
      continue;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(file.content);
    } catch {
      continue;
    }

    const schemaErrors = getSchemaErrors(data, filePath, typesJson, project.srcDir, {
      fixMissing,
      fixTypes,
      removeUnknown,
    });

    allErrorsFound.push(...schemaErrors);

    if (schemaErrors.length > 0) {
      const fixedData = applyFixes(data, schemaErrors);
      allErrorsFixed.push(...schemaErrors);
      fixes.push({
        path: filePath,
        filename: filePath.split("/").pop()!,
        fixedContent: fixedData,
        sha: file.sha,
        errors: schemaErrors,
      });
    }
  }

  if (fixes.length > 0) {
    await commitFixes(octokit, owner, repo, branch, fixes);
  }

  const status: "clean" | "fixed" | "failed" =
    failedFile ? "failed" : fixes.length > 0 ? "fixed" : "clean";

  db.insert(webhookLogs)
    .values({
      projectId: project.id,
      repository: repoFullName,
      branch,
      commitSha: event.after,
      filesChecked: kernFiles.length,
      filesFixed: fixes.length,
      errorsFound: JSON.stringify(allErrorsFound),
      errorsFixed: JSON.stringify(allErrorsFixed),
      status,
    })
    .run();
}

function getSchemaErrors(
  data: Record<string, unknown>,
  filePath: string,
  typesJson: Record<string, Record<string, Record<string, unknown>>> | null,
  srcDir: string | null,
  options: { fixMissing: boolean; fixTypes: boolean; removeUnknown: boolean },
): ValidationError[] {
  if (!typesJson) return [];

  const prefix = (srcDir ? `${srcDir}/kern/` : "kern/").replace(/^\//, "");
  const relative = filePath.slice(prefix.length);

  let schema: Record<string, unknown> | null = null;

  if (relative.startsWith("content/")) {
    const parts = relative.slice("content/".length).replace(/\.json$/, "").split("/");
    if (parts.length === 2) {
      const [page, section] = parts;
      schema = typesJson.content?.[page]?.[section] as Record<string, unknown> | undefined ?? null;
    }
  } else if (relative.startsWith("globals/")) {
    const name = relative.slice("globals/".length).replace(/\.json$/, "");
    schema = typesJson.globals?.[name] as Record<string, unknown> | undefined ?? null;
  }

  if (!schema) return [];

  return validateAgainstSchema(data, schema, options);
}

async function commitFixes(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  fixes: FileFix[],
): Promise<void> {
  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const baseSha = ref.object.sha;

  const { data: baseCommit } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: baseSha,
  });

  const treeItems = await Promise.all(
    fixes.map(async (fix) => {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: JSON.stringify(fix.fixedContent, null, 2) + "\n",
        encoding: "utf-8",
      });
      return {
        path: fix.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      };
    }),
  );

  const { data: newTree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    tree: treeItems,
  });

  const totalErrors = fixes.reduce((sum, f) => sum + f.errors.length, 0);
  const fileNames = fixes.map((f) => f.filename).join(", ");

  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: `kerncms: auto-fix ${totalErrors} error(s) in ${fileNames}`,
    tree: newTree.sha,
    parents: [baseSha],
  });

  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
  });
}

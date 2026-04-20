import { NextResponse } from "next/server";
import { db } from "@/db";
import { scanJobs, projects } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireSession } from "@/lib/auth-helpers";
import { getRepoTree, getFileContent, parseRepoString, getKernContentBase, getKernTypesPath } from "@/lib/github-content";
import { getAIResponse } from "@/lib/ai/provider";
import { getOctokit } from "@/lib/github";
import { inferFieldType } from "@/lib/ai/types-merger";

const runningScans = new Map<string, { cancelled: boolean }>();

function updateJob(jobId: string, data: Record<string, unknown>) {
  db.update(scanJobs)
    .set({ ...data, updatedAt: new Date() } as Record<string, unknown>)
    .where(eq(scanJobs.id, jobId))
    .run();
}

async function runScan(jobId: string, projectId: string) {
  const ctrl = { cancelled: false };
  runningScans.set(jobId, ctrl);

  try {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project?.repo || !project?.branch) {
      updateJob(jobId, { status: "failed", error: "No repository configured" });
      return;
    }

    const job = db.select().from(scanJobs).where(eq(scanJobs.id, jobId)).get();
    if (!job) return;

    const options = JSON.parse(job.options) as { scan: boolean; generateJson: boolean; createTypes: boolean; replaceHardcoded: boolean; cleanup: boolean };
    const filePaths = JSON.parse(job.files) as string[];
    const parsed = parseRepoString(project.repo);
    if (!parsed) {
      updateJob(jobId, { status: "failed", error: "Invalid repository string" });
      return;
    }

    if (ctrl.cancelled) { updateJob(jobId, { status: "cancelled" }); return; }

    updateJob(jobId, { currentTask: "scan" });

    const allResults: { file: string; strings: { original: string; key: string; section: string; type: string }[] }[] = [];

    for (let i = 0; i < filePaths.length; i++) {
      if (ctrl.cancelled) { updateJob(jobId, { status: "cancelled" }); return; }

      const fp = filePaths[i];
      const content = await getFileContent(parsed.owner, parsed.repo, project.branch!, fp);
      if (!content) continue;

      const filesPrompt = `--- FILE: ${fp} ---\n${content.slice(0, 50000)}`;

      const aiResult = await getAIResponse(
        filesPrompt,
        `You are a CMS content scanner. Analyze the source files and find hardcoded user-facing strings that should be managed through a CMS.

Look for:
- Headings, titles, labels, button texts, descriptions, placeholder texts
- Navigation items, menu labels, footer text
- Error messages, success messages, form validation texts
- Alt texts, meta descriptions, SEO content
- IMPORTANT — Repeating patterns: lists of features, team members, pricing tiers, FAQ items, nav links, cards, steps, testimonials, etc. When you see a pattern of similar items rendered in a loop or listed sequentially (e.g. multiple feature cards each with a title and description), group ALL items together as a single repeater entry.

Do NOT include:
- Code identifiers, variable names, CSS classes, import paths
- Console logs, debug strings, internal comments
- Single characters, numbers-only strings, URLs, file paths
- Library/framework-specific strings (e.g. "use client", "GET", "POST")
- Do NOT invent or hallucinate fields. Every "original" value MUST be an exact string literal from the source.

Be thorough — extract ALL user-facing strings including single-word UI labels. Scan the ENTIRE file.

For each found string, provide:
- original: the exact string as it appears in code
- key: a snake_case key name for the CMS (e.g. "hero_title", "cta_button")
- page: derive from file path (e.g. "app/pricing/page.tsx" → "pricing", homepage → "default"). Lowercase kebab-case.
- section: a logical grouping (e.g. "hero", "navigation", "footer", "pricing")
- type: one of "text", "textarea", "richtext", "repeater"

REPEATER RULES — this is critical:
When you detect a repeating pattern (e.g. 3 feature cards each with title + description), output a SINGLE entry with type "repeater" where:
- key: the list name (e.g. "features", "team_members", "steps")
- original: a JSON array string containing all items with their fields, e.g.:
  [{"title": "Fast", "description": "Built for speed"}, {"title": "Secure", "description": "Enterprise-grade security"}]
  Each object's keys should be snake_case field names. Use the actual string values from the source code.
- Do NOT output individual "text" entries for strings that belong to a repeater. Group them.

Respond with ONLY a JSON array. Each element: { "file": "path", "strings": [{ "original": "...", "key": "...", "page": "...", "section": "...", "type": "..." }] }
If no suitable strings found, return [].
Do not wrap in markdown code blocks.`
      );

      try {
        const cleaned = aiResult.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          allResults.push(...parsed);
        }
      } catch {
        // skip unparseable batch
      }

      updateJob(jobId, { results: JSON.stringify(allResults) });
    }

    if (ctrl.cancelled) { updateJob(jobId, { status: "cancelled" }); return; }

    updateJob(jobId, {
      status: "review",
      currentTask: "scan",
      results: JSON.stringify(allResults),
    });

  } catch (err) {
    updateJob(jobId, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    runningScans.delete(jobId);
  }
}

type ScanResult = { file: string; strings: { original: string; key: string; page?: string; section: string; type: string }[] };
type ScanOptions = { scan: boolean; generateJson: boolean; createTypes: boolean; replaceHardcoded: boolean; cleanup: boolean };

async function runNextTasks(jobId: string, projectId: string, startTask: string, results: ScanResult[], options: ScanOptions) {
  const ctrl = { cancelled: false };
  runningScans.set(jobId, ctrl);

  try {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project?.repo || !project?.branch) {
      updateJob(jobId, { status: "failed", error: "No repository configured" });
      return;
    }

    const parsed = parseRepoString(project.repo);
    if (!parsed) {
      updateJob(jobId, { status: "failed", error: "Invalid repository string" });
      return;
    }

    const octokit = await getOctokit();
    if (!octokit) {
      updateJob(jobId, { status: "failed", error: "GitHub App not configured" });
      return;
    }

    const { owner, repo } = parsed;
    const contentBase = getKernContentBase(project.srcDir);
    const typesPath = getKernTypesPath(project.srcDir);

    const taskOrder = (["generateJson", "createTypes", "replaceHardcoded", "cleanup"] as const).filter((t) => options[t]);
    const startIdx = taskOrder.indexOf(startTask as typeof taskOrder[number]);

    const filesToCommit: { path: string; content: string }[] = [];
    const modifiedPaths: string[] = [];

    // Group results by page + section
    const pageSectionMap = new Map<string, Map<string, { key: string; original: string; type: string }[]>>();
    for (const r of results) {
      for (const s of r.strings) {
        const page = s.page || "default";
        if (!pageSectionMap.has(page)) pageSectionMap.set(page, new Map());
        const sectionMap = pageSectionMap.get(page)!;
        const entries = sectionMap.get(s.section) ?? [];
        entries.push({ key: s.key, original: s.original, type: s.type });
        sectionMap.set(s.section, entries);
      }
    }

    for (let i = startIdx; i < taskOrder.length; i++) {
      if (ctrl.cancelled) { updateJob(jobId, { status: "cancelled" }); return; }
      const task = taskOrder[i];
      updateJob(jobId, { currentTask: task });

      if (task === "generateJson") {
        const generatedFiles: { path: string; content: string }[] = [];
        for (const [page, sectionMap] of pageSectionMap) {
          for (const [section, entries] of sectionMap) {
            const filePath = `${contentBase}/${page}/${section}.json`;
            let content: Record<string, unknown> = {};
            try {
              const existing = await getFileContent(owner, repo, project.branch, filePath);
              if (existing) content = JSON.parse(existing);
            } catch { /* use empty */ }
            for (const e of entries) {
              if (e.key in content) continue;
              if (e.type === "repeater") {
                try {
                  const items = JSON.parse(e.original);
                  if (Array.isArray(items)) {
                    content[e.key] = items;
                  } else {
                    content[e.key] = [{ value: e.original }];
                  }
                } catch {
                  content[e.key] = [{ value: e.original }];
                }
              } else {
                content[e.key] = e.original;
              }
            }
            generatedFiles.push({
              path: filePath,
              content: JSON.stringify(content, null, 2),
            });
          }
        }
        updateJob(jobId, {
          status: "review",
          currentTask: "generateJson",
          pendingFiles: JSON.stringify(generatedFiles),
        });
        runningScans.delete(jobId);
        return;
      }

      if (task === "createTypes") {
        let existingTypes: { content?: Record<string, Record<string, Record<string, unknown>>>; globals?: Record<string, Record<string, unknown>> } = { content: {}, globals: {} };
        try {
          const existing = await getFileContent(owner, repo, project.branch, typesPath);
          if (existing) existingTypes = JSON.parse(existing);
        } catch { /* use empty */ }

        const contentTypes = existingTypes.content ?? {};

        for (const [page, sectionMap] of pageSectionMap) {
          if (!contentTypes[page]) contentTypes[page] = {};
          for (const [section, entries] of sectionMap) {
            const sectionTypes: Record<string, unknown> = contentTypes[page][section] ?? {};
            for (const e of entries) {
              if (e.type === "repeater") {
                try {
                  const items = JSON.parse(e.original);
                  if (Array.isArray(items) && items.length > 0 && typeof items[0] === "object") {
                    const itemType: Record<string, unknown> = {};
                    for (const field of Object.keys(items[0])) {
                      itemType[field] = inferFieldType(String(items[0][field]), field);
                    }
                    sectionTypes[e.key] = [itemType];
                  } else {
                    sectionTypes[e.key] = [{ value: inferFieldType(e.original, "value") }];
                  }
                } catch {
                  sectionTypes[e.key] = [{ value: inferFieldType(e.original, "value") }];
                }
              } else {
                sectionTypes[e.key] = inferFieldType(e.original, e.key);
              }
            }
            contentTypes[page][section] = sectionTypes;
          }
        }

        filesToCommit.push({
          path: typesPath,
          content: JSON.stringify({ ...existingTypes, content: contentTypes }, null, 2),
        });
      }

      if (task === "replaceHardcoded") {
        for (const r of results) {
          if (r.strings.length === 0) continue;
          const original = await getFileContent(owner, repo, project.branch, r.file);
          if (!original) continue;

          const prompt = `You have a source file and a list of hardcoded strings that should be replaced with CMS content references.

SOURCE FILE (${r.file}):
${original.slice(0, 12000)}

STRINGS TO REPLACE:
${JSON.stringify(r.strings.map((s) => ({ original: s.original, key: s.key, section: s.section })), null, 2)}

Replace each hardcoded string with the appropriate kern content reference. Use this pattern:
- For React/JSX files (.tsx/.jsx): import the section data from the kern content path, then reference fields like \`content.${r.strings[0]?.key}\`
- For other files: use a comment marker showing the kern content key

Return ONLY the modified source file content. No markdown code blocks, no explanations.`;

          const replaced = await getAIResponse(prompt,
            "You are a code transformer. Replace hardcoded strings with CMS content references. Return only the modified file. No explanations.");

          if (replaced && replaced.trim().length > 50) {
            const cleaned = replaced.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
            filesToCommit.push({ path: r.file, content: cleaned });
            modifiedPaths.push(r.file);
          }
        }
      }

      if (task === "cleanup") {
        const pathsToClean = modifiedPaths.length > 0 ? modifiedPaths : filesToCommit.map((f) => f.path);
        for (const fp of pathsToClean) {
          if (ctrl.cancelled) { updateJob(jobId, { status: "cancelled" }); return; }
          const pending = filesToCommit.find((f) => f.path === fp);
          const content = pending?.content ?? await getFileContent(owner, repo, project.branch!, fp);
          if (!content) continue;

          const cleaned = await getAIResponse(
            `Review this file and fix any formatting or code quality issues:\n\n--- FILE: ${fp} ---\n${content.slice(0, 12000)}`,
            `You are a code formatter. Fix formatting issues: inconsistent indentation, missing/extra whitespace, trailing commas, import order, bracket alignment. Do NOT change logic, variable names, or functionality. Return ONLY the corrected file content. No markdown code blocks, no explanations.`
          );

          if (cleaned && cleaned.trim().length > 50) {
            const result = cleaned.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
            const existingIdx = filesToCommit.findIndex((f) => f.path === fp);
            if (existingIdx >= 0) {
              filesToCommit[existingIdx].content = result;
            } else {
              filesToCommit.push({ path: fp, content: result });
            }
          }
        }
      }
    }

    if (ctrl.cancelled) { updateJob(jobId, { status: "cancelled" }); return; }

    if (filesToCommit.length > 0) {
      await commitFiles(octokit, owner, repo, project.branch!, filesToCommit, "kerncms: smart scan — create types and replace hardcoded strings");
    }

    updateJob(jobId, { status: "completed", currentTask: taskOrder[taskOrder.length - 1] ?? startTask });
  } catch (err) {
    updateJob(jobId, { status: "failed", error: err instanceof Error ? err.message : String(err) });
  } finally {
    runningScans.delete(jobId);
  }
}

async function commitFiles(octokit: Awaited<ReturnType<typeof getOctokit>>, owner: string, repo: string, branch: string, files: { path: string; content: string }[], message: string) {
  if (!octokit || files.length === 0) return;
  const { data: ref } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
  const latestSha = ref.object.sha;
  const { data: latestCommit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: latestSha });
  const treeItems = await Promise.all(
    files.map(async (f) => {
      const { data: blob } = await octokit.rest.git.createBlob({ owner, repo, content: f.content, encoding: "utf-8" });
      return { path: f.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
    }),
  );
  const { data: newTree } = await octokit.rest.git.createTree({ owner, repo, base_tree: latestCommit.tree.sha, tree: treeItems });
  const { data: newCommit } = await octokit.rest.git.createCommit({ owner, repo, message, tree: newTree.sha, parents: [latestSha] });
  await octokit.rest.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: newCommit.sha });
}

async function runAfterGenerateJson(jobId: string, projectId: string, startTask: string, results: ScanResult[], acceptedFiles: { path: string; content: string }[], options: ScanOptions) {
  const ctrl = { cancelled: false };
  runningScans.set(jobId, ctrl);

  try {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project?.repo || !project?.branch) { updateJob(jobId, { status: "failed", error: "No repository configured" }); return; }
    const parsed = parseRepoString(project.repo);
    if (!parsed) { updateJob(jobId, { status: "failed", error: "Invalid repository string" }); return; }
    const octokit = await getOctokit();
    if (!octokit) { updateJob(jobId, { status: "failed", error: "GitHub App not configured" }); return; }

    const { owner, repo } = parsed;
    const typesPath = getKernTypesPath(project.srcDir);

    // Commit accepted content files first
    if (acceptedFiles.length > 0) {
      await commitFiles(octokit, owner, repo, project.branch, acceptedFiles, "kerncms: smart scan — generate content files");
    }

    const taskOrder = (["createTypes", "replaceHardcoded", "cleanup"] as const).filter((t) => options[t]);
    const startIdx = Math.max(0, taskOrder.indexOf(startTask as typeof taskOrder[number]));
    const filesToCommit: { path: string; content: string }[] = [];
    const modifiedPaths: string[] = [];

    const pageSectionMap2 = new Map<string, Map<string, { key: string; original: string; type: string }[]>>();
    for (const r of results) {
      for (const s of r.strings) {
        const page = s.page || "default";
        if (!pageSectionMap2.has(page)) pageSectionMap2.set(page, new Map());
        const sectionMap = pageSectionMap2.get(page)!;
        const entries = sectionMap.get(s.section) ?? [];
        entries.push({ key: s.key, original: s.original, type: s.type });
        sectionMap.set(s.section, entries);
      }
    }

    for (let i = startIdx; i < taskOrder.length; i++) {
      if (ctrl.cancelled) { updateJob(jobId, { status: "cancelled" }); return; }
      const task = taskOrder[i];
      updateJob(jobId, { currentTask: task });

      if (task === "createTypes") {
        let existingTypes: { content?: Record<string, Record<string, Record<string, unknown>>>; globals?: Record<string, Record<string, unknown>> } = { content: {}, globals: {} };
        try {
          const existing = await getFileContent(owner, repo, project.branch, typesPath);
          if (existing) existingTypes = JSON.parse(existing);
        } catch { /* use empty */ }
        const contentTypes = existingTypes.content ?? {};
        for (const [page, sectionMap] of pageSectionMap2) {
          if (!contentTypes[page]) contentTypes[page] = {};
          for (const [section, entries] of sectionMap) {
            const sectionTypes: Record<string, unknown> = contentTypes[page][section] ?? {};
            for (const e of entries) {
              if (e.type === "repeater") {
                try {
                  const items = JSON.parse(e.original);
                  if (Array.isArray(items) && items.length > 0 && typeof items[0] === "object") {
                    const itemType: Record<string, unknown> = {};
                    for (const field of Object.keys(items[0])) {
                      itemType[field] = inferFieldType(String(items[0][field]), field);
                    }
                    sectionTypes[e.key] = [itemType];
                  } else {
                    sectionTypes[e.key] = [{ value: inferFieldType(e.original, "value") }];
                  }
                } catch {
                  sectionTypes[e.key] = [{ value: inferFieldType(e.original, "value") }];
                }
              } else {
                sectionTypes[e.key] = inferFieldType(e.original, e.key);
              }
            }
            contentTypes[page][section] = sectionTypes;
          }
        }
        filesToCommit.push({ path: typesPath, content: JSON.stringify({ ...existingTypes, content: contentTypes }, null, 2) });
      }

      if (task === "replaceHardcoded") {
        for (const r of results) {
          if (r.strings.length === 0) continue;
          const original = await getFileContent(owner, repo, project.branch, r.file);
          if (!original) continue;
          const prompt = `You have a source file and a list of hardcoded strings that should be replaced with CMS content references.

SOURCE FILE (${r.file}):
${original.slice(0, 12000)}

STRINGS TO REPLACE:
${JSON.stringify(r.strings.map((s) => ({ original: s.original, key: s.key, section: s.section })), null, 2)}

Replace each hardcoded string with the appropriate kern content reference. Use this pattern:
- For React/JSX files (.tsx/.jsx): import the section data from the kern content path, then reference fields like \`content.${r.strings[0]?.key}\`
- For other files: use a comment marker showing the kern content key

Return ONLY the modified source file content. No markdown code blocks, no explanations.`;
          const replaced = await getAIResponse(prompt, "You are a code transformer. Replace hardcoded strings with CMS content references. Return only the modified file. No explanations.");
          if (replaced && replaced.trim().length > 50) {
            const cleaned = replaced.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
            filesToCommit.push({ path: r.file, content: cleaned });
            modifiedPaths.push(r.file);
          }
        }
      }

      if (task === "cleanup") {
        const pathsToClean = modifiedPaths.length > 0 ? modifiedPaths : filesToCommit.map((f) => f.path);
        for (const fp of pathsToClean) {
          if (ctrl.cancelled) { updateJob(jobId, { status: "cancelled" }); return; }
          const pending = filesToCommit.find((f) => f.path === fp);
          const content = pending?.content ?? await getFileContent(owner, repo, project.branch!, fp);
          if (!content) continue;

          const cleaned = await getAIResponse(
            `Review this file and fix any formatting or code quality issues:\n\n--- FILE: ${fp} ---\n${content.slice(0, 12000)}`,
            `You are a code formatter. Fix formatting issues: inconsistent indentation, missing/extra whitespace, trailing commas, import order, bracket alignment. Do NOT change logic, variable names, or functionality. Return ONLY the corrected file content. No markdown code blocks, no explanations.`
          );

          if (cleaned && cleaned.trim().length > 50) {
            const result = cleaned.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
            const existingIdx = filesToCommit.findIndex((f) => f.path === fp);
            if (existingIdx >= 0) {
              filesToCommit[existingIdx].content = result;
            } else {
              filesToCommit.push({ path: fp, content: result });
            }
          }
        }
      }
    }

    if (ctrl.cancelled) { updateJob(jobId, { status: "cancelled" }); return; }
    if (filesToCommit.length > 0) {
      await commitFiles(octokit, owner, repo, project.branch, filesToCommit, "kerncms: smart scan — create types and replace hardcoded strings");
    }

    updateJob(jobId, { status: "completed", currentTask: taskOrder[taskOrder.length - 1] ?? startTask });
  } catch (err) {
    updateJob(jobId, { status: "failed", error: err instanceof Error ? err.message : String(err) });
  } finally {
    runningScans.delete(jobId);
  }
}

// GET — poll scan status
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const job = db.select().from(scanJobs)
    .where(eq(scanJobs.projectId, id))
    .orderBy(desc(scanJobs.createdAt))
    .get();

  if (!job) return NextResponse.json({ active: false }, { headers: { "Cache-Control": "no-store" } });

  return NextResponse.json({
    active: job.status === "running" || job.status === "review",
    id: job.id,
    status: job.status,
    currentTask: job.currentTask,
    results: JSON.parse(job.results),
    pendingFiles: JSON.parse(job.pendingFiles),
    options: JSON.parse(job.options),
    error: job.error,
  }, { headers: { "Cache-Control": "no-store" } });
}

// POST — start new scan
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const body = await req.json();

  // Cancel any running scans for this project
  const existing = db.select().from(scanJobs)
    .where(and(eq(scanJobs.projectId, id), eq(scanJobs.status, "running")))
    .all();
  for (const job of existing) {
    const ctrl = runningScans.get(job.id);
    if (ctrl) ctrl.cancelled = true;
    updateJob(job.id, { status: "cancelled" });
  }

  const jobId = crypto.randomUUID();
  const now = new Date();
  db.insert(scanJobs).values({
    id: jobId,
    projectId: id,
    status: "running",
    currentTask: "scan",
    options: JSON.stringify(body.options ?? {}),
    files: JSON.stringify(body.files ?? []),
    results: "[]",
    createdAt: now,
    updatedAt: now,
  }).run();

  // Fire and forget — runs in background
  runScan(jobId, id);

  return NextResponse.json({ id: jobId, status: "running" });
}

// DELETE — cancel scan
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const jobs = db.select().from(scanJobs)
    .where(eq(scanJobs.projectId, id))
    .all();

  for (const job of jobs) {
    const ctrl = runningScans.get(job.id);
    if (ctrl) ctrl.cancelled = true;
    runningScans.delete(job.id);
    db.delete(scanJobs).where(eq(scanJobs.id, job.id)).run();
  }

  return NextResponse.json({ ok: true });
}

// PATCH — update results after review (accept/reject strings)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const body = await req.json();

  const job = db.select().from(scanJobs)
    .where(and(eq(scanJobs.projectId, id), eq(scanJobs.status, "review")))
    .get();

  if (!job) return NextResponse.json({ error: "No scan in review" }, { status: 404 });

  if (body.action === "accept") {
    const options = JSON.parse(job.options) as ScanOptions;
    const taskOrder = (["scan", "generateJson", "createTypes", "replaceHardcoded", "cleanup"] as const).filter((t) => options[t]);
    const currentTask = job.currentTask as typeof taskOrder[number];
    const currentIdx = taskOrder.indexOf(currentTask);
    const nextTask = taskOrder[currentIdx + 1];

    if (currentTask === "scan") {
      updateJob(job.id, {
        results: JSON.stringify(body.results),
        status: nextTask ? "running" : "completed",
        currentTask: nextTask ?? "scan",
      });
      if (nextTask) {
        runNextTasks(job.id, id, nextTask, body.results, options);
      }
    } else if (currentTask === "generateJson") {
      const acceptedFiles = (body.files ?? []) as { path: string; content: string }[];
      updateJob(job.id, {
        pendingFiles: JSON.stringify(acceptedFiles),
        status: nextTask ? "running" : "completed",
        currentTask: nextTask ?? currentTask,
      });
      if (nextTask) {
        const results = JSON.parse(job.results) as ScanResult[];
        runAfterGenerateJson(job.id, id, nextTask, results, acceptedFiles, options);
      }
    }

    return NextResponse.json({ ok: true, nextTask: nextTask ?? null });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

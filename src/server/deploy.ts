import "server-only";
import { spawn } from "node:child_process";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deploys, type DeployStep, type Site } from "@/db/schema";
import type { KernConfig } from "@/lib/kern-types";
import { commit, DRAFT_BRANCH, git, linkNodeModules, publishDraft, syncDraftWithLive, uncommittedFiles, unpublishedFiles, withSiteLock, type Author } from "./git";
import { notify } from "./notifications";

const LOCAL_STEPS = ["Änderungen sichern", "Live-Stand abgleichen", "Veröffentlichen", "Website bauen"];
const GITHUB_STEPS = ["Änderungen sichern", "Mit GitHub abgleichen", "Veröffentlichen", "Zu GitHub übertragen"];

function runBuild(command: string, cwd: string) {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(command, { cwd, shell: true, env: { ...process.env, KERN_PREVIEW: "" } });
    let out = "";
    const collect = (d: Buffer) => {
      out += d.toString().replace(/\x1b\[[0-9;]*m/g, "");
      if (out.length > 20_000) out = out.slice(-20_000);
    };
    proc.stdout.on("data", collect);
    proc.stderr.on("data", collect);
    proc.on("error", reject);
    proc.on("exit", (code) => (code === 0 ? resolve(out) : reject(Object.assign(new Error(`Build fehlgeschlagen (Code ${code}).`), { log: out }))));
  });
}

export async function latestDeploy(siteId: string) {
  const [row] = await db.select().from(deploys).where(eq(deploys.siteId, siteId)).orderBy(desc(deploys.createdAt)).limit(1);
  return row ?? null;
}

export async function hasPublishableChanges(dir: string, site: Site) {
  const [unsaved, unpublished] = await Promise.all([uncommittedFiles(dir), unpublishedFiles(dir, site.branch)]);
  return unsaved.length + unpublished.length > 0;
}

/** Starts publishing in the background and returns the deploy id right away. */
export async function startPublish(site: Site, dir: string, config: KernConfig, author: Author & { id: string }, message: string) {
  const running = await latestDeploy(site.id);
  if (running?.status === "running") throw new Error("Es wird gerade schon veröffentlicht.");
  if (!(await hasPublishableChanges(dir, site))) throw new Error("Es gibt keine Änderungen zum Veröffentlichen.");

  const github = site.source === "github";
  const steps: DeployStep[] = (github ? GITHUB_STEPS : LOCAL_STEPS).map((label) => ({ label, status: "pending" }));
  const [deploy] = await db
    .insert(deploys)
    .values({ siteId: site.id, userId: author.id, message, steps })
    .returning();

  const setStep = async (index: number, status: DeployStep["status"], logText?: string) => {
    steps[index] = { ...steps[index], status, ...(logText ? { log: logText.slice(-4000) } : {}) };
    await db.update(deploys).set({ steps: [...steps] }).where(eq(deploys.id, deploy.id));
  };

  void withSiteLock(site.id, async () => {
    let current = 0;
    try {
      await setStep(0, "running");
      await commit(dir, "Vor dem Veröffentlichen gespeichert", author);
      await setStep(0, "done");

      current = 1;
      await setStep(1, "running");
      if (github) await (await import("./github")).fetchRemote(site);
      await syncDraftWithLive(dir, site.branch, author);
      await setStep(1, "done");

      current = 2;
      await setStep(2, "running");
      const sha = await publishDraft(site.repoPath, site.branch, message, author);
      // Keep the draft exactly on the live commit so nothing shows as unpublished.
      await git(dir, ["merge", "--ff-only", "-q", site.branch]);
      await db.update(deploys).set({ commit: sha }).where(eq(deploys.id, deploy.id));
      await setStep(2, "done");

      current = 3;
      await setStep(3, "running");
      if (github) {
        // The hosting (Vercel, Netlify, Cloudflare …) builds from the live branch.
        await (await import("./github")).pushBranches(site, [site.branch, DRAFT_BRANCH]);
        await setStep(3, "done", `${site.branch} und ${DRAFT_BRANCH} nach ${site.githubRepo} übertragen.`);
      } else {
        await linkNodeModules(site.repoPath, dir);
        const buildLog = await runBuild(config.build.command, dir);
        await setStep(3, "done", buildLog);
      }

      await db.update(deploys).set({ status: "done", finishedAt: new Date() }).where(eq(deploys.id, deploy.id));
      await notify(site.id, null, "deploy", `${author.name} hat „${message}“ veröffentlicht`, "/history");
    } catch (error) {
      const err = error as Error & { log?: string };
      await setStep(current, "failed", err.log ?? err.message);
      await db.update(deploys).set({ status: "failed", finishedAt: new Date() }).where(eq(deploys.id, deploy.id));
      await notify(site.id, author.id, "deploy", `Veröffentlichen fehlgeschlagen: ${err.message}`, "/history");
    }
  });

  return deploy.id;
}

export { DRAFT_BRANCH };

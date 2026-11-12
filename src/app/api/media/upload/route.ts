import path from "node:path";
import { revalidatePath } from "next/cache";
import { commit, withSiteLock } from "@/server/git";
import { moveToFolder, saveUpload } from "@/server/media";
import { ForbiddenError, getWorkspace } from "@/server/sites";

/** Multipart upload of one or more files into the site's media folder. */
export async function POST(request: Request) {
  try {
    const ws = await getWorkspace("editor");
    const form = await request.formData();
    const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
    if (files.length === 0) return Response.json({ ok: false, error: "Keine Datei ausgewählt." }, { status: 400 });
    const saved = await withSiteLock(ws.site.id, async () => {
      const result: { name: string; value: string; location: string }[] = [];
      for (const file of files) result.push(await saveUpload(ws.site, ws.user.id, ws.dir, ws.config, file));
      // Files in object storage are live right away; only repository files are committed.
      const inRepo = result.filter((r) => r.location === "repo").map((r) => r.name);
      if (inRepo.length > 0) {
        await commit(
          ws.dir,
          inRepo.length === 1 ? `Bild „${inRepo[0]}“ hochgeladen` : `${inRepo.length} Dateien hochgeladen`,
          { name: ws.user.name, email: ws.user.email },
          inRepo.map((n) => path.posix.join(ws.config.media.dir, n)),
        );
      }
      return result;
    });
    // Uploaded into an open folder of the media library.
    const folder = form.get("folder");
    if (typeof folder === "string" && folder.trim()) await moveToFolder(ws.site.id, saved.map((s) => s.name), folder);
    revalidatePath("/", "layout");
    return Response.json({ ok: true, names: saved.map((s) => s.name), values: saved.map((s) => s.value) });
  } catch (error) {
    const status = error instanceof ForbiddenError ? 403 : 400;
    return Response.json({ ok: false, error: (error as Error).message }, { status });
  }
}

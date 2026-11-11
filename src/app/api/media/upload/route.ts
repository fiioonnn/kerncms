import path from "node:path";
import { revalidatePath } from "next/cache";
import { commit, withSiteLock } from "@/server/git";
import { saveUpload } from "@/server/media";
import { ForbiddenError, getWorkspace } from "@/server/sites";

/** Multipart upload of one or more files into the site's media folder. */
export async function POST(request: Request) {
  try {
    const ws = await getWorkspace("editor");
    const form = await request.formData();
    const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
    if (files.length === 0) return Response.json({ ok: false, error: "Keine Datei ausgewählt." }, { status: 400 });
    const names = await withSiteLock(ws.site.id, async () => {
      const saved: string[] = [];
      for (const file of files) saved.push(await saveUpload(ws.site.id, ws.user.id, ws.dir, ws.config, file));
      await commit(
        ws.dir,
        saved.length === 1 ? `Bild „${saved[0]}“ hochgeladen` : `${saved.length} Dateien hochgeladen`,
        { name: ws.user.name, email: ws.user.email },
        saved.map((n) => path.posix.join(ws.config.media.dir, n)),
      );
      return saved;
    });
    revalidatePath("/", "layout");
    return Response.json({ ok: true, names });
  } catch (error) {
    const status = error instanceof ForbiddenError ? 403 : 400;
    return Response.json({ ok: false, error: (error as Error).message }, { status });
  }
}

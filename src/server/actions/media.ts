"use server";

import { revalidatePath } from "next/cache";
import path from "node:path";
import { run } from "../action";
import { commit, withSiteLock } from "../git";
import { editImage, type ImageEdit, type MediaMetaInput, moveMediaToTrash, updateMediaMeta } from "../media";
import { getWorkspace } from "../sites";

export async function saveMediaMeta(name: string, input: MediaMetaInput) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    await updateMediaMeta(ws.site.id, name, input);
    revalidatePath("/media");
    return null;
  });
}

export async function saveImageEdit(name: string, edit: ImageEdit) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    return withSiteLock(ws.site.id, async () => {
      const saved = await editImage(ws.site.id, ws.user.id, ws.dir, ws.config, name, edit);
      await commit(ws.dir, `Bild „${saved}“ bearbeitet`, { name: ws.user.name, email: ws.user.email }, [
        path.posix.join(ws.config.media.dir, saved),
      ]);
      revalidatePath("/", "layout");
      return { name: saved };
    });
  });
}

export async function deleteMedia(names: string[]) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    return withSiteLock(ws.site.id, async () => {
      for (const name of names) await moveMediaToTrash(ws.site.id, ws.user.id, ws.dir, ws.config, name);
      await commit(
        ws.dir,
        names.length === 1 ? `Bild „${names[0]}“ gelöscht` : `${names.length} Dateien gelöscht`,
        { name: ws.user.name, email: ws.user.email },
        names.map((n) => path.posix.join(ws.config.media.dir, n)),
      );
      revalidatePath("/", "layout");
      return null;
    });
  });
}

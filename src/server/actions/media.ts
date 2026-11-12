"use server";

import { revalidatePath } from "next/cache";
import path from "node:path";
import { run } from "../action";
import { commit, withSiteLock } from "../git";
import { duplicateMedia as copyMedia, editImage, type ImageEdit, type MediaMetaInput, moveMediaToTrash, updateMediaMeta } from "../media";
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
      if (saved.location === "repo") {
        await commit(ws.dir, `Bild „${saved.name}“ bearbeitet`, { name: ws.user.name, email: ws.user.email }, [
          path.posix.join(ws.config.media.dir, saved.name),
        ]);
      }
      revalidatePath("/", "layout");
      return { name: saved.name };
    });
  });
}

export async function duplicateMedia(name: string) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    return withSiteLock(ws.site.id, async () => {
      const saved = await copyMedia(ws.site.id, ws.user.id, ws.dir, ws.config, name);
      if (saved.location === "repo") {
        await commit(ws.dir, `Bild „${name}“ dupliziert`, { name: ws.user.name, email: ws.user.email }, [
          path.posix.join(ws.config.media.dir, saved.name),
        ]);
      }
      revalidatePath("/", "layout");
      return { name: saved.name };
    });
  });
}

export async function deleteMedia(names: string[]) {
  return run(async () => {
    const ws = await getWorkspace("editor");
    return withSiteLock(ws.site.id, async () => {
      const inRepo: string[] = [];
      for (const name of names) {
        if ((await moveMediaToTrash(ws.site.id, ws.user.id, ws.dir, ws.config, name)) === "repo") inRepo.push(name);
      }
      if (inRepo.length > 0) {
        await commit(
          ws.dir,
          inRepo.length === 1 ? `Bild „${inRepo[0]}“ gelöscht` : `${inRepo.length} Dateien gelöscht`,
          { name: ws.user.name, email: ws.user.email },
          inRepo.map((n) => path.posix.join(ws.config.media.dir, n)),
        );
      }
      revalidatePath("/", "layout");
      return null;
    });
  });
}

import { cache } from "react";
import { getPageForEditor } from "@/server/queries";
import { Editor } from "./editor";
import { editorTitle } from "./title";

/** Shared by metadata and page. */
const load = cache((requested: string | null) => getPageForEditor(requested));
const requestedOf = (param: string | string[] | undefined) => (typeof param === "string" ? param : null);

export async function generateMetadata({ searchParams }: PageProps<"/editor">) {
  const { page } = await load(requestedOf((await searchParams).page));
  return { title: editorTitle(page?.title) };
}

/** `?page=` is a file name (`ueber-uns`) or a URL path (`/ueber-uns`); without it the start page opens. */
export default async function EditorPage({ searchParams }: PageProps<"/editor">) {
  const requested = requestedOf((await searchParams).page);
  const { pages, name, page } = await load(requested);
  return <Editor pages={pages} name={name} page={page} requested={requested} />;
}

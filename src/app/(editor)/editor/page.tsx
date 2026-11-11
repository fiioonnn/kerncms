import { getPageForEditor } from "@/server/queries";
import { Editor } from "./editor";

/** `?page=` is a file name (`ueber-uns`) or a URL path (`/ueber-uns`); without it the start page opens. */
export default async function EditorPage({ searchParams }: PageProps<"/editor">) {
  const { page: param } = await searchParams;
  const requested = typeof param === "string" ? param : null;
  const { pages, name, page } = await getPageForEditor(requested);
  return <Editor pages={pages} name={name} page={page} requested={requested} />;
}

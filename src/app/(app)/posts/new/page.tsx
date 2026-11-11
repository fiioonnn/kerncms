import { redirect } from "next/navigation";

export default function NewPostPage() {
  redirect("/collections/posts/new");
}

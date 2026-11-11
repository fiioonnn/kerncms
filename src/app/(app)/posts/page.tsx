import { redirect } from "next/navigation";

/** Posts are the `posts` collection now. */
export default function PostsPage() {
  redirect("/collections/posts");
}

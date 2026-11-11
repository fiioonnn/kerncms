import { Mark, mergeAttributes } from "@tiptap/react";
import type { MarkDef } from "@/lib/kern-types";

/** Fallback when no site config is loaded (styleguide demos). */
export const defaultMarks: MarkDef[] = [{ id: "accent", label: "Akzent", class: "text-accent" }];

/** How the CMS shows a site mark. The real look comes from the site's CSS; here the n-th mark gets the n-th style. */
export const markPreviewClasses = [
  "text-accent",
  "bg-warning-soft box-decoration-clone px-0.5 rounded-sm",
  "underline decoration-wavy decoration-accent decoration-2 underline-offset-4",
  "font-semibold italic",
];

export function markPreviewClass(marks: MarkDef[], id: string) {
  const index = marks.findIndex((m) => m.id === id);
  return markPreviewClasses[Math.max(0, index) % markPreviewClasses.length];
}

/** One Tiptap mark per configured site mark, stored as <span class="…">. */
export function createMarkExtensions(marks: MarkDef[]) {
  return marks.map((mark, index) =>
    Mark.create({
      name: `kern-${mark.id}`,
      excludes: "_",
      parseHTML() {
        return [{ tag: `span.${CSS.escape(mark.class.split(" ")[0])}` }];
      },
      renderHTML({ HTMLAttributes }) {
        return [
          "span",
          mergeAttributes(HTMLAttributes, {
            class: mark.class,
            "data-kern-mark": String(index % 4),
          }),
          0,
        ];
      },
    }),
  );
}

/** Removes CMS-only attributes before saving. */
export function cleanMarkHtml(html: string) {
  return html.replace(/\s+data-kern-mark="[^"]*"/g, "");
}

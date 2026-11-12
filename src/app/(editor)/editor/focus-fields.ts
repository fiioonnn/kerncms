import type { FieldDef } from "@/lib/kern-types";
import { getAt, stripHtml } from "./paths";

/*
 * When something is clicked in the preview (e.g. a button), the sidebar shows only the
 * fields that belong to it: the button's text and link, an image and its description,
 * or the fields of one list item.
 */

export type FocusGroup = {
  /** "Button", "Bild", or the field's label. */
  title: string;
  /** Where it sits, e.g. "Kacheln · Brot" for a list item; null on the block itself. */
  context: string | null;
  fields: { def: FieldDef; path: string }[];
};

/** "buttonLabel" → "button", "imageAlt" → "image", "headline" → "headline". */
const stem = (name: string) => name.match(/^[a-z0-9]+/)?.[0] ?? name;

function groupTitle(group: FieldDef[]) {
  const s = stem(group[0].name).toLowerCase();
  if (group.length === 1) return group[0].label;
  if (group.some((f) => f.type === "image") || /^(image|bild|foto|photo)$/.test(s)) return "Bild";
  if (group.some((f) => f.type === "link")) return /^(button|cta)$/.test(s) ? "Button" : "Link";
  return group[0].label;
}

export function focusGroup(fields: FieldDef[], block: unknown, path: string): FocusGroup | null {
  const parts = path.split(".");
  let level = fields;
  let prefix = "";
  let context: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    const def = level.find((f) => f.name === parts[i]);
    if (!def) return null;
    const index = Number(parts[i + 1]);
    // Into a list item: tiles.0.title → the fields of tiles[0].
    if (def.type === "list" && def.fields && Number.isInteger(index) && i + 2 < parts.length) {
      const itemPath = `${prefix}${def.name}.${index}`;
      const item = getAt(block, itemPath) as Record<string, unknown> | undefined;
      const name = def.itemLabel ? stripHtml(item?.[def.itemLabel]) : "";
      context = `${def.label} · ${name || `Eintrag ${index + 1}`}`;
      prefix = `${itemPath}.`;
      level = def.fields;
      i++;
      continue;
    }
    // A leaf: it and its siblings with the same stem (buttonLabel + buttonLink).
    const group = level.filter((f) => f.type !== "list" && f.type !== "blocks" && stem(f.name) === stem(def.name));
    const members = group.length > 0 ? group : [def];
    return {
      title: groupTitle(members),
      context,
      fields: members.map((f) => ({ def: f, path: `${prefix}${f.name}` })),
    };
  }
  return null;
}

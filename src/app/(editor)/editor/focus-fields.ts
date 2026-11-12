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
    // A list item (tiles.0) or something inside it (tiles.0.title): the whole item,
    // e.g. a tile's title, image and link, unless the path goes into a nested list item.
    if (def.type === "list" && def.fields && parts[i + 1] !== undefined && Number.isInteger(index)) {
      const itemPath = `${prefix}${def.name}.${index}`;
      const item = getAt(block, itemPath) as Record<string, unknown> | undefined;
      const name = def.itemLabel ? stripHtml(item?.[def.itemLabel]) : "";
      const inner = def.fields.find((f) => f.name === parts[i + 2]);
      const nested = inner?.type === "list" && parts[i + 3] !== undefined && Number.isInteger(Number(parts[i + 3]));
      if (nested) {
        context = `${def.label} · ${name || `Eintrag ${index + 1}`}`;
        prefix = `${itemPath}.`;
        level = def.fields;
        i++;
        continue;
      }
      const count = Array.isArray(getAt(block, `${prefix}${def.name}`)) ? (getAt(block, `${prefix}${def.name}`) as unknown[]).length : 0;
      return {
        title: name || `Eintrag ${index + 1}`,
        context: count > 0 ? `${def.label} · ${index + 1} von ${count}` : def.label,
        fields: def.fields.filter((f) => f.type !== "blocks").map((f) => ({ def: f, path: `${itemPath}.${f.name}` })),
      };
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

/* Types shared by server and client: the parsed kern.config.yaml and the content it describes. */

export type FieldType =
  | "text"
  | "email"
  | "textarea"
  | "inline"
  | "richtext"
  | "number"
  | "boolean"
  | "select"
  | "date"
  | "image"
  | "link"
  | "tags"
  | "list"
  | "blocks";

export type FieldDef = {
  name: string;
  type: FieldType;
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  suffix?: string;
  min?: number;
  max?: number;
  options?: { label: string; value: string }[];
  /** For `list`: the fields of each item. */
  fields?: FieldDef[];
  /** For `list`: which item field labels an item. */
  itemLabel?: string;
};

export type BlockDef = {
  type: string;
  label: string;
  description: string;
  icon: string;
  fields: FieldDef[];
  /** Content the block shows from elsewhere, e.g. the entries of a collection or a global. */
  source: { kind: "collection" | "global"; key: string } | null;
};

export type CollectionDef = {
  key: string;
  label: string;
  singular: string;
  description: string;
  icon: string;
  path: string;
  format: "md" | "json";
  titleField: string;
  listFields: string[];
  fields: FieldDef[];
};

export type GlobalDef = { key: string; label: string; description: string; icon: string; path: string; fields: FieldDef[] };

export type FormDef = { key: string; label: string; fields: FieldDef[] };

export type MarkDef = { id: string; label: string; class: string };

export type KernConfig = {
  site: { id: string; name: string; url: string };
  branch: string;
  preview: { command: string };
  build: { command: string };
  media: { dir: string };
  marks: MarkDef[];
  pages: { label: string; path: string };
  blocks: BlockDef[];
  collections: CollectionDef[];
  globals: GlobalDef[];
  forms: FormDef[];
  redirects: string | null;
};

export type LinkValue = { type: "page"; path: string } | { type: "external"; url: string; newTab: boolean };

export type BlockData = { id: string; type: string; [field: string]: unknown };

export type PageSeo = { title?: string; description?: string; image?: string; noindex?: boolean };

export type PageData = { title: string; path: string; seo: PageSeo; blocks: BlockData[]; [extra: string]: unknown };

/** Status of a file relative to the live site. */
export type ContentStatus = "live" | "draft" | "new" | "unsaved";

export type PageSummary = {
  file: string;
  name: string;
  title: string;
  path: string;
  status: ContentStatus;
  blocks: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type EntryValues = Record<string, unknown>;

export type EntrySummary = {
  id: string;
  file: string;
  values: EntryValues;
  status: ContentStatus;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type MediaItem = {
  name: string;
  /** URL the CMS can show it from. */
  src: string;
  /** Value stored in content (e.g. /media/x.jpg or https://…). */
  value: string;
  /** Where the file is stored. */
  location: "repo" | "cms" | "s3";
  size: number;
  width: number | null;
  height: number | null;
  type: string;
  alt: string;
  caption: string;
  focusX: number;
  focusY: number;
  tags: string[];
  usedIn: string[];
  status: ContentStatus;
  updatedAt: string;
};

export type Redirect = { from: string; to: string; status: 301 | 302 };

export const roleLabels = { owner: "Inhaber", admin: "Admin", editor: "Redakteur", viewer: "Betrachter" } as const;
export type RoleName = keyof typeof roleLabels;

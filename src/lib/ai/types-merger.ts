export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "boolean"
  | "image"
  | "date"
  | { type: "select"; options: string[] }
  | ["text"]
  | ["number"]
  | [Record<string, unknown>]; // repeater: [{ field: FieldType, ... }]

export type TypesFile = {
  content: Record<string, Record<string, Record<string, FieldType>>>;
  globals: Record<string, Record<string, FieldType>>;
};

const IMAGE_EXT = /\.(jpe?g|png|gif|svg|webp|avif|bmp|ico)$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MARKDOWN_HINT = /(^|\n)#{1,6}\s|\*\*[^*]+\*\*|\n{2,}|\n-\s|\n>\s/;
const SELECT_KEY_HINT = /kategorie|status|typ|rolle|priority/i;
const IMAGE_KEY_HINT = /bild|foto|image|photo|logo/i;
const DATE_KEY_HINT = /datum|date|\bat$/i;

/** Infer a kern field type from an extracted string value and its key name. */
export function inferFieldType(value: string, key: string): FieldType {
  if (IMAGE_EXT.test(value)) return "image";
  if (ISO_DATE.test(value)) return "date";
  if (MARKDOWN_HINT.test(value)) return "richtext";
  if (value.includes("\n") || value.length >= 100) return "textarea";
  // Key-name fallbacks (only when value inference gave plain "text")
  if (IMAGE_KEY_HINT.test(key)) return "image";
  if (DATE_KEY_HINT.test(key)) return "date";
  if (SELECT_KEY_HINT.test(key)) return { type: "select", options: [] };
  return "text";
}

type RepeaterSchema = [Record<string, FieldType | RepeaterSchema>];
type SchemaValue = FieldType | RepeaterSchema;

/** Infer a kern field type from any JSON value + key name. */
export function inferValueType(value: unknown, key: string): SchemaValue {
  if (value === null || value === undefined) {
    if (IMAGE_KEY_HINT.test(key)) return "image";
    if (DATE_KEY_HINT.test(key)) return "date";
    return "text";
  }
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return inferFieldType(value, key);
  if (Array.isArray(value)) {
    if (value.length === 0) return ["text"];
    const first = value[0];
    if (typeof first === "object" && first !== null && !Array.isArray(first)) {
      const shape: Record<string, SchemaValue> = {};
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          for (const [k, v] of Object.entries(item)) {
            if (!(k in shape)) shape[k] = inferValueType(v, k);
          }
        }
      }
      return [shape] as RepeaterSchema;
    }
    if (typeof first === "number") return ["number"];
    return ["text"];
  }
  return "text";
}

/**
 * Build a complete schema for a JSON data object by inferring each field's type.
 */
export function inferSchema(data: Record<string, unknown>): Record<string, SchemaValue> {
  const schema: Record<string, SchemaValue> = {};
  for (const [key, value] of Object.entries(data)) {
    schema[key] = inferValueType(value, key);
  }
  return schema;
}

/** Parse an existing types.json string; returns an empty scaffold on failure. */
export function parseTypesFile(raw: string | null): TypesFile {
  if (!raw) return { content: {}, globals: {} };
  try {
    const parsed = JSON.parse(raw);
    return {
      content: parsed.content ?? {},
      globals: parsed.globals ?? {},
    };
  } catch {
    return { content: {}, globals: {} };
  }
}

export type TypeAddition =
  | { kind: "content"; page: string; section: string; key: string; value: unknown }
  | { kind: "global"; group: string; key: string; value: unknown };

/**
 * Merge additions into an existing types file.
 * Never overwrites an existing field type (user may have tuned it).
 * Returns the merged file and the count of fields actually added.
 */
export function mergeTypes(
  existing: TypesFile,
  additions: TypeAddition[],
): { types: TypesFile; added: number } {
  const next: TypesFile = {
    content: structuredClone(existing.content),
    globals: structuredClone(existing.globals),
  };
  let added = 0;
  for (const a of additions) {
    const inferred = inferValueType(a.value, a.key) as FieldType;
    if (a.kind === "content") {
      const page = (next.content[a.page] ??= {});
      const section = (page[a.section] ??= {});
      if (!(a.key in section)) {
        section[a.key] = inferred;
        added++;
      }
    } else {
      const group = (next.globals[a.group] ??= {});
      if (!(a.key in group)) {
        group[a.key] = inferred;
        added++;
      }
    }
  }
  return { types: next, added };
}

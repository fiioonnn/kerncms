export interface ValidationError {
  type: "missing_field" | "type_mismatch" | "unknown_field" | "syntax_error";
  path: string;
  expected?: string;
  actual?: string;
  fix: unknown;
}

export function tryFixJsonSyntax(content: string): string | null {
  try {
    let fixed = content
      .replace(/,(\s*[}\]])/g, "$1")
      .replace(/'/g, '"')
      .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3')
      .replace(/("[^"]*"\s*:\s*[^,{\[\n]+)\n(\s*")/g, "$1,\n$2");

    JSON.parse(fixed);
    return fixed;
  } catch {
    return null;
  }
}

export function validateJsonSyntax(
  content: string,
): { valid: boolean; error?: string; fixed?: string } {
  try {
    JSON.parse(content);
    return { valid: true };
  } catch (e) {
    const fixed = tryFixJsonSyntax(content);
    if (fixed) {
      return { valid: false, error: (e as Error).message, fixed };
    }
    return { valid: false, error: (e as Error).message };
  }
}

function getBaseType(schemaType: unknown): string {
  if (typeof schemaType === "string") {
    if (["text", "textarea", "richtext", "image", "date"].includes(schemaType)) return "string";
    if (schemaType === "number") return "number";
    if (schemaType === "boolean") return "boolean";
  }
  if (Array.isArray(schemaType)) return "array";
  if (typeof schemaType === "object" && schemaType !== null) {
    const s = schemaType as Record<string, unknown>;
    if (s.type === "select") return "string";
    return "object";
  }
  return "unknown";
}

function getActualType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function getDefaultValue(schemaType: unknown): unknown {
  if (typeof schemaType === "string") {
    if (["text", "textarea", "richtext", "image", "date"].includes(schemaType)) return "";
    if (schemaType === "number") return 0;
    if (schemaType === "boolean") return false;
  }
  if (Array.isArray(schemaType)) return [];
  if (typeof schemaType === "object" && schemaType !== null) {
    const s = schemaType as Record<string, unknown>;
    if (s.type === "select") return "";
  }
  return null;
}

function coerceValue(value: unknown, schemaType: unknown): unknown {
  if (schemaType === "number") {
    const n = Number(value);
    return isNaN(n) ? 0 : n;
  }
  if (schemaType === "boolean") return Boolean(value);
  if (schemaType === "text" || schemaType === "textarea" || schemaType === "richtext") {
    return String(value ?? "");
  }
  return getDefaultValue(schemaType);
}

export function validateAgainstSchema(
  data: Record<string, unknown>,
  schema: Record<string, unknown>,
  options: { fixMissing: boolean; fixTypes: boolean; removeUnknown: boolean },
  path = "",
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [key, schemaType] of Object.entries(schema)) {
    const value = data[key];
    const fieldPath = path ? `${path}.${key}` : key;

    if (value === undefined) {
      if (options.fixMissing) {
        errors.push({
          type: "missing_field",
          path: fieldPath,
          expected: String(schemaType),
          fix: getDefaultValue(schemaType),
        });
      }
      continue;
    }

    const expectedType = getBaseType(schemaType);
    const actualType = getActualType(value);

    if (expectedType !== "unknown" && expectedType !== actualType && actualType !== "null") {
      if (options.fixTypes) {
        errors.push({
          type: "type_mismatch",
          path: fieldPath,
          expected: expectedType,
          actual: actualType,
          fix: coerceValue(value, schemaType),
        });
      }
    }

    if (
      Array.isArray(schemaType) &&
      typeof schemaType[0] === "object" &&
      Array.isArray(value)
    ) {
      value.forEach((item, i) => {
        if (typeof item === "object" && item !== null) {
          const itemErrors = validateAgainstSchema(
            item as Record<string, unknown>,
            schemaType[0] as Record<string, unknown>,
            options,
            `${fieldPath}[${i}]`,
          );
          errors.push(...itemErrors);
        }
      });
    }
  }

  if (options.removeUnknown) {
    for (const key of Object.keys(data)) {
      if (key === "$schema") continue;
      if (!(key in schema)) {
        const fieldPath = path ? `${path}.${key}` : key;
        errors.push({
          type: "unknown_field",
          path: fieldPath,
          actual: String(typeof data[key]),
          fix: undefined,
        });
      }
    }
  }

  return errors;
}

export function applyFixes(
  data: Record<string, unknown>,
  errors: ValidationError[],
): Record<string, unknown> {
  const fixed = structuredClone(data);

  for (const error of errors) {
    if (error.type === "unknown_field") {
      const parts = error.path.replace(/\[(\d+)\]/g, ".$1").split(".");
      let obj: Record<string, unknown> = fixed;
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]] as Record<string, unknown>;
        if (!obj) break;
      }
      if (obj) delete obj[parts[parts.length - 1]];
      continue;
    }

    const parts = error.path.replace(/\[(\d+)\]/g, ".$1").split(".");
    let obj: Record<string, unknown> = fixed;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]] as Record<string, unknown>;
      if (!obj) break;
    }
    if (obj) {
      obj[parts[parts.length - 1]] = error.fix;
    }
  }

  return fixed;
}

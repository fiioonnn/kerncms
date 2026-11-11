import "server-only";
import sanitizeHtml from "sanitize-html";
import type { FieldDef, MarkDef } from "@/lib/kern-types";

function markClasses(marks: MarkDef[]) {
  return marks.map((m) => m.class).filter(Boolean);
}

export function sanitizeInline(html: string, marks: MarkDef[]) {
  return sanitizeHtml(html, {
    allowedTags: ["span", "br"],
    allowedAttributes: { span: ["class"] },
    allowedClasses: { span: markClasses(marks) },
  })
    .replace(/<span>([\s\S]*?)<\/span>/g, "$1")
    .replace(/<br \/>/g, "<br>")
    .trim();
}

export function sanitizeRichtext(html: string, marks: MarkDef[]) {
  return sanitizeHtml(html, {
    allowedTags: ["p", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "b", "i", "u", "s", "a", "blockquote", "br", "code", "span"],
    allowedAttributes: { a: ["href", "target", "rel"], span: ["class"] },
    allowedClasses: { span: markClasses(marks) },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: attribs.target === "_blank" ? { ...attribs, rel: "noopener noreferrer" } : attribs,
      }),
    },
  })
    .replace(/<br \/>/g, "<br>")
    .trim();
}

/** Cleans every inline/richtext value in an object according to its field definitions. */
export function sanitizeValues(fields: FieldDef[], values: Record<string, unknown>, marks: MarkDef[]) {
  const out: Record<string, unknown> = { ...values };
  for (const field of fields) {
    const value = values[field.name];
    if (value === undefined) continue;
    if (field.type === "inline" && typeof value === "string") out[field.name] = sanitizeInline(value, marks);
    else if (field.type === "richtext" && typeof value === "string") out[field.name] = sanitizeRichtext(value, marks);
    else if (field.type === "number") out[field.name] = value === "" || value === null ? null : Number(value);
    else if (field.type === "list" && Array.isArray(value) && field.fields) {
      out[field.name] = value.map((item) =>
        typeof item === "object" && item !== null ? sanitizeValues(field.fields!, item as Record<string, unknown>, marks) : item,
      );
    }
  }
  return out;
}

function isEmpty(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return sanitizeHtml(value, { allowedTags: [] }).trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Returns field name → German error message for missing or invalid values. */
export function validateValues(fields: FieldDef[], values: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (field.required && field.type === "boolean") {
      if (value !== true && value !== "true" && value !== "on") errors[field.name] = "Bitte bestätige dieses Feld.";
      continue;
    }
    if (field.required && isEmpty(value)) {
      errors[field.name] = `${field.label} darf nicht leer sein.`;
      continue;
    }
    if (isEmpty(value)) continue;
    if (field.type === "email" && typeof value === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors[field.name] = "Bitte gib eine gültige E-Mail-Adresse ein.";
    }
    if (field.type === "number") {
      const n = Number(value);
      if (Number.isNaN(n)) errors[field.name] = `${field.label} muss eine Zahl sein.`;
      else if (field.min !== undefined && n < field.min) errors[field.name] = `Mindestens ${field.min}.`;
      else if (field.max !== undefined && n > field.max) errors[field.name] = `Höchstens ${field.max}.`;
    }
    if (field.type === "date" && typeof value === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors[field.name] = "Bitte wähle ein Datum.";
    }
    if (field.type === "select" && field.options && !field.options.some((o) => o.value === value)) {
      errors[field.name] = "Bitte wähle eine der Optionen.";
    }
  }
  return errors;
}

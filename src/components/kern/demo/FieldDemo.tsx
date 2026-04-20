"use client";

import { useState } from "react";
import { FieldRenderer } from "../FieldRenderer";

const INITIAL_DATA: Record<string, unknown> = {
  page_title: "Willkommen bei Kern",
  beschreibung: "Das ist eine längere\nBeschreibung über mehrere Zeilen.",
  inhalt: "## Überschrift\n\nDas ist **fett** und *kursiv*.",
  besucher: 1234,
  aktiv: true,
  bild: null,
  datum: "2026-04-15",
  kategorie: "trockenbau",
  tags: ["cms", "git", "astro"],
  reviews: [
    { author: "Alice", comment: "Super!", rating: 5 },
    { author: "Bob", comment: "Gut.", rating: 4 },
  ],
};

const SCHEMA: Record<string, unknown> = {
  page_title: "text",
  beschreibung: "textarea",
  inhalt: "richtext",
  besucher: "number",
  aktiv: "boolean",
  bild: "image",
  datum: { type: "date", format: "DD.MM.YYYY" },
  kategorie: {
    type: "select",
    options: ["allgemein", "trockenbau", "schimmelsanierung"],
  },
  tags: ["text"],
  reviews: [
    { author: "text", comment: "textarea", rating: "number" },
  ],
};

export function FieldDemo() {
  const [data, setData] = useState<Record<string, unknown>>(INITIAL_DATA);

  function handleChange(key: string, value: unknown) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="flex flex-col gap-1 mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Field Components</h1>
        <p className="text-sm text-muted-foreground">
          All 10 field types rendered from schema + data.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {Object.entries(SCHEMA).map(([key, schemaValue]) => (
          <FieldRenderer
            key={key}
            fieldKey={key}
            value={data[key]}
            schemaValue={schemaValue}
            onChange={(v) => handleChange(key, v)}
          />
        ))}
      </div>

      <div className="mt-10 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-input overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-input">
            <span className="text-xs font-mono font-medium">content.json</span>
            <span className="text-[10px] font-mono text-muted-foreground">Live Data</span>
          </div>
          <pre className="px-3 py-3 text-xs text-muted-foreground overflow-auto max-h-[500px] font-mono">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
        <div className="rounded-lg border border-input overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-input">
            <span className="text-xs font-mono font-medium">content.kern.json</span>
            <span className="text-[10px] font-mono text-muted-foreground">Type Schema</span>
          </div>
          <pre className="px-3 py-3 text-xs text-muted-foreground overflow-auto max-h-[500px] font-mono">
            {JSON.stringify(SCHEMA, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

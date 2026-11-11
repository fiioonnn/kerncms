import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { formSubmissions } from "@/db/schema";
import { getWorkspace } from "@/server/sites";

function csvCell(value: string) {
  return /[";\n,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function GET(request: Request) {
  const ws = await getWorkspace("editor");
  const formKey = new URL(request.url).searchParams.get("form");
  const form = ws.config.forms.find((f) => f.key === formKey) ?? ws.config.forms[0];
  if (!form) return new Response("Kein Formular", { status: 404 });
  const rows = await db
    .select()
    .from(formSubmissions)
    .where(and(eq(formSubmissions.siteId, ws.site.id), eq(formSubmissions.form, form.key)))
    .orderBy(desc(formSubmissions.createdAt));
  const header = ["Eingegangen", ...form.fields.map((f) => f.label), "Seite"];
  const lines = rows.map((row) =>
    [row.createdAt.toISOString(), ...form.fields.map((f) => row.data[f.name] ?? ""), row.page ?? ""].map(csvCell).join(";"),
  );
  // BOM so Excel opens umlauts correctly.
  const csv = "﻿" + [header.map(csvCell).join(";"), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${form.key}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

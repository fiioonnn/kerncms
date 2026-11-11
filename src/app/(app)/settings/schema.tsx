import { Blocks, Database, FileCode, Globe, Inbox, type LucideIcon } from "lucide-react";
import { CodeBlock } from "@/components/schema/code-block";
import { Badge, Card, CardContent, CardHeader } from "@/components/ui/display";
import type { KernConfig } from "@/lib/kern-types";

type Entry = { key: string; label: string; path?: string; fields: number; description?: string };

export function Schema({ config, source, file }: { config: KernConfig; source: string; file: string }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Konfiguration"
          description="Legt fest, welche Inhalte im CMS bearbeitbar sind. Geändert wird sie im Repository; das CMS liest sie bei jedem Aufruf neu."
          action={<Badge tone="success" dot>Gültig</Badge>}
        />
        <CardContent>
          <CodeBlock code={source} filename={file} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <SchemaList
          title="Bausteine"
          description="Blöcke, aus denen Seiten bestehen."
          icon={Blocks}
          items={config.blocks.map((b) => ({ key: b.type, label: b.label, fields: b.fields.length, description: b.description }))}
        />
        <SchemaList
          title="Inhalte"
          description="Listen gleichartiger Einträge."
          icon={Database}
          items={config.collections.map((c) => ({ key: c.key, label: c.label, path: c.path, fields: c.fields.length }))}
        />
        <SchemaList
          title="Globals"
          description="Einzelne Datensätze für die ganze Website."
          icon={Globe}
          items={config.globals.map((g) => ({ key: g.key, label: g.label, path: g.path, fields: g.fields.length }))}
        />
        <SchemaList
          title="Formulare"
          description="Formulare, deren Nachrichten im CMS landen."
          icon={Inbox}
          items={config.forms.map((f) => ({ key: f.key, label: f.label, fields: f.fields.length }))}
        />
      </div>
    </div>
  );
}

function SchemaList({ title, description, icon: Icon, items }: { title: string; description: string; icon: LucideIcon; items: Entry[] }) {
  return (
    <Card>
      <CardHeader title={title} description={description} action={<Badge>{items.length}</Badge>} />
      <CardContent className="pt-3">
        {items.length === 0 ? (
          <p className="py-4 text-[15px] text-muted">Keine angelegt.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {items.map((item) => (
              <li key={item.key} className="flex items-center gap-4 py-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-medium">{item.label}</span>
                  {item.path ? (
                    <span className="flex items-center gap-1.5 truncate font-mono text-sm text-muted">
                      <FileCode className="size-3.5 shrink-0" strokeWidth={1.75} />
                      {item.path}
                    </span>
                  ) : (
                    item.description && <span className="truncate text-sm text-muted">{item.description}</span>
                  )}
                </span>
                <span className="shrink-0 text-sm text-muted">
                  {item.fields} {item.fields === 1 ? "Feld" : "Felder"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

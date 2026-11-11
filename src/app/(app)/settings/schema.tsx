"use client";

import { useState } from "react";
import { CircleCheck, Database, FileCode, Globe, Loader2, RefreshCw } from "lucide-react";
import { CodeBlock } from "@/components/schema/code-block";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader } from "@/components/ui/display";
import { toast } from "@/components/ui/toast";
import { detectedCollections, detectedGlobals, kernConfig, kernConfigPath, type SchemaEntry } from "@/lib/example-schema";

export function Schema() {
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState("Heute, 09:42");

  function reload() {
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      setCheckedAt("Gerade eben");
      toast.success("Konfiguration neu eingelesen", {
        description: `${detectedCollections.length} Collections und ${detectedGlobals.length} Globals, keine Fehler.`,
      });
    }, 1200);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Konfiguration"
          description="Legt fest, welche Inhalte im CMS bearbeitbar sind. Änderungen daran erfolgen im Repository."
          action={
            <Button variant="secondary" size="sm" onClick={reload} disabled={checking}>
              {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Neu einlesen
            </Button>
          }
        />
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center gap-4 rounded-xl border border-border bg-subtle/50 px-5 py-4">
            <CircleCheck className="size-6 shrink-0 text-success" strokeWidth={1.75} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-medium">Gültig</span>
              <span className="text-sm text-muted">
                Zuletzt geprüft: {checkedAt} · Commit <code className="font-mono">a3f9c21</code> auf main
              </span>
            </span>
            <Badge tone="success" dot>
              Version 1
            </Badge>
          </div>
          <CodeBlock code={kernConfig} filename={kernConfigPath} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <SchemaList title="Collections" description="Listen gleichartiger Einträge." icon={Database} items={detectedCollections} />
        <SchemaList title="Globals" description="Einzelne Datensätze für die ganze Website." icon={Globe} items={detectedGlobals} />
      </div>
    </div>
  );
}

function SchemaList({
  title,
  description,
  icon: Icon,
  items,
}: {
  title: string;
  description: string;
  icon: typeof Database;
  items: SchemaEntry[];
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} action={<Badge>{items.length}</Badge>} />
      <CardContent className="pt-3">
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-4 py-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                <Icon className="size-5" strokeWidth={1.75} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-medium">
                  {item.label} <span className="font-mono text-sm font-normal text-muted">{item.key}</span>
                </span>
                <span className="flex items-center gap-1.5 truncate font-mono text-sm text-muted">
                  <FileCode className="size-3.5 shrink-0" strokeWidth={1.75} />
                  {item.path}
                </span>
              </span>
              <span className="shrink-0 text-sm text-muted">
                {item.fields} {item.fields === 1 ? "Feld" : "Felder"}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

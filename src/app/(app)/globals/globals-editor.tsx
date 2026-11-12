"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import { Fields } from "@/components/kern/field-renderer";
import { useCan, useKern } from "@/components/kern/kern-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, Card, CardContent, CardHeader } from "@/components/ui/display";
import { toast } from "@/components/ui/toast";
import type { EntryValues, GlobalDef } from "@/lib/kern-types";
import { cn } from "@/lib/utils";
import { saveGlobal } from "@/server/actions/content";

type GlobalItem = { global: GlobalDef; values: EntryValues; updated: string | null; icon: React.ReactNode };

const same = (a: EntryValues, b: EntryValues) => JSON.stringify(a) === JSON.stringify(b);

export function GlobalsEditor({ globals, initialKey }: { globals: GlobalItem[]; initialKey?: string }) {
  const router = useRouter();
  const { config } = useKern();
  const canEdit = useCan("editor");
  const [activeKey, setActiveKey] = useState(
    globals.some((g) => g.global.key === initialKey) ? initialKey! : globals[0].global.key,
  );
  // Saved and edited values per global, so switching tabs keeps unsaved edits.
  const [saved, setSaved] = useState(() => Object.fromEntries(globals.map((g) => [g.global.key, g.values])));
  const [drafts, setDrafts] = useState(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const active = globals.find((g) => g.global.key === activeKey) ?? globals[0];
  const key = active.global.key;
  const isDirty = (k: string) => !same(drafts[k], saved[k]);
  const anyDirty = globals.some((g) => isDirty(g.global.key));

  useEffect(() => {
    if (!anyDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  function select(next: string) {
    setActiveKey(next);
    setErrors({});
    window.history.replaceState(null, "", `?key=${encodeURIComponent(next)}`);
  }

  function save() {
    startTransition(async () => {
      const result = await saveGlobal(key, drafts[key]);
      if (!result.ok) {
        setErrors(result.errors ?? {});
        toast.error("Speichern fehlgeschlagen", { description: result.error });
        return;
      }
      setErrors({});
      setSaved((s) => ({ ...s, [key]: result.data }));
      setDrafts((d) => ({ ...d, [key]: result.data }));
      toast.success(`${active.global.label} gespeichert`, { description: "Die Änderung liegt im Entwurf und gilt auf allen Seiten." });
      router.refresh();
    });
  }

  function reset() {
    setDrafts((d) => ({ ...d, [key]: saved[key] }));
    setErrors({});
    setVersion((v) => v + 1);
    toast.info("Zurückgesetzt");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="h-fit p-2">
        {globals.map(({ global, icon }) => {
          const isActive = global.key === key;
          return (
            <button
              key={global.key}
              type="button"
              onClick={() => select(global.key)}
              className={cn(
                "flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-colors",
                isActive ? "bg-accent-soft" : "hover:bg-subtle",
              )}
            >
              <span className={isActive ? "text-accent" : "text-muted"}>{icon}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("flex items-center gap-2 text-base font-medium", isActive && "text-accent")}>
                  {global.label}
                  {isDirty(global.key) && <span className="size-2 rounded-full bg-warning" aria-label="Ungespeichert" />}
                </span>
                {global.description && <span className="truncate text-sm text-muted">{global.description}</span>}
              </span>
              <ChevronRight className="size-4 text-muted" />
            </button>
          );
        })}
      </Card>

      <Card key={key}>
        <CardHeader
          title={active.global.label}
          description={active.global.description || undefined}
          action={
            isDirty(key) ? (
              <Badge tone="warning" dot>
                Ungespeichert
              </Badge>
            ) : undefined
          }
        />
        <CardContent className="flex flex-col gap-6">
          <fieldset key={version} disabled={!canEdit} className="min-w-0">
            <Fields
              fields={active.global.fields}
              values={drafts[key]}
              errors={errors}
              marks={config.marks}
              onChange={(name, value) => setDrafts((d) => ({ ...d, [key]: { ...d[key], [name]: value } }))}
            />
          </fieldset>
          {canEdit && (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-6">
              <div className="flex gap-3">
                <Button variant="secondary" disabled={!isDirty(key) || pending} onClick={() => setResetOpen(true)}>
                  Zurücksetzen
                </Button>
                <Button disabled={!isDirty(key) || pending} onClick={save}>
                  {pending ? "Speichert…" : "Speichern"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Änderungen zurücksetzen?"
        description={`Alle ungespeicherten Änderungen an „${active.global.label}“ gehen verloren.`}
        confirmLabel="Zurücksetzen"
        danger
        onConfirm={reset}
      />
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { GitCommitHorizontal, Loader2, RotateCcw } from "lucide-react";
import { formatChange } from "@/components/collections/format";
import { useCan, useKern } from "@/components/kern/kern-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, Badge } from "@/components/ui/display";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { restoreVersion } from "@/server/actions/site";

/* ---------- Human labels for repository files ---------- */

export function useFileLabel() {
  const { config, pages } = useKern();
  return (file: string) => {
    const page = pages.find((p) => `${config.pages.path}/${p.name}.json` === file);
    if (page) return `Seite „${page.title}“`;
    const global = config.globals.find((g) => g.path === file);
    if (global) return global.label;
    const collection = config.collections.find((c) => file.startsWith(c.path + "/"));
    if (collection) return `${collection.label}: ${file.slice(collection.path.length + 1).replace(/\.(md|json)$/, "")}`;
    if (file.startsWith(config.media.dir + "/")) return `Medium ${file.split("/").pop()}`;
    return file;
  };
}

/* ---------- Field-level diff (one value before / after) ---------- */

export type Change = { field: string; before?: string; after?: string };

export function Diff({ change }: { change: Change }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-subtle/60 px-4 py-2 text-sm font-medium">{change.field}</div>
      <div className="flex flex-col font-mono text-sm">
        {change.before !== undefined && (
          <div className="flex gap-3 bg-danger-soft px-4 py-2.5 text-danger">
            <span className="select-none">−</span>
            <span className="line-through decoration-danger/40">{change.before}</span>
          </div>
        )}
        {change.after !== undefined && (
          <div className="flex gap-3 bg-success-soft px-4 py-2.5 text-success">
            <span className="select-none">+</span>
            <span>{change.after}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- File diff (line by line) ---------- */

type Op = { type: "same" | "add" | "del"; text: string };

/** Line diff via LCS, after trimming the common start and end. */
export function lineDiff(before: string, after: string): Op[] {
  const a = before ? before.replace(/\n$/, "").split("\n") : [];
  const b = after ? after.replace(/\n$/, "").split("\n") : [];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head: Op[] = a.slice(0, start).map((text) => ({ type: "same", text }));
  const tail: Op[] = a.slice(endA).map((text) => ({ type: "same", text }));
  const x = a.slice(start, endA);
  const y = b.slice(start, endB);
  let middle: Op[];
  if (x.length * y.length > 4_000_000) {
    middle = [...x.map((text) => ({ type: "del" as const, text })), ...y.map((text) => ({ type: "add" as const, text }))];
  } else {
    const n = x.length;
    const m = y.length;
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    middle = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) {
        middle.push({ type: "same", text: x[i] });
        i++;
        j++;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) middle.push({ type: "del", text: x[i++] });
      else middle.push({ type: "add", text: y[j++] });
    }
    while (i < n) middle.push({ type: "del", text: x[i++] });
    while (j < m) middle.push({ type: "add", text: y[j++] });
  }
  return [...head, ...middle, ...tail];
}

const CONTEXT = 2;

/** Changed lines of a file with a little context, in the same style as `Diff`. */
export function FileDiff({ file, before, after, action }: { file: string; before: string; after: string; action?: React.ReactNode }) {
  const ops = lineDiff(before, after);
  const changed = ops.map((op) => op.type !== "same");
  const visible = ops.map((_, i) => changed.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).some(Boolean));
  const hasChanges = changed.some(Boolean);
  const note = !before && after ? "Neu angelegt" : before && !after ? "Gelöscht" : null;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border bg-subtle/60 px-4 py-1.5">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="truncate font-mono">{file}</span>
          {note && <Badge tone={before ? "danger" : "accent"}>{note}</Badge>}
        </span>
        {action}
      </div>
      {!hasChanges ? (
        <p className="px-4 py-3 text-sm text-muted">Keine Unterschiede.</p>
      ) : (
        <div className="max-h-[420px] overflow-auto font-mono text-sm">
          {ops.map((op, i) => {
            if (!visible[i]) return visible[i - 1] ? <div key={i} className="bg-subtle/40 px-4 py-1 text-muted select-none">⋯</div> : null;
            return (
              <div
                key={i}
                className={cn(
                  "flex gap-3 px-4 py-0.5 whitespace-pre-wrap break-all",
                  op.type === "add" && "bg-success-soft text-success",
                  op.type === "del" && "bg-danger-soft text-danger",
                  op.type === "same" && "text-muted",
                )}
              >
                <span className="w-3 shrink-0 select-none">{op.type === "add" ? "+" : op.type === "del" ? "−" : ""}</span>
                <span>{op.text || " "}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Loading diffs from the server ---------- */

export type DiffQuery = { sha: string } | { compare: "unsaved" } | { compare: "live"; head?: string };

function diffUrl(file: string, query: DiffQuery) {
  const params = new URLSearchParams({ file });
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
  return `/api/history/diff?${params}`;
}

type DiffState = { status: "loading" } | { status: "error"; error: string } | { status: "done"; before: string; after: string };

function useDiff(file: string, query: DiffQuery) {
  const url = diffUrl(file, query);
  const [state, setState] = useState<{ url: string; value: DiffState }>({ url, value: { status: "loading" } });
  useEffect(() => {
    let cancelled = false;
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Der Vergleich konnte nicht geladen werden.");
        return body as { before: string; after: string };
      })
      .then(
        (data) => !cancelled && setState({ url, value: { status: "done", ...data } }),
        (error: Error) => !cancelled && setState({ url, value: { status: "error", error: error.message } }),
      );
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state.url === url ? state.value : ({ status: "loading" } as DiffState);
}

/** One file's diff, loaded from the server. With `restoreSha`, offers to restore the file to that version. */
export function RemoteFileDiff({
  file,
  query,
  restoreSha,
  onRestored,
}: {
  file: string;
  query: DiffQuery;
  restoreSha?: string;
  onRestored?: () => void;
}) {
  const state = useDiff(file, query);
  if (state.status === "loading")
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" />
        <span className="font-mono">{file}</span>
      </div>
    );
  if (state.status === "error")
    return (
      <div className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
        <span className="font-mono">{file}</span>: {state.error}
      </div>
    );
  return (
    <FileDiff
      file={file}
      before={state.before}
      after={state.after}
      action={restoreSha && state.after ? <RestoreButton file={file} sha={restoreSha} onRestored={onRestored} /> : undefined}
    />
  );
}

export function RestoreButton({ file, sha, onRestored }: { file: string; sha: string; onRestored?: () => void }) {
  const canEdit = useCan("editor");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!canEdit) return null;

  function restore() {
    startTransition(async () => {
      const result = await restoreVersion(file, sha);
      if (!result.ok) return void toast.error("Wiederherstellen fehlgeschlagen", { description: result.error });
      toast.success("Version wiederhergestellt", { description: "Die Änderung liegt im Entwurf." });
      onRestored?.();
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
        Diese Version wiederherstellen
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Version wiederherstellen?"
        description={`${file} wird auf den Stand von ${sha.slice(0, 7)} zurückgesetzt. Das wird als neue Änderung im Entwurf gespeichert, nichts geht verloren.`}
        confirmLabel="Wiederherstellen"
        onConfirm={restore}
      />
    </>
  );
}

/** Dialog with the diffs of several files. */
export function DiffDialog({
  open,
  onOpenChange,
  title,
  description,
  files,
  query,
  restoreSha,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  files: string[];
  query: DiffQuery;
  restoreSha?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} size="xl">
        {open && (
          <div className="flex flex-col gap-4">
            {files.length === 0 && <p className="text-[15px] text-muted">Keine Dateien geändert.</p>}
            {files.map((file) => (
              <RemoteFileDiff key={file} file={file} query={query} restoreSha={restoreSha} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Version list for one file (used in dialogs, e.g. the editor) ---------- */

type HistoryItem = { sha: string; author: string; date: string; message: string; files: string[]; published: boolean };

/** Saved versions of one file on the left, the selected version's change on the right. */
export function VersionHistory({ file, className }: { file: string; className?: string }) {
  const [state, setState] = useState<{ file: string; items: HistoryItem[] | null; error?: string }>({ file, items: null });
  const [reload, setReload] = useState(0);
  const [selectedSha, setSelectedSha] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/history?file=${encodeURIComponent(file)}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<HistoryItem[]>) : Promise.reject(new Error())))
      .then(
        (items) => !cancelled && setState({ file, items }),
        () => !cancelled && setState({ file, items: [], error: "Der Verlauf konnte nicht geladen werden." }),
      );
    return () => {
      cancelled = true;
    };
  }, [file, reload]);

  const items = state.file === file ? state.items : null;
  if (!items)
    return (
      <div className={cn("flex items-center justify-center gap-2 text-muted", className)}>
        <Loader2 className="size-4 animate-spin" />
        Verlauf wird geladen…
      </div>
    );
  if (items.length === 0)
    return <p className={cn("flex items-center justify-center p-8 text-center text-muted", className)}>{state.error ?? "Noch keine gespeicherten Versionen."}</p>;

  const selected = items.find((v) => v.sha === selectedSha) ?? items[0];

  return (
    <div className={cn("grid min-h-0 md:grid-cols-[320px_minmax(0,1fr)]", className)}>
      <ol className="flex flex-col gap-1 overflow-y-auto border-border p-2 md:border-r">
        {items.map((v) => (
          <li key={v.sha}>
            <button
              type="button"
              onClick={() => setSelectedSha(v.sha)}
              className={cn(
                "flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                v.sha === selected.sha ? "bg-accent-soft" : "hover:bg-subtle",
              )}
            >
              <Avatar name={v.author} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn("truncate text-[15px] font-medium", v.sha === selected.sha && "text-accent")}>{v.message}</span>
                <span suppressHydrationWarning className="truncate text-sm text-muted">
                  {v.author} · {formatChange(v.date)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="flex min-w-0 flex-col gap-5 overflow-y-auto p-6">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight">{selected.message}</h3>
            {selected.published ? (
              <Badge tone="success" dot>
                Live
              </Badge>
            ) : (
              <Badge tone="warning" dot>
                Noch nicht veröffentlicht
              </Badge>
            )}
          </div>
          <span suppressHydrationWarning className="flex items-center gap-2 text-sm text-muted">
            {selected.author} · {formatChange(selected.date)}
            <GitCommitHorizontal className="size-4" />
            <code className="font-mono">{selected.sha.slice(0, 7)}</code>
          </span>
        </div>
        <RemoteFileDiff
          key={selected.sha}
          file={file}
          query={{ sha: selected.sha }}
          restoreSha={selected.sha}
          onRestored={() => {
            setSelectedSha(undefined);
            setReload((r) => r + 1);
          }}
        />
      </div>
    </div>
  );
}

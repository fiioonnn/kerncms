import Link from "next/link";
import { GitCommitHorizontal, History, Rocket } from "lucide-react";
import { dayKey, formatChange, formatDateTime, formatDay, formatRelative } from "@/components/collections/format";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { getHistory, getPendingChanges, type HistoryEntry } from "@/server/queries";
import { CommitFiles, DeployLog, DeployStatusBadge, FileFilterLabel, PendingChanges } from "./history-client";

export const metadata = { title: "Verlauf" };

const PAGE_SIZE = 60;

function duration(start: string, end: string | null) {
  if (!end) return "–";
  const seconds = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const params = await searchParams;
  const file = typeof params.file === "string" && params.file ? params.file : undefined;
  const limit = Math.min(Number(params.limit) || PAGE_SIZE, 1000);

  const [{ history, deploys }, pending] = await Promise.all([getHistory({ file, limit }), getPendingChanges()]);
  const unsaved = file ? pending.unsaved.filter((f) => f === file) : pending.unsaved;
  const unpublished = file ? pending.unpublished.filter((f) => f.file === file) : pending.unpublished;

  const days: { key: string; label: string; commits: HistoryEntry[] }[] = [];
  for (const commit of history) {
    const key = dayKey(commit.date);
    const day = days.at(-1);
    if (day?.key === key) day.commits.push(commit);
    else days.push({ key, label: formatDay(commit.date), commits: [commit] });
  }
  const moreHref = `/history?${new URLSearchParams({ ...(file && { file }), limit: String(limit + PAGE_SIZE) })}`;

  return (
    <PageContainer className="flex flex-col gap-8">
      <div>
        <PageHeader
          title="Verlauf"
          description="Jede gespeicherte Änderung ist eine Version im Repository und lässt sich wiederherstellen."
        />
        {file && <FileFilterLabel file={file} />}
      </div>

      {(unsaved.length > 0 || unpublished.length > 0) && (
        <Card className="overflow-hidden">
          <CardHeader
            title="Noch nicht live"
            description="Diese Änderungen sind noch nicht auf der Website. Mit „Veröffentlichen“ gehen sie live."
            className="pb-4"
          />
          <PendingChanges unsaved={unsaved} unpublished={unpublished} />
        </Card>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Gespeicherte Versionen</h2>
        {days.length === 0 ? (
          <Card>
            <EmptyState
              icon={History}
              title="Noch keine Versionen"
              description={file ? "Für diese Datei gibt es noch keine gespeicherte Version." : "Sobald jemand speichert, erscheint die Änderung hier."}
            />
          </Card>
        ) : (
          days.map((day) => (
            <Card key={day.key} className="overflow-hidden">
              <div className="border-b border-border bg-subtle/60 px-6 py-2.5 text-sm font-medium text-muted">{day.label}</div>
              <ol>
                {day.commits.map((commit) => (
                  <li key={commit.sha} className="flex gap-4 border-b border-border px-6 py-4 last:border-0">
                    <Avatar name={commit.author} size="sm" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-[15px] font-medium">{commit.message}</span>
                        {commit.published ? (
                          <Badge tone="success" dot>
                            Live
                          </Badge>
                        ) : (
                          <Badge tone="warning" dot>
                            Noch nicht veröffentlicht
                          </Badge>
                        )}
                      </div>
                      <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                        <span>{commit.author}</span>·<span title={formatDateTime(commit.date)}>{formatRelative(commit.date)}</span>
                        <GitCommitHorizontal className="size-4" />
                        <code className="font-mono">{commit.sha.slice(0, 7)}</code>
                      </span>
                      {commit.files.length > 0 && <CommitFiles sha={commit.sha} message={commit.message} files={commit.files} />}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          ))
        )}
        {history.length >= limit && (
          <Link href={moreHref} className={buttonStyles({ variant: "secondary", className: "self-center" })} scroll={false}>
            Ältere Versionen laden
          </Link>
        )}
      </section>

      {!file && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Veröffentlichungen</h2>
          <Card>
            {deploys.length === 0 ? (
              <EmptyState icon={Rocket} title="Noch nichts veröffentlicht" description="Jede Veröffentlichung erscheint hier mit ihrem Build-Protokoll." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Status</Th>
                    <Th>Beschreibung</Th>
                    <Th>Zeitpunkt</Th>
                    <Th>Dauer</Th>
                    <Th className="w-0" aria-label="Protokoll" />
                  </tr>
                </thead>
                <tbody>
                  {deploys.map((d) => (
                    <tr key={d.id}>
                      <Td>
                        <DeployStatusBadge status={d.status} />
                      </Td>
                      <Td>
                        <span className="flex flex-col leading-tight">
                          <span>{d.message}</span>
                          {d.commit && <code className="font-mono text-sm text-muted">{d.commit.slice(0, 7)}</code>}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap" title={formatDateTime(d.createdAt)}>
                        {formatChange(d.createdAt)}
                      </Td>
                      <Td className="text-muted">{duration(d.createdAt, d.finishedAt)}</Td>
                      <Td>
                        <DeployLog
                          title={d.status === "failed" ? "Veröffentlichung fehlgeschlagen" : "Build-Protokoll"}
                          description={`${formatDateTime(d.createdAt)}${d.commit ? ` · Commit ${d.commit.slice(0, 7)}` : ""}`}
                          steps={d.steps}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </section>
      )}
    </PageContainer>
  );
}

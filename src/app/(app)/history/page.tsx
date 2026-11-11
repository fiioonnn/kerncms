"use client";

import { CircleAlert, CircleCheck, FileTerminal, Loader2 } from "lucide-react";
import { VersionHistory } from "@/components/history/version-history";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { deploySteps, useDeploy } from "@/lib/deploy-store";

const deployments = [
  { id: "9d03b77", when: "8. Nov., 09:14", who: "Anna Schmidt", changes: 4, duration: "38 s", status: "success" as const },
  { id: "51ab0e2", when: "6. Nov., 17:40", who: "Jonas Weber", changes: 1, duration: "12 s", status: "failed" as const },
  { id: "2f6aa18", when: "5. Nov., 11:03", who: "Lena Hoffmann", changes: 2, duration: "41 s", status: "success" as const },
  { id: "e7c19f3", when: "28. Okt., 08:12", who: "Anna Schmidt", changes: 7, duration: "44 s", status: "success" as const },
];

function buildLog(failed: boolean) {
  const lines = [
    "$ git checkout main && git pull",
    "Already up to date.",
    "$ pnpm install --frozen-lockfile",
    "Packages: +412",
    "Done in 6.1s",
    "$ astro build",
    "▶ Building static entrypoints...",
    "▶ Generating 18 pages",
  ];
  return failed
    ? [...lines, "✗ src/content/posts/rezept-dinkel.md: frontmatter does not match collection schema", "  → \"date\": Expected date, received string \"morgen\"", "Build failed after 12s"]
    : [...lines, "✓ 18 pages built in 21.4s", "▶ Uploading 64 files", "✓ Deployed to production"];
}

function StatusBadge({ status }: { status: "success" | "failed" | "running" }) {
  if (status === "running")
    return (
      <Badge tone="accent">
        <Loader2 className="size-3.5 animate-spin" />
        Läuft
      </Badge>
    );
  return status === "success" ? (
    <Badge tone="success">
      <CircleCheck className="size-3.5" />
      Live
    </Badge>
  ) : (
    <Badge tone="danger">
      <CircleAlert className="size-3.5" />
      Fehlgeschlagen
    </Badge>
  );
}

export default function HistoryPage() {
  const deploy = useDeploy();
  const running = deploy.status === "running";

  return (
    <PageContainer>
      <PageHeader title="Verlauf" description="Jede Änderung ist gespeichert und lässt sich wiederherstellen." />

      <Tabs defaultValue="changes">
        <TabsList>
          <Tab value="changes">Änderungen</Tab>
          <Tab value="deployments">Veröffentlichungen</Tab>
        </TabsList>

        <TabPanel value="changes" className="pt-5">
          <Card className="overflow-hidden">
            <VersionHistory className="h-[560px]" />
          </Card>
        </TabPanel>

        <TabPanel value="deployments" className="pt-5">
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Status</Th>
                  <Th>Zeitpunkt</Th>
                  <Th>Von</Th>
                  <Th>Änderungen</Th>
                  <Th>Dauer</Th>
                  <Th className="w-0" aria-label="Protokoll" />
                </tr>
              </thead>
              <tbody>
                {running && (
                  <tr>
                    <Td>
                      <StatusBadge status="running" />
                    </Td>
                    <Td>Gerade eben</Td>
                    <Td>
                      <span className="flex items-center gap-3">
                        <Avatar name="Anna Schmidt" size="sm" />
                        Anna Schmidt
                      </span>
                    </Td>
                    <Td>{deploy.changes}</Td>
                    <Td className="text-muted">{deploySteps[deploy.step]}</Td>
                    <Td />
                  </tr>
                )}
                {deployments.map((d) => (
                  <tr key={d.id}>
                    <Td>
                      <StatusBadge status={d.status} />
                    </Td>
                    <Td>{d.when}</Td>
                    <Td>
                      <span className="flex items-center gap-3">
                        <Avatar name={d.who} size="sm" />
                        {d.who}
                      </span>
                    </Td>
                    <Td>{d.changes}</Td>
                    <Td className="text-muted">{d.duration}</Td>
                    <Td>
                      <Dialog>
                        <DialogTrigger className={buttonStyles({ variant: "secondary", size: "sm" })}>
                          <FileTerminal />
                          Protokoll
                        </DialogTrigger>
                        <DialogContent
                          title={d.status === "failed" ? "Veröffentlichung fehlgeschlagen" : "Build-Protokoll"}
                          description={`${d.when} · ${d.who} · Commit ${d.id}`}
                          size="lg"
                        >
                          {d.status === "failed" && (
                            <div className="mb-4 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-[15px] text-danger">
                              Im Beitrag „Rezept: Dinkel-Vollkornbrot“ ist das Datum ungültig. Die Website wurde nicht geändert,
                              die letzte Version bleibt online.
                            </div>
                          )}
                          <pre className="max-h-80 overflow-auto rounded-xl bg-[#1c1c1f] p-4 font-mono text-sm leading-relaxed text-white/85">
                            {buildLog(d.status === "failed").join("\n")}
                          </pre>
                        </DialogContent>
                      </Dialog>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </TabPanel>
      </Tabs>
    </PageContainer>
  );
}

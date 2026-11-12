import { Globe } from "lucide-react";
import { formatChange } from "@/components/collections/format";
import { NamedIcon } from "@/components/collections/lucide-icon";
import { GlobalsEditor } from "./globals-editor";
import { PageContainer } from "@/components/layout/page-container";
import { Card, PageHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { getGlobals } from "@/server/queries";

export const metadata = { title: "Globals" };

export default async function GlobalsPage({ searchParams }: PageProps<"/globals">) {
  const { key } = await searchParams;
  const globals = await getGlobals();

  return (
    <PageContainer>
      <PageHeader
        title="Globals"
        description="Inhalte, die auf jeder Seite gleich sind. Eine Änderung hier wirkt überall."
      />
      {globals.length === 0 ? (
        <Card>
          <EmptyState
            icon={Globe}
            title="Keine Globals"
            description="In der kern.config.yaml dieser Website sind keine globalen Bereiche (globals) definiert."
          />
        </Card>
      ) : (
        <GlobalsEditor
          initialKey={typeof key === "string" ? key : undefined}
          globals={globals.map((g) => ({
            global: g.global,
            values: g.values,
            updated: g.updatedAt ? `${formatChange(g.updatedAt)}${g.updatedBy ? ` · ${g.updatedBy}` : ""}` : null,
            icon: <NamedIcon name={g.global.icon} fallback="Globe" className="size-5 shrink-0" strokeWidth={1.75} />,
          }))}
        />
      )}
    </PageContainer>
  );
}

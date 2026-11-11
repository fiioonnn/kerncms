import Link from "next/link";
import { ChevronRight, FolderOpen, Layers } from "lucide-react";
import { NamedIcon } from "@/components/collections/lucide-icon";
import { PageContainer } from "@/components/layout/page-container";
import { Card, PageHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { getCollectionsOverview } from "@/server/queries";

export default async function CollectionsPage() {
  const overview = await getCollectionsOverview();

  return (
    <PageContainer>
      <PageHeader
        title="Inhalte"
        description="Alles, was nicht eine einzelne Seite ist: Beiträge, Rezepte, Termine oder dein Team."
      />

      {overview.length === 0 ? (
        <Card>
          <EmptyState
            icon={Layers}
            title="Keine Sammlungen"
            description="In der kern.config.yaml dieser Website sind keine Sammlungen (collections) definiert."
          />
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {overview.map(({ collection, count, drafts }) => (
            <Link key={collection.key} href={`/collections/${collection.key}`} className="group outline-none">
              <Card className="flex h-full flex-col gap-5 p-6 transition-colors group-hover:border-border-strong group-focus-visible:border-accent group-focus-visible:ring-4 group-focus-visible:ring-accent/15">
                <div className="flex items-start justify-between gap-4">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <NamedIcon name={collection.icon} className="size-6" strokeWidth={1.75} />
                  </span>
                  <ChevronRight
                    className="size-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    strokeWidth={1.75}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <h2 className="text-lg font-semibold tracking-tight">{collection.label}</h2>
                  {collection.description && <p className="text-[15px] text-muted">{collection.description}</p>}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span>
                    <span className="font-semibold">{count}</span>{" "}
                    <span className="text-muted">{count === 1 ? "Eintrag" : "Einträge"}</span>
                  </span>
                  {drafts > 0 && (
                    <>
                      <span className="size-1 rounded-full bg-border-strong" />
                      <span>
                        <span className="font-semibold text-warning">{drafts}</span>{" "}
                        <span className="text-muted">{drafts === 1 ? "Entwurf" : "Entwürfe"}</span>
                      </span>
                    </>
                  )}
                </div>
                <div className="-mx-6 -mb-6 flex items-center gap-2 border-t border-border px-6 py-3 font-mono text-sm text-muted">
                  <FolderOpen className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{collection.path}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

import Link from "next/link";
import { ChevronRight, FolderOpen, Newspaper } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Card, PageHeader } from "@/components/ui/display";
import { collectionFolder, collections } from "@/lib/collections";

/** Every content type of the site: posts first, then the schema-defined collections. */
const contentTypes = [
  {
    href: "/posts",
    name: "Beiträge",
    description: "Neuigkeiten und alles, was regelmäßig erscheint.",
    icon: Newspaper,
    entries: 5,
    fields: 8,
    folder: "src/content/posts",
  },
  ...collections.map((collection) => ({
    href: `/collections/${collection.slug}`,
    name: collection.name,
    description: collection.description,
    icon: collection.icon,
    entries: collection.entries.length,
    fields: collection.fields.length,
    folder: collectionFolder(collection),
  })),
];

export default function CollectionsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Inhalte"
        description="Alles, was nicht eine einzelne Seite ist: Beiträge, Rezepte, Termine oder dein Team."
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {contentTypes.map((type) => (
          <Link key={type.href} href={type.href} className="group outline-none">
            <Card className="flex h-full flex-col gap-5 p-6 transition-colors group-hover:border-border-strong group-focus-visible:border-accent group-focus-visible:ring-4 group-focus-visible:ring-accent/15">
              <div className="flex items-start justify-between gap-4">
                <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <type.icon className="size-6" strokeWidth={1.75} />
                </span>
                <ChevronRight
                  className="size-5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                  strokeWidth={1.75}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <h2 className="text-lg font-semibold tracking-tight">{type.name}</h2>
                <p className="text-[15px] text-muted">{type.description}</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span>
                  <span className="font-semibold">{type.entries}</span> <span className="text-muted">Einträge</span>
                </span>
                <span className="size-1 rounded-full bg-border-strong" />
                <span>
                  <span className="font-semibold">{type.fields}</span> <span className="text-muted">Felder</span>
                </span>
              </div>
              <div className="-mx-6 -mb-6 flex items-center gap-2 border-t border-border px-6 py-3 font-mono text-sm text-muted">
                <FolderOpen className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{type.folder}</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}

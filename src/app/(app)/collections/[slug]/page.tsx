import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { EditorOnly } from "@/components/collections/editor-only";
import { EntriesTable } from "@/components/collections/entries-table";
import { formatChange } from "@/components/collections/format";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { getCollection } from "@/server/queries";

export default async function CollectionPage({ params }: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const { collection, entries } = await getCollection(slug);
  const rows = entries.map((entry) => ({ ...entry, updatedLabel: formatChange(entry.updatedAt) }));

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/collections"
            className={buttonStyles({ variant: "secondary", size: "icon" })}
            aria-label="Zurück zu den Inhalten"
          >
            <ArrowLeft />
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{collection.label}</h1>
            {collection.description && <p className="text-[15px] text-muted">{collection.description}</p>}
          </div>
        </div>
        <EditorOnly>
          <Link href={`/collections/${collection.key}/new`} className={buttonStyles()}>
            <Plus />
            Neu
          </Link>
        </EditorOnly>
      </div>

      <EntriesTable collection={collection} entries={rows} />
    </PageContainer>
  );
}

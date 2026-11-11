import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { EntriesTable } from "@/components/collections/entries-table";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { collections, getCollection } from "@/lib/collections";


export function generateStaticParams() {
  return collections.map((collection) => ({ slug: collection.slug }));
}

export default async function CollectionPage({ params }: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const collection = getCollection(slug);
  if (!collection) notFound();

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
            <h1 className="text-2xl font-semibold tracking-tight">{collection.name}</h1>
            <p className="text-[15px] text-muted">{collection.description}</p>
          </div>
        </div>
        <Link href={`/collections/${collection.slug}/new`} className={buttonStyles()}>
          <Plus />
          Neuer Eintrag
        </Link>
      </div>

      <EntriesTable slug={collection.slug} />
    </PageContainer>
  );
}

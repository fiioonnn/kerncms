import { notFound } from "next/navigation";
import { CollectionForm } from "@/components/collections/collection-form";
import { PageContainer } from "@/components/layout/page-container";
import { collections, getCollection, getEntry } from "@/lib/collections";


export function generateStaticParams() {
  return collections.flatMap((collection) =>
    collection.entries.map((entry) => ({ slug: collection.slug, id: entry.id })),
  );
}

export default async function EditEntryPage({ params }: PageProps<"/collections/[slug]/[id]">) {
  const { slug, id } = await params;
  const collection = getCollection(slug);
  const entry = collection && getEntry(collection, id);
  if (!collection || !entry) notFound();

  return (
    <PageContainer>
      <CollectionForm key={entry.id} slug={collection.slug} entryId={entry.id} />
    </PageContainer>
  );
}

import { notFound } from "next/navigation";
import { CollectionForm } from "@/components/collections/collection-form";
import { PageContainer } from "@/components/layout/page-container";
import { collections, getCollection } from "@/lib/collections";


export function generateStaticParams() {
  return collections.map((collection) => ({ slug: collection.slug }));
}

export default async function NewEntryPage({ params }: PageProps<"/collections/[slug]/new">) {
  const { slug } = await params;
  const collection = getCollection(slug);
  if (!collection) notFound();

  return (
    <PageContainer>
      <CollectionForm slug={collection.slug} />
    </PageContainer>
  );
}

import { CollectionForm } from "@/components/collections/collection-form";
import { PageContainer } from "@/components/layout/page-container";
import { getCollection } from "@/server/queries";

export default async function NewEntryPage({ params }: PageProps<"/collections/[slug]/new">) {
  const { slug } = await params;
  const { collection } = await getCollection(slug);

  return (
    <PageContainer>
      <CollectionForm collection={collection} />
    </PageContainer>
  );
}

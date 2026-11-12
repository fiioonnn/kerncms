import { CollectionForm } from "@/components/collections/collection-form";
import { PageContainer } from "@/components/layout/page-container";
import { getCollection } from "@/server/queries";
import { collectionTitle } from "@/server/titles";

export async function generateMetadata({ params }: PageProps<"/collections/[slug]/new">) {
  return collectionTitle((await params).slug, "");
}

export default async function NewEntryPage({ params }: PageProps<"/collections/[slug]/new">) {
  const { slug } = await params;
  const { collection } = await getCollection(slug);

  return (
    <PageContainer>
      <CollectionForm collection={collection} />
    </PageContainer>
  );
}

import { CollectionForm } from "@/components/collections/collection-form";
import { formatChange, formatRelative } from "@/components/collections/format";
import { PageContainer } from "@/components/layout/page-container";
import { getEntry } from "@/server/queries";

export default async function EditEntryPage({ params }: PageProps<"/collections/[slug]/[id]">) {
  const { slug, id } = await params;
  const entry = await getEntry(slug, decodeURIComponent(id));
  const history = entry.history.map((h) => ({
    sha: h.sha,
    author: h.author,
    message: h.message,
    when: formatChange(h.date),
    relative: formatRelative(h.date),
  }));

  return (
    <PageContainer>
      <CollectionForm
        key={entry.id}
        collection={entry.collection}
        id={entry.id}
        initialValues={entry.values}
        status={entry.status}
        history={history}
      />
    </PageContainer>
  );
}

import { daysUntil, formatChange, formatDate } from "@/components/collections/format";
import { PageContainer } from "@/components/layout/page-container";
import { getTrash } from "@/server/queries";
import { TrashView } from "./trash-view";

export default async function TrashPage() {
  const items = await getTrash();

  return (
    <PageContainer>
      <TrashView
        items={items.map((item) => ({
          id: item.id,
          kind: item.kind,
          label: item.label,
          kindLabel:
            item.kind === "page" ? "Seite" : item.kind === "media" ? "Medium" : (item.meta.collectionLabel ?? "Eintrag"),
          url: item.kind === "page" ? (item.meta.url ?? null) : null,
          path: item.path,
          deletedBy: item.deletedBy,
          deletedAt: formatChange(item.deletedAt),
          expiresAt: formatDate(item.expiresAt),
          daysLeft: daysUntil(item.expiresAt),
        }))}
      />
    </PageContainer>
  );
}

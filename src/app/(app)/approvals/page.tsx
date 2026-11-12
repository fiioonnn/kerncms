import { formatChange } from "@/components/collections/format";
import { PageContainer } from "@/components/layout/page-container";
import { getApprovals, getPendingChanges } from "@/server/queries";
import { ApprovalsView } from "./approvals-view";

export const metadata = { title: "Freigaben" };

export default async function ApprovalsPage() {
  const [approvals, pending] = await Promise.all([getApprovals(), getPendingChanges()]);
  const pendingFiles = [...new Set([...pending.unsaved, ...pending.unpublished.map((u) => u.file)])];

  return (
    <PageContainer>
      <ApprovalsView
        pendingFiles={pendingFiles}
        requests={approvals.map((a) => ({
          ...a,
          created: formatChange(a.createdAt),
          reviewed: a.reviewedAt ? formatChange(a.reviewedAt) : null,
        }))}
      />
    </PageContainer>
  );
}

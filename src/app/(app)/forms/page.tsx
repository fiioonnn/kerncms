import { Lock } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Card, PageHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { getForms } from "@/server/queries";
import { getSiteContext, hasRole } from "@/server/sites";
import { FormsInbox } from "./forms-inbox";

export const metadata = { title: "Formulare" };

export default async function FormsPage() {
  const ctx = await getSiteContext();
  if (!hasRole(ctx.role, "editor")) {
    return (
      <PageContainer>
        <PageHeader title="Formulare" />
        <Card>
          <EmptyState icon={Lock} title="Kein Zugriff" description="Formular-Nachrichten sehen nur Redakteure, Admins und Inhaber." />
        </Card>
      </PageContainer>
    );
  }
  const { forms, submissions, settings, canConfigure } = await getForms();
  return <FormsInbox forms={forms} initial={submissions} settings={settings} canConfigure={canConfigure} />;
}

import { Sparkles } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Card, PageHeader } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { assistantFor } from "@/server/assistant/settings";
import { getSiteContext } from "@/server/sites";
import { AssistantView } from "./assistant-view";

export const metadata = { title: "KI-Assistent" };

export default async function AssistantPage() {
  const ctx = await getSiteContext();
  if (!(await assistantFor(ctx.user, ctx.role))) {
    return (
      <PageContainer>
        <PageHeader title="KI-Assistent" />
        <Card>
          <EmptyState
            icon={Sparkles}
            title="Nicht freigeschaltet"
            description={ctx.user.isAdmin ? "Hinterlege im Admin-Bereich unter KI einen API-Schlüssel, dann steht der Assistent hier bereit." : "Der KI-Assistent ist für dich nicht freigeschaltet. Frag einen Admin."}
          />
        </Card>
      </PageContainer>
    );
  }
  return <AssistantView siteName={ctx.site.name} />;
}

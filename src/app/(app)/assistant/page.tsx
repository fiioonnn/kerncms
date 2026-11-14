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
  const assistant = await assistantFor(ctx.user, ctx.role);
  if (!assistant?.standalone) {
    return (
      <PageContainer>
        <PageHeader title="KI-Assistent" />
        <Card>
          <EmptyState
            icon={Sparkles}
            title={assistant ? "Nur im Editor" : "Nicht freigeschaltet"}
            description={
              assistant
                ? "Der KI-Assistent ist im Editor verfügbar. Hier in der Seitenleiste kann ihn ein App-Admin im Admin-Bereich einschalten."
                : ctx.user.isAdmin
                  ? "Hinterlege im Admin-Bereich unter KI einen API-Schlüssel, dann steht der Assistent hier bereit."
                  : "Der KI-Assistent ist für dich nicht freigeschaltet. Frag einen Admin."
            }
          />
        </Card>
      </PageContainer>
    );
  }
  return <AssistantView siteName={ctx.site.name} />;
}

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/ui/display";
import { requireAdmin } from "@/server/auth";
import { DEFAULT_MODELS, keyHint, loadAiSettings } from "@/server/assistant/settings";
import { AiSettingsForm } from "./ai-settings-form";

export const metadata = { title: "KI-Assistent" };

export default async function AiSettingsPage() {
  await requireAdmin();
  const row = await loadAiSettings();
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="KI-Assistent"
        description="Ein Chat im Editor, der den Code und die Inhalte der Website lesen und ändern kann. Änderungen landen im Entwurf und gehen erst beim Veröffentlichen live."
      />
      <AiSettingsForm
        initial={{
          provider: row?.provider ?? "anthropic",
          model: row?.model ?? DEFAULT_MODELS.anthropic,
          access: row?.access ?? "app_admin",
        }}
        enabled={row?.enabled ?? false}
        keyHints={{ anthropic: row ? keyHint(row, "anthropic") : null, openai: row ? keyHint(row, "openai") : null }}
        defaults={DEFAULT_MODELS}
      />
    </PageContainer>
  );
}

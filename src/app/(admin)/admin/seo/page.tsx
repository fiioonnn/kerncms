import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/ui/display";
import { db } from "@/db";
import { sites } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import { listProperties, matchProperty, storedServiceAccount } from "@/server/seo/search-console";
import { SearchConsoleForm, type SiteMatch } from "./search-console-form";

export const metadata = { title: "SEO" };

export default async function SeoSettingsPage() {
  await requireAdmin();
  const account = await storedServiceAccount();
  const rows = await db.select({ id: sites.id, name: sites.name, liveUrl: sites.liveUrl }).from(sites).orderBy(sites.name);

  let properties: string[] = [];
  let error: string | null = null;
  if (account) {
    try {
      properties = await listProperties(account);
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const matches: SiteMatch[] = rows.map((s) => ({ id: s.id, name: s.name, liveUrl: s.liveUrl, property: matchProperty(properties, s.liveUrl) }));

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="SEO"
        description="Verbindet kerncms mit der Google Search Console. Im Editor erscheinen dann Position, Klicks und Suchbegriffe jeder Seite."
      />
      <SearchConsoleForm email={account?.client_email ?? null} properties={properties} error={error} sites={matches} />
    </PageContainer>
  );
}

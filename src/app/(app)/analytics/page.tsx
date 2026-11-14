import { getAnalytics, getPages, getSettings } from "@/server/queries";
import { AnalyticsView } from "./analytics-view";
import { GoogleCards } from "./google-cards";

export const metadata = { title: "Statistiken" };

const RANGES = [7, 30, 90];

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const requested = Number((await searchParams).days);
  const days = RANGES.includes(requested) ? requested : 30;
  const [a, settings, pages] = await Promise.all([getAnalytics(days), getSettings(), getPages()]);
  return (
    <AnalyticsView
      a={a}
      days={days}
      enabled={settings.site.analyticsEnabled}
      canManage={settings.role === "admin" || settings.role === "owner"}
      siteKey={settings.site.key}
      titles={new Map(pages.map((p) => [p.path, p.title]))}
      google={<GoogleCards />}
    />
  );
}

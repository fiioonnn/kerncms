import { db } from "@/db";
import { projectAnalytics } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildTrackerScript } from "@/lib/tracker-script";

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;

  const settings = db
    .select()
    .from(projectAnalytics)
    .where(eq(projectAnalytics.siteId, siteId))
    .get();

  if (!settings) {
    return new Response("// site not found", {
      status: 404,
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  }

  if (!settings.enabled) {
    return new Response("// analytics disabled", {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const defaultUrl =
    settings.appUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "";
  const eventsUrl = (settings.eventsUrl ?? `${defaultUrl}/events`) || "/events";

  const customEvents = JSON.parse(settings.customEvents) as string[];

  const js = buildTrackerScript({
    site: settings.siteId,
    url: eventsUrl,
    trackPageviews: settings.trackPageviews,
    trackClicks: settings.trackClicks,
    trackScroll: settings.trackScroll,
    trackEvents: settings.trackEvents,
    trackErrors: settings.trackErrors,
    customEvents,
  });

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

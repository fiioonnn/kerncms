import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  PageSpeedView,
  Rating,
  rankBadge,
} from "@/components/seo/google-views";
import { Card } from "@/components/ui/display";
import { db } from "@/db";
import { seoKeywords } from "@/db/schema";
import { cn } from "@/lib/utils";
import { getPages } from "@/server/queries";
import {
  liveUrlOf,
  mapsBusiness,
  mapsEnabled,
  mapsRank,
  pageSpeed,
  pageSpeedEnabled,
  searchRank,
  serperEnabled,
} from "@/server/seo/google";
import { getWorkspace } from "@/server/sites";

/*
 * Google on the statistics page: PageSpeed of the home page and the search and Maps position for
 * the focus keywords set in the editor. Each card streams in on its own; PageSpeed alone takes 10–30 seconds.
 */

const MAX_KEYWORDS = 10;

function Head({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted">{note}</p>
    </div>
  );
}

function Pending({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4 px-5 py-4">
      <Head title={title} note={note} />
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" />
        {children}
      </p>
    </Card>
  );
}

const SPEED = {
  title: "Wie schnell ist die Website?",
  note: "Startseite auf dem Smartphone, gemessen von Google PageSpeed.",
};
const FOUND = {
  title: "Wo steht die Firma bei Google?",
  note: "Platz in der Google-Suche und bei Google Maps für die Fokus-Suchphrasen der Seiten.",
};

async function SpeedCard({ url }: { url: string }) {
  const result = await pageSpeed(url).then(
    (data) => ({ data, error: null }),
    (error: Error) => ({ data: null, error: error.message }),
  );
  return (
    <Card className="flex flex-col gap-4 px-5 py-4">
      <Head {...SPEED} />
      {result.data ? (
        <PageSpeedView data={result.data} />
      ) : (
        <p className="text-sm text-danger">{result.error}</p>
      )}
    </Card>
  );
}

async function FoundCard({
  siteId,
  siteName,
  liveUrl,
}: {
  siteId: string;
  siteName: string;
  liveUrl: string;
}) {
  const [pages, keywords] = await Promise.all([
    getPages(),
    db
      .select({ page: seoKeywords.page, keyword: seoKeywords.keyword })
      .from(seoKeywords)
      .where(eq(seoKeywords.siteId, siteId)),
  ]);
  const titles = new Map(pages.map((p) => [p.name, p.title]));
  // One search per phrase, even when several pages share it; pages that no longer exist drop out.
  const phrases = new Map<string, { phrase: string; pages: string[] }>();
  for (const k of keywords) {
    const title = titles.get(k.page);
    if (!title) continue;
    const key = k.keyword.toLowerCase();
    const entry = phrases.get(key) ?? { phrase: k.keyword, pages: [] };
    entry.pages.push(title);
    phrases.set(key, entry);
  }
  const list = [...phrases.values()].slice(0, MAX_KEYWORDS);

  const maps = mapsEnabled();
  const serper = serperEnabled();
  const none = Promise.resolve(null);
  const [business, searchRanks, mapsRanks] = await Promise.all([
    maps
      ? mapsBusiness(siteName, liveUrl).then(
          (place) => ({ place, error: null }),
          (e: Error) => ({ place: null, error: e.message }),
        )
      : null,
    Promise.allSettled(
      list.map((p) => (serper ? searchRank(p.phrase, liveUrl) : none)),
    ),
    Promise.allSettled(
      list.map((p) => (maps ? mapsRank(p.phrase, liveUrl) : none)),
    ),
  ]);
  const place = business?.place ?? null;

  return (
    <Card className="flex flex-col gap-4 px-5 py-4">
      <Head {...FOUND} />
      {business?.error && (
        <p className="text-sm text-danger">{business.error}</p>
      )}
      {place && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-subtle/60 px-4 py-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[15px] font-medium">
              {place.name}
            </span>
            <Rating place={place} />
          </span>
          {place.mapsUrl && (
            <a
              href={place.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium hover:text-accent"
            >
              Auf Google Maps
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      )}
      {business && !business.error && !place && (
        <p className="text-sm text-muted">
          Kein Google-Unternehmensprofil gefunden, das auf diese Website
          verlinkt. Ohne Profil mit eingetragener Website erscheint die Firma
          nicht bei Google Maps.
        </p>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-muted">
          Noch keine Fokus-Suchphrasen. Lege sie im Editor im Tab „SEO“ für die
          wichtigsten Seiten fest, z. B. „Friseur Kreuzberg“.
        </p>
      ) : (
        <div className="flex flex-col">
          <div className="flex items-center gap-2 pb-1.5 text-xs font-medium text-muted">
            <span className="min-w-0 flex-1">Suchphrase</span>
            {serper && <span className="w-20 text-center">Suche</span>}
            {maps && <span className="w-20 text-center">Maps</span>}
          </div>
          <ul className="flex flex-col">
            {list.map((p, i) => (
              <li
                key={p.phrase}
                className="flex items-center gap-2 border-t border-border py-2.5 text-[15px]"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">„{p.phrase}“</span>
                  <span className="truncate text-sm text-muted">
                    {p.pages.join(", ")}
                  </span>
                </span>
                {serper && <RankBadge result={searchRanks[i]} />}
                {maps && <RankBadge result={mapsRanks[i]} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function RankBadge({
  result,
}: {
  result: PromiseSettledResult<{
    position: number | null;
    checked: number;
  } | null>;
}) {
  if (result.status === "rejected") {
    return (
      <span
        className="w-20 shrink-0 text-center text-sm text-danger"
        title={(result.reason as Error).message}
      >
        Fehler
      </span>
    );
  }
  const position = result.value?.position ?? null;
  return (
    <span className="flex w-20 shrink-0 justify-center">
      <span
        className={cn(
          "rounded-full px-2.5 text-sm leading-6 font-medium whitespace-nowrap tabular-nums",
          rankBadge(position),
        )}
      >
        {position === null
          ? `> ${result.value?.checked || 20}`
          : `Platz ${position}`}
      </span>
    </span>
  );
}

/** Shown in place of a card whose service has no key on the server. */
function NotSetUp({
  title,
  note,
  envNames,
  admin,
}: {
  title: string;
  note: string;
  envNames: string[];
  admin: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 px-5 py-4">
      <Head title={title} note={note} />
      <p className="text-sm text-muted">
        {admin ? (
          <>
            Noch nicht eingerichtet. Dafür auf dem Server{" "}
            {envNames.map((name, i) => (
              <span key={name}>
                {i > 0 && (i === envNames.length - 1 ? " und " : ", ")}
                <code className="font-mono text-xs">{name}</code>
              </span>
            ))}{" "}
            setzen.
          </>
        ) : (
          "Noch nicht eingerichtet. Ein Admin kann das freischalten."
        )}
      </p>
    </Card>
  );
}

/** The SEO section: Google position and PageSpeed, or what is missing to show them. */
export async function GoogleCards() {
  const speed = pageSpeedEnabled();
  const found = mapsEnabled() || serperEnabled();
  const ws = await getWorkspace("viewer");
  const liveUrl = ws.site.liveUrl;
  const admin = ws.user.isAdmin;

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold tracking-tight">SEO</h2>
        <p className="text-[15px] text-muted">
          Wie die Website bei Google gefunden wird und wie schnell sie lädt.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {!liveUrl ? (
          <Card className="flex flex-col gap-2 px-5 py-4 lg:col-span-2">
            <Head
              title="Google"
              note="Für diese Website ist keine Live-Adresse hinterlegt. Ohne sie lassen sich Ladezeit und Position bei Google nicht ermitteln."
            />
          </Card>
        ) : (
          <>
            {found ? (
              <Suspense
                fallback={<Pending {...FOUND}>Suche bei Google…</Pending>}
              >
                <FoundCard
                  siteId={ws.site.id}
                  siteName={ws.site.name}
                  liveUrl={liveUrl}
                />
              </Suspense>
            ) : (
              <NotSetUp
                {...FOUND}
                envNames={["SERPER_API_KEY", "GOOGLE_MAPS_API_KEY"]}
                admin={admin}
              />
            )}
            {speed ? (
              <Suspense
                fallback={
                  <Pending {...SPEED}>
                    Google misst die Startseite. Das dauert bis zu 30 Sekunden…
                  </Pending>
                }
              >
                <SpeedCard url={liveUrlOf(liveUrl, "/")} />
              </Suspense>
            ) : (
              <NotSetUp
                {...SPEED}
                envNames={["PAGESPEED_API_KEY"]}
                admin={admin}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

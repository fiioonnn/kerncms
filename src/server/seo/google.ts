import "server-only";

/*
 * Google services with plain API keys from the environment, no per-site setup:
 * - PageSpeed Insights (PAGESPEED_API_KEY): Lighthouse scores and Core Web Vitals of a live URL.
 * - Places API (GOOGLE_MAPS_API_KEY): where the business shows up on Google Maps for a search
 *   phrase, found by the website address stored at the place, plus its rating.
 * - Serper (SERPER_API_KEY): the place in the normal Google results for a search phrase.
 * Results are cached in memory: PageSpeed for a few hours, Maps and Serper for a day (each call costs).
 */

export type Vital = { value: number; category: "FAST" | "AVERAGE" | "SLOW" | null };

export type PageSpeed = {
  url: string;
  fetchedAt: string;
  scores: { performance: number | null; seo: number | null; accessibility: number | null; bestPractices: number | null };
  /** Lab values of this run (milliseconds, CLS unitless). */
  lab: { lcp: number | null; cls: number | null; tbt: number | null; fcp: number | null };
  /** Real-user data from Chrome (28 days), when Google has enough of it; null otherwise. */
  field: { lcp: Vital | null; inp: Vital | null; cls: Vital | null; origin: boolean } | null;
};

export type MapsPlace = { name: string; address: string | null; rating: number | null; reviews: number; mapsUrl: string | null };

export type MapsRank = {
  query: string;
  /** 1-based place in the Maps results, or null when the business is not among the first `checked`. */
  position: number | null;
  checked: number;
  place: MapsPlace | null;
  /** The first results, so it is clear who ranks ahead. */
  top: string[];
};

export type SearchRank = {
  query: string;
  /** 1-based place in the organic Google results, or null when the site is not among the first `checked`. */
  position: number | null;
  checked: number;
  /** The result of the site: which of its pages Google shows for the phrase. */
  hit: { title: string; url: string } | null;
  top: string[];
};

const PAGESPEED_TTL = 6 * 60 * 60 * 1000;
const MAPS_TTL = 24 * 60 * 60 * 1000;

type Cache = Map<string, { at: number; ttl: number; value: Promise<unknown> }>;
const cache: Cache = ((globalThis as { __kernGoogle?: Cache }).__kernGoogle ??= new Map());

/** Caches the promise, so parallel requests share one call; failures are not kept. */
function cached<T>(key: string, ttl: number, load: () => Promise<T>, fresh = false): Promise<T> {
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < hit.ttl) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: Date.now(), ttl, value });
  value.catch(() => cache.get(key)?.value === value && cache.delete(key));
  return value;
}

export const pageSpeedEnabled = () => Boolean(process.env.PAGESPEED_API_KEY);
export const mapsEnabled = () => Boolean(process.env.GOOGLE_MAPS_API_KEY);
export const serperEnabled = () => Boolean(process.env.SERPER_API_KEY);

/** Host without www, for comparing a site's address with the website stored at a place. */
export function bareHost(url: string | null | undefined) {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Live URL of a page: the site's address plus the page path. */
export function liveUrlOf(siteUrl: string, path: string) {
  const base = siteUrl.replace(/\/+$/, "");
  return path === "/" || !path ? `${base}/` : `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Google's English errors in words an admin can act on. */
function googleError(message: string, status: number, envName: string, api: string) {
  if (/API key not valid|API_KEY_INVALID/i.test(message)) return `Der Schlüssel in ${envName} ist ungültig.`;
  if (/has not been used|is disabled|SERVICE_DISABLED|API_KEY_SERVICE_BLOCKED/i.test(message)) return `Im Google-Cloud-Projekt des Schlüssels muss die „${api}“ aktiviert sein.`;
  if (status === 429 || /quota/i.test(message)) return "Das Kontingent bei Google ist für heute aufgebraucht.";
  if (/billing/i.test(message)) return "Im Google-Cloud-Projekt ist keine Abrechnung eingerichtet.";
  return message;
}

/* ---------- PageSpeed Insights ---------- */

type Audit = { numericValue?: number };
type FieldMetric = { percentile?: number; category?: string };
type PsiResponse = {
  error?: { message?: string };
  analysisUTCTimestamp?: string;
  lighthouseResult?: {
    finalUrl?: string;
    categories?: Record<string, { score: number | null } | undefined>;
    audits?: Record<string, Audit | undefined>;
  };
  loadingExperience?: { metrics?: Record<string, FieldMetric | undefined>; origin_fallback?: boolean };
};

const score = (c: { score: number | null } | undefined) => (c?.score == null ? null : Math.round(c.score * 100));
const num = (a: Audit | undefined) => (typeof a?.numericValue === "number" ? a.numericValue : null);
function vital(m: FieldMetric | undefined, scale = 1): Vital | null {
  if (typeof m?.percentile !== "number") return null;
  const category = m.category === "FAST" || m.category === "AVERAGE" || m.category === "SLOW" ? m.category : null;
  return { value: m.percentile / scale, category };
}

/** Lighthouse run of a live URL on a simulated smartphone (Google ranks the mobile version). */
export function pageSpeed(url: string, fresh = false): Promise<PageSpeed> {
  return cached(
    `psi:${url}`,
    PAGESPEED_TTL,
    async () => {
      const key = process.env.PAGESPEED_API_KEY;
      if (!key) throw new Error("PageSpeed ist nicht eingerichtet (PAGESPEED_API_KEY fehlt).");
      const params = new URLSearchParams({ url, strategy: "mobile", locale: "de", key });
      for (const c of ["performance", "seo", "accessibility", "best-practices"]) params.append("category", c);
      let res: Response;
      try {
        res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, { signal: AbortSignal.timeout(90_000), cache: "no-store" });
      } catch {
        throw new Error("PageSpeed hat nicht rechtzeitig geantwortet.");
      }
      const json = (await res.json().catch(() => ({}))) as PsiResponse;
      if (!res.ok || !json.lighthouseResult) {
        const message = json.error?.message ?? `Fehler ${res.status}`;
        if (/FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|DNS_FAILURE|NO_FCP/i.test(message)) {
          throw new Error("Google konnte die Seite nicht laden. Ist sie öffentlich erreichbar?");
        }
        throw new Error(`PageSpeed: ${googleError(message, res.status, "PAGESPEED_API_KEY", "PageSpeed Insights API").replace(/^Lighthouse returned error: /, "")}`);
      }
      const lh = json.lighthouseResult;
      const metrics = json.loadingExperience?.metrics;
      const field = metrics
        ? {
            lcp: vital(metrics.LARGEST_CONTENTFUL_PAINT_MS),
            inp: vital(metrics.INTERACTION_TO_NEXT_PAINT),
            cls: vital(metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE, 100),
            origin: Boolean(json.loadingExperience?.origin_fallback),
          }
        : null;
      return {
        url: lh.finalUrl ?? url,
        fetchedAt: json.analysisUTCTimestamp ?? new Date().toISOString(),
        scores: {
          performance: score(lh.categories?.performance),
          seo: score(lh.categories?.seo),
          accessibility: score(lh.categories?.accessibility),
          bestPractices: score(lh.categories?.["best-practices"]),
        },
        lab: {
          lcp: num(lh.audits?.["largest-contentful-paint"]),
          cls: num(lh.audits?.["cumulative-layout-shift"]),
          tbt: num(lh.audits?.["total-blocking-time"]),
          fcp: num(lh.audits?.["first-contentful-paint"]),
        },
        field: field && (field.lcp || field.inp || field.cls) ? field : null,
      };
    },
    fresh,
  );
}

/* ---------- Google Maps (Places API, Text Search) ---------- */

type Place = {
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
};

const FIELDS = "places.displayName,places.formattedAddress,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,nextPageToken";
/** One page of 20 results: that is what people scroll through on Maps, and each page is billed. */
const PAGES = 1;

async function searchPlaces(query: string, pages: number) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Google Maps ist nicht eingerichtet (GOOGLE_MAPS_API_KEY fehlt).");
  const places: Place[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < pages; i++) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({ textQuery: query, languageCode: "de", regionCode: "DE", pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { places?: Place[]; nextPageToken?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(`Google Maps: ${googleError(json.error?.message ?? `Fehler ${res.status}`, res.status, "GOOGLE_MAPS_API_KEY", "Places API (New)")}`);
    places.push(...(json.places ?? []));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return places;
}

const toPlace = (p: Place): MapsPlace => ({
  name: p.displayName?.text ?? "Unbenannt",
  address: p.formattedAddress ?? null,
  rating: p.rating ?? null,
  reviews: p.userRatingCount ?? 0,
  mapsUrl: p.googleMapsUri ?? null,
});

function isHost(url: string | null | undefined, host: string) {
  const h = bareHost(url);
  return h !== null && (h === host || h.endsWith(`.${host}`));
}
const isSite = (p: Place, host: string) => isHost(p.websiteUri, host);

/** Place of the business behind a search phrase on Google Maps, matched by its website. */
export function mapsRank(query: string, siteUrl: string): Promise<MapsRank> {
  const host = bareHost(siteUrl);
  const q = query.replace(/\s+/g, " ").trim();
  return cached(`maps:${host}:${q.toLowerCase()}`, MAPS_TTL, async () => {
    if (!host) throw new Error("Die Live-Adresse der Website ist ungültig.");
    const places = await searchPlaces(q, PAGES);
    const index = places.findIndex((p) => isSite(p, host));
    return {
      query: q,
      position: index >= 0 ? index + 1 : null,
      checked: places.length,
      place: index >= 0 ? toPlace(places[index]) : null,
      top: places.slice(0, 3).map((p) => p.displayName?.text ?? "Unbenannt"),
    };
  });
}

/** The business profile of a site on Google Maps: searched by its name, then by its domain. */
export function mapsBusiness(siteName: string, siteUrl: string): Promise<MapsPlace | null> {
  const host = bareHost(siteUrl);
  return cached(`maps-business:${host}:${siteName.toLowerCase()}`, MAPS_TTL, async () => {
    if (!host) return null;
    for (const query of [siteName, host]) {
      const hit = (await searchPlaces(query, 1)).find((p) => isSite(p, host));
      if (hit) return toPlace(hit);
    }
    return null;
  });
}

/* ---------- Google search (Serper) ---------- */

/** Up to 3 pages of 10 results; each page is one billed request, so the search stops once the site is found. */
const SEARCH_PAGES = 3;

type Organic = { title?: string; link?: string };

/** Place of the site in the organic Google results (Germany, German) for a search phrase. */
export function searchRank(query: string, siteUrl: string): Promise<SearchRank> {
  const host = bareHost(siteUrl);
  const q = query.replace(/\s+/g, " ").trim();
  return cached(`serper:${host}:${q.toLowerCase()}`, MAPS_TTL, async () => {
    const key = process.env.SERPER_API_KEY;
    if (!key) throw new Error("Die Google-Suche ist nicht eingerichtet (SERPER_API_KEY fehlt).");
    if (!host) throw new Error("Die Live-Adresse der Website ist ungültig.");
    const results: Organic[] = [];
    for (let page = 1; page <= SEARCH_PAGES; page++) {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "content-type": "application/json", "X-API-KEY": key },
        body: JSON.stringify({ q, gl: "de", hl: "de", num: 10, page }),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { organic?: Organic[]; message?: string };
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new Error("Google-Suche: Der Schlüssel in SERPER_API_KEY ist ungültig.");
        if (res.status === 429 || /credits/i.test(json.message ?? "")) throw new Error("Google-Suche: Das Guthaben bei Serper ist aufgebraucht.");
        throw new Error(`Google-Suche: ${json.message ?? `Fehler ${res.status}`}`);
      }
      const organic = json.organic ?? [];
      results.push(...organic);
      if (organic.length === 0 || results.some((r) => isHost(r.link, host))) break;
    }
    const index = results.findIndex((r) => isHost(r.link, host));
    return {
      query: q,
      position: index >= 0 ? index + 1 : null,
      checked: results.length,
      hit: index >= 0 ? { title: results[index].title ?? "", url: results[index].link ?? "" } : null,
      top: results.slice(0, 3).map((r) => bareHost(r.link) ?? r.title ?? ""),
    };
  });
}

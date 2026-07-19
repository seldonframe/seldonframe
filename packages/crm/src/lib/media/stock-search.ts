// ============================================================================
// Media sources T2 — stock photo search (Unsplash + Pexels)
// ============================================================================
//
// INERT helper: not wired to any tool/UI yet (that's T3 — copilot media
// tools). Pure/DI'd so it's TDD-able with zero network access.
//
// Queries both providers in parallel, normalizes each result into a common
// shape, interleaves for variety, and caps the total. A provider that has no
// key configured, returns an error, or throws is simply excluded — it must
// NEVER take the other provider down with it (never throws).
//
// Stock CDN urls (Unsplash/Pexels) are trusted and hotlink-friendly by their
// own API terms, so we return them directly — no SSRF re-hosting needed here
// (that's `resolve-url.ts`, for arbitrary operator-supplied URLs).

export type StockPhotoSource = "unsplash" | "pexels";

export interface StockPhoto {
  url: string;
  thumbUrl: string;
  alt: string;
  credit: string;
  source: StockPhotoSource;
}

export interface StockKeys {
  unsplash?: string;
  pexels?: string;
}

export interface StockSearchDeps {
  fetch?: typeof fetch;
  keys?: StockKeys;
}

/** Total results returned across both providers, after interleaving. */
const MAX_RESULTS = 6;
/** Requested per-provider page size (providers may return fewer). */
const PER_PROVIDER_LIMIT = 4;

/**
 * Reads the stock-photo provider keys from env. Kept as one indirection so
 * the exact env var names only need to change in this one place if Max's
 * Vercel project uses different names.
 */
export function resolveStockKeys(env: NodeJS.ProcessEnv = process.env): StockKeys {
  return {
    unsplash: env.UNSPLASH_ACCESS_KEY || undefined,
    pexels: env.PEXELS_API_KEY || undefined,
  };
}

// ── Unsplash ────────────────────────────────────────────────────────────────

interface UnsplashPhoto {
  urls?: { regular?: string; small?: string };
  alt_description?: string | null;
  user?: { name?: string };
  links?: { download_location?: string };
}

interface UnsplashSearchResponse {
  results?: UnsplashPhoto[];
}

async function searchUnsplash(
  query: string,
  key: string,
  fetchImpl: typeof fetch,
): Promise<StockPhoto[]> {
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${PER_PROVIDER_LIMIT}&orientation=landscape`;
    const res = await fetchImpl(url, {
      headers: { Authorization: `Client-ID ${key}` },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as UnsplashSearchResponse;
    const results = Array.isArray(body.results) ? body.results : [];

    // Best-effort download-location ping (Unsplash API guideline). Never
    // blocks or fails the main search — fire and forget.
    for (const photo of results) {
      const downloadLocation = photo.links?.download_location;
      if (downloadLocation) {
        void fetchImpl(downloadLocation, {
          headers: { Authorization: `Client-ID ${key}` },
        }).catch(() => {
          // Best-effort only — ignore failures.
        });
      }
    }

    return results
      .filter((p) => !!p.urls?.regular)
      .map((p) => ({
        url: p.urls!.regular!,
        thumbUrl: p.urls?.small ?? p.urls!.regular!,
        alt: p.alt_description ?? "",
        credit: p.user?.name ?? "",
        source: "unsplash" as const,
      }));
  } catch {
    return [];
  }
}

// ── Pexels ──────────────────────────────────────────────────────────────────

interface PexelsPhoto {
  src?: { large?: string; medium?: string };
  alt?: string | null;
  photographer?: string;
}

interface PexelsSearchResponse {
  photos?: PexelsPhoto[];
}

async function searchPexels(
  query: string,
  key: string,
  fetchImpl: typeof fetch,
): Promise<StockPhoto[]> {
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${PER_PROVIDER_LIMIT}&orientation=landscape`;
    const res = await fetchImpl(url, {
      headers: { Authorization: key },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as PexelsSearchResponse;
    const photos = Array.isArray(body.photos) ? body.photos : [];
    return photos
      .filter((p) => !!p.src?.large)
      .map((p) => ({
        url: p.src!.large!,
        thumbUrl: p.src?.medium ?? p.src!.large!,
        alt: p.alt ?? "",
        credit: p.photographer ?? "",
        source: "pexels" as const,
      }));
  } catch {
    return [];
  }
}

// ── Merge ───────────────────────────────────────────────────────────────────

/** Interleave two arrays (a[0], b[0], a[1], b[1], ...) for source variety. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (i < a.length) out.push(a[i]!);
    if (i < b.length) out.push(b[i]!);
  }
  return out;
}

/**
 * Search both Unsplash and Pexels for `query`, normalize + interleave +
 * cap the results. Never throws: a missing key or provider error yields an
 * empty result set for THAT provider only.
 */
export async function searchStockPhotos(
  query: string,
  deps: StockSearchDeps = {},
): Promise<StockPhoto[]> {
  const fetchImpl = deps.fetch ?? fetch;
  const keys = deps.keys ?? resolveStockKeys();

  const [unsplashResults, pexelsResults] = await Promise.all([
    keys.unsplash ? searchUnsplash(query, keys.unsplash, fetchImpl) : Promise.resolve([]),
    keys.pexels ? searchPexels(query, keys.pexels, fetchImpl) : Promise.resolve([]),
  ]);

  return interleave(unsplashResults, pexelsResults).slice(0, MAX_RESULTS);
}

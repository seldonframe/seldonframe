import {
  getCachedUrlExtraction,
  putCachedUrlExtraction,
} from "@/lib/web-build/extraction-cache-store";

type Deps = {
  get?: typeof getCachedUrlExtraction;
  put?: typeof putCachedUrlExtraction;
};

/** Wrap an expensive URL-extraction with the url_extraction_cache. Best-effort:
 *  cache errors never block the build; a hit skips run() entirely. */
export async function withUrlExtractionCache<T>(
  kind: string,
  url: string,
  run: () => Promise<T>,
  deps: Deps = {}
): Promise<{ value: T; cached: boolean }> {
  const get = deps.get ?? getCachedUrlExtraction;
  const put = deps.put ?? putCachedUrlExtraction;
  const hit = await get<T>(kind, url).catch(() => null);
  if (hit !== null) return { value: hit, cached: true };
  const value = await run();
  try {
    await put(kind, url, value);
  } catch {
    // best-effort
  }
  return { value, cached: false };
}

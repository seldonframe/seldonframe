import { and, eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { urlExtractionCache } from "@/db/schema";
import { urlExtractionCacheKey } from "@/lib/web-build/url-cache-key";

const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type Deps = { db?: typeof defaultDb; now?: () => Date; maxAgeMs?: number };

export async function getCachedUrlExtraction<T>(
  kind: string,
  rawUrl: string,
  deps: Deps = {}
): Promise<T | null> {
  const key = urlExtractionCacheKey(rawUrl);
  if (!key) return null;
  const db = deps.db ?? defaultDb;
  const now = deps.now ? deps.now() : new Date();
  const maxAgeMs = deps.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  try {
    const rows = await db
      .select({ data: urlExtractionCache.data, createdAt: urlExtractionCache.createdAt })
      .from(urlExtractionCache)
      .where(and(eq(urlExtractionCache.urlHash, key), eq(urlExtractionCache.kind, kind)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (now.getTime() - new Date(row.createdAt).getTime() > maxAgeMs) return null;
    return row.data as T;
  } catch {
    return null; // cache is best-effort — never block a build on it
  }
}

export async function putCachedUrlExtraction(
  kind: string,
  rawUrl: string,
  data: unknown,
  deps: Deps = {}
): Promise<void> {
  const key = urlExtractionCacheKey(rawUrl);
  if (!key) return;
  const db = deps.db ?? defaultDb;
  try {
    await db
      .insert(urlExtractionCache)
      .values({ urlHash: key, kind, url: rawUrl.trim(), data })
      .onConflictDoUpdate({
        target: [urlExtractionCache.urlHash, urlExtractionCache.kind],
        set: { data, url: rawUrl.trim(), createdAt: new Date() },
      });
  } catch {
    // best-effort
  }
}

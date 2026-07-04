import { createHash } from "node:crypto";

/**
 * Canonical form for the extraction cache: lowercase host, no scheme, no
 * query/hash, no trailing slash. Path case is preserved (some sites are
 * case-sensitive). Returns null when the input can't parse as a URL even
 * with an https:// prefix — callers skip the cache for those.
 */
export function normalizeUrlForExtractionCache(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (!url.hostname || !url.hostname.includes(".")) return null;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.hostname.toLowerCase()}${path}`;
}

export function urlExtractionCacheKey(raw: string): string | null {
  const normalized = normalizeUrlForExtractionCache(raw);
  if (normalized === null) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

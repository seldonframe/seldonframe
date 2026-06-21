// Pure, DB-free photo helpers. No network. The generator/renderer use these to
// upgrade scraped CDN thumbnails to a usable resolution and decide whether a
// real photo is good enough to keep (else the caller falls back to HD stock).

const WIX_FILL_RE = /\/fill\/w_(\d+),h_(\d+)/;
const TARGET_W = 1100;
const TARGET_H = 825; // 4:3-ish; renderers use object-fit: cover so exact ratio is cosmetic.

/** Bump a known CDN render (Wix `fill/w_,h_`) to ~1100px. Pass through anything
 *  we don't recognize (Unsplash already comes HD; unknown CDNs left as-is). */
export function upscaleCdnImageUrl(src: string | null | undefined): string {
  const s = (src ?? "").trim();
  if (!s) return "";
  if (s.includes("static.wixstatic.com") && WIX_FILL_RE.test(s)) {
    return s.replace(WIX_FILL_RE, `/fill/w_${TARGET_W},h_${TARGET_H}`);
  }
  return s;
}

/** True when a CDN url is a small render we'd rather replace with HD stock. */
export function isLowResImageUrl(src: string | null | undefined): boolean {
  const s = (src ?? "").trim();
  if (!s) return false;
  const m = s.match(WIX_FILL_RE);
  if (m) {
    const w = Number(m[1]);
    return Number.isFinite(w) && w < 700;
  }
  return false;
}

// Tokens that appear as discrete path segments or hyphen/underscore words and
// indicate a non-photo asset (icon, logo, branding graphic, sprite sheet, etc.).
// The pattern requires the token to be preceded/followed by a delimiter or
// string boundary so "iconic-backyard.jpg" does NOT match but
// "...-icon.png" and "/logo.png" DO.
const NON_PHOTO_TOKENS_RE =
  /(?:^|[-_.\/])(?:icon|logo|sprite|favicon|badge)(?:[-_.\/]|$)/i;

/**
 * Returns true when a URL is clearly NOT a real photograph:
 *  - the path contains a delimited non-photo token (icon, logo, sprite, favicon, badge), OR
 *  - the URL path ends in .svg (vectors are never raster photos).
 *
 * False for blank/undefined. Used by resolveServicePhoto to keep icon/logo
 * scrapes from blocking the HD Unsplash fallback.
 */
export function isNonPhotoAsset(src: string | null | undefined): boolean {
  if (!src) return false;
  // Strip query string for extension check, but run token RE on the raw path
  // portion (query strings don't contain useful path tokens we care about).
  let path = src;
  const qIdx = src.indexOf("?");
  const pathOnly = qIdx >= 0 ? src.slice(0, qIdx) : src;
  // SVG extension → always a vector, never a photo.
  if (/\.svg$/i.test(pathOnly)) return true;
  // Non-photo token in the path (delimited).
  return NON_PHOTO_TOKENS_RE.test(pathOnly);
}

/** The real-photo candidate for a service: an upscaled real src, or null when
 *  absent. (The caller decides real-vs-stock; this only prepares the real one.) */
export function pickServicePhotoSrc(realSrc: string | null | undefined): string | null {
  const s = (realSrc ?? "").trim();
  if (!s) return null;
  return upscaleCdnImageUrl(s);
}

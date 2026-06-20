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

/** The real-photo candidate for a service: an upscaled real src, or null when
 *  absent. (The caller decides real-vs-stock; this only prepares the real one.) */
export function pickServicePhotoSrc(realSrc: string | null | undefined): string | null {
  const s = (realSrc ?? "").trim();
  if (!s) return null;
  return upscaleCdnImageUrl(s);
}

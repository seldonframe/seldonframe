// packages/crm/src/lib/web-onboarding/html-image-harvester.ts
//
// Dependency-free image harvester for scraped HTML.
//
// WHY: Firecrawl markdown only carries `![](url)` images. Real trades /
// marketing sites serve their hero + gallery as CSS `background-image`,
// `<picture>`/`srcset`, or lazy `data-src`, and the logo + `og:image` live in
// `<head>` — none of which reach the markdown. So URL-built workspaces fell
// back to generic stock even when the source site was full of real photos.
// This harvester pulls the actual image URLs straight out of the HTML so the
// client's OWN photos win.
//
// WHY REGEX, NOT A DOM PARSER: jsdom is a devDependency (tests only) and far
// too heavy to bundle into the create-from-url serverless route. We only need
// to pluck attribute values out of a bounded, Firecrawl-cleaned HTML string —
// a handful of targeted regexes do that reliably and testably, with zero deps.

export type ImageSection =
  | "hero"
  | "services"
  | "gallery"
  | "testimonial"
  | "about"
  | "other";

export type HarvestedImage = {
  /** Absolute http(s) URL. */
  src: string;
  alt: string;
  section: ImageSection;
};

export type HarvestResult = {
  images: HarvestedImage[];
  /** Best logo candidate (a real <img> wordmark or apple-touch-icon), else null. */
  logo: string | null;
  /** og:image if present — the strongest hero candidate. */
  ogImage: string | null;
};

// Hard cap so a photo-wall page can't blow up the payload; downstream caps
// again at 12.
const MAX_IMAGES = 20;

// Obvious non-photo assets: data/blob URIs, tracking pixels, sprites, spacers.
const JUNK_URL_RE =
  /^(?:data|blob|javascript):|\/(?:sprite|spacer|pixel|blank|tracking)[\/.]|1x1|spacer\.gif|pixel\.(?:gif|png)/i;
// SVGs are almost always logos/icons/illustrations, not photos — keep them out
// of `images` (a scraped SVG may still be used as the logo candidate).
const SVG_RE = /\.svg(?:[?#]|$)/i;

/** Resolve a candidate URL to an absolute http(s) URL, or null if unusable. */
function resolveAbs(candidate: string, baseUrl: string): string | null {
  const raw = candidate?.trim();
  if (!raw) return null;
  if (JUNK_URL_RE.test(raw)) return null;
  try {
    // Handles relative, root-relative, and protocol-relative (//cdn/x.jpg).
    const u = new URL(raw, baseUrl);
    // https ONLY — an http image on the https public /w page is blocked as
    // mixed content and renders broken. (A future Blob re-host step can fetch
    // http sources server-side and re-serve them over https.)
    if (u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Read one HTML attribute value off a tag string. The negative lookbehind
 * `(?<![-\w])` prevents `src` from matching inside `data-src`, `srcset` from
 * matching inside `data-srcset`, etc.
 */
function getAttr(tag: string, name: string): string | null {
  const re = new RegExp(
    `(?<![-\\w])${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const m = tag.match(re);
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? "").trim() || null;
}

/** Pick the highest-resolution URL out of a `srcset` value. */
function largestFromSrcset(srcset: string): string | null {
  const entries = srcset
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  let best: { url: string; weight: number } | null = null;
  for (const entry of entries) {
    const [url, descriptor] = entry.split(/\s+/, 2);
    if (!url) continue;
    let weight = 0;
    if (descriptor) {
      const w = descriptor.match(/(\d+)w/);
      const x = descriptor.match(/([\d.]+)x/);
      if (w) weight = parseInt(w[1], 10);
      else if (x) weight = parseFloat(x[1]) * 1000; // rank 2x above any 1x
    }
    if (!best || weight >= best.weight) best = { url, weight };
  }
  return best?.url ?? null;
}

function classify(hint: string): ImageSection {
  const h = hint.toLowerCase();
  if (/hero|banner|masthead|jumbotron|slide/.test(h)) return "hero";
  if (/gallery|project|portfolio|work|before|after/.test(h)) return "gallery";
  if (/team|about|staff|owner|founder/.test(h)) return "about";
  if (/review|testimonial|client/.test(h)) return "testimonial";
  if (/service/.test(h)) return "services";
  return "other";
}

function isLogoHint(hint: string): boolean {
  return /\blogo\b|wordmark|brand-?mark/i.test(hint);
}

/**
 * Pull image URLs out of a page's HTML. Never throws; returns empty result
 * on non-string / empty input.
 */
export function harvestImagesFromHtml(html: string, baseUrl: string): HarvestResult {
  if (!html || typeof html !== "string") {
    return { images: [], logo: null, ogImage: null };
  }

  const seen = new Set<string>(); // dedup key = origin + pathname
  const images: HarvestedImage[] = [];
  let logo: string | null = null;
  let ogImage: string | null = null;

  const imageKey = (abs: string): string => {
    try {
      const u = new URL(abs);
      return u.origin + u.pathname;
    } catch {
      return abs;
    }
  };

  const pushImage = (rawUrl: string | null, hint: string, alt: string): void => {
    if (images.length >= MAX_IMAGES) return;
    const abs = resolveAbs(rawUrl ?? "", baseUrl);
    if (!abs) return;
    if (SVG_RE.test(abs)) return; // logo/icon, not a photo
    const key = imageKey(abs);
    if (seen.has(key)) return;
    seen.add(key);
    images.push({ src: abs, alt: (alt ?? "").trim(), section: classify(hint) });
  };

  // 0. og:image — the strongest hero candidate.
  const og = html.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]*>/i);
  if (og) {
    ogImage = resolveAbs(getAttr(og[0], "content") ?? "", baseUrl);
  }

  // 1. <img> tags.
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const alt = getAttr(tag, "alt") ?? "";
    const cls = getAttr(tag, "class") ?? "";
    const id = getAttr(tag, "id") ?? "";
    const srcset = getAttr(tag, "srcset") ?? getAttr(tag, "data-srcset");
    const src =
      (srcset ? largestFromSrcset(srcset) : null) ??
      getAttr(tag, "src") ??
      getAttr(tag, "data-src") ??
      getAttr(tag, "data-lazy-src") ??
      getAttr(tag, "data-original");
    const hint = `${alt} ${cls} ${id} ${src ?? ""}`;
    if (isLogoHint(hint)) {
      // Logos are never photos. Remember the first one as the logo candidate.
      if (!logo) logo = resolveAbs(src ?? "", baseUrl);
      continue;
    }
    pushImage(src, hint, alt);
  }

  // 2. <source srcset> inside <picture>.
  for (const m of html.matchAll(/<source\b[^>]*>/gi)) {
    const srcset = getAttr(m[0], "srcset") ?? getAttr(m[0], "data-srcset");
    if (srcset) pushImage(largestFromSrcset(srcset), srcset, "");
  }

  // 3. CSS background-image: url(...) — inline styles + <style> blocks.
  for (const m of html.matchAll(
    /background-image\s*:\s*url\((['"]?)([^'")]+)\1\)/gi,
  )) {
    pushImage(m[2], "hero background", "");
  }

  // 4. Logo fallback: apple-touch-icon / icon <link> when no <img> logo found.
  if (!logo) {
    const link = html.match(
      /<link[^>]+rel=["'](?:apple-touch-icon|icon|shortcut icon)["'][^>]*>/i,
    );
    if (link) logo = resolveAbs(getAttr(link[0], "href") ?? "", baseUrl);
  }

  return { images, logo, ogImage };
}

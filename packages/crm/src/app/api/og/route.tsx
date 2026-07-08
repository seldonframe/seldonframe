// GET /api/og — the per-page Open Graph image endpoint for the SEO surfaces
// (/compare/*, /alternative-to-*, /best/*, /tools/*). One route, a `kind`
// query param picks the layout (see lib/seo/og-card.tsx). Designed like a
// YouTube thumbnail: huge type, extreme contrast, 3-second readability —
// nothing under 28px, max 6-8 words visible per card.
//
// SECURITY: this is a public, unauthenticated GET route and every query
// param is attacker-controlled (these URLs get embedded in <meta> tags and
// shared/crawled/pasted around the internet). All string params are clamped
// through lib/seo/og-card.tsx's `clamp`/`clampEllipsis` helpers before they
// ever reach JSX, and are rendered ONLY as text content — never interpolated
// into a style value, href, or src (ImageResponse/satori has no HTML/script
// execution surface regardless, but clamping still bounds card layout and
// the amount of untrusted text baked into the output image). An unknown
// `kind` falls back to the generic brand card and still returns HTTP 200 —
// this is a public asset endpoint, not an API that should 400 on bad input
// from a crawler or a stale cached URL.
//
// Runtime: nodejs, consistent with the existing /api/og/shipped route (which
// documents why edge isn't required here). Fonts are read once from disk at
// module scope and cached — see loadFonts() below — so repeated renders in
// the same server process don't re-read the TTFs from disk each request.

export const runtime = "nodejs";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import {
  AltCard,
  BestCard,
  clamp,
  DefaultCard,
  OG_HEIGHT,
  OG_WIDTH,
  SfVsCard,
  shortPrice,
  ToolCard,
  VsCard,
} from "@/lib/seo/og-card";

const FONTS_DIR = path.join(process.cwd(), "src", "app", "api", "og", "fonts");

let cachedFonts: Promise<{ name: string; data: ArrayBuffer; weight: 700 | 800; style: "normal" }[]> | null = null;

/** Load both committed Inter TTFs once per server process and cache the
 *  promise (module-scope memoization — every request after the first reuses
 *  the same in-memory buffers instead of re-reading from disk). */
function loadFonts() {
  if (!cachedFonts) {
    cachedFonts = Promise.all([
      readFile(path.join(FONTS_DIR, "Inter-Bold.ttf")),
      readFile(path.join(FONTS_DIR, "Inter-ExtraBold.ttf")),
    ]).then(([bold, extraBold]) => [
      { name: "Inter-Bold", data: bold.buffer.slice(bold.byteOffset, bold.byteOffset + bold.byteLength) as ArrayBuffer, weight: 700 as const, style: "normal" as const },
      { name: "Inter-ExtraBold", data: extraBold.buffer.slice(extraBold.byteOffset, extraBold.byteOffset + extraBold.byteLength) as ArrayBuffer, weight: 800 as const, style: "normal" as const },
    ]);
  }
  return cachedFonts;
}

const NAME_MAX = 48;
const PRICE_MAX = 22;
const TITLE_MAX = 48;
const AUD_MAX = 48;
const HOOK_MAX = 90;
const RANK_MAX = 8;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") ?? "";

  let card;
  switch (kind) {
    case "sf-vs": {
      const name = clamp(searchParams.get("name"), NAME_MAX);
      const price = clamp(searchParams.get("price"), PRICE_MAX) || shortPrice(searchParams.get("price") ?? "");
      card = <SfVsCard name={name} price={price} />;
      break;
    }
    case "vs": {
      const a = clamp(searchParams.get("a"), NAME_MAX);
      const b = clamp(searchParams.get("b"), NAME_MAX);
      card = <VsCard a={a} b={b} />;
      break;
    }
    case "alt": {
      const name = clamp(searchParams.get("name"), NAME_MAX);
      const price = clamp(searchParams.get("price"), PRICE_MAX);
      card = <AltCard name={name} price={price} />;
      break;
    }
    case "best": {
      const title = clamp(searchParams.get("title"), TITLE_MAX);
      const aud = clamp(searchParams.get("aud"), AUD_MAX);
      const n = clamp(searchParams.get("n"), RANK_MAX);
      card = <BestCard title={title} aud={aud} n={n} />;
      break;
    }
    case "tool": {
      const name = clamp(searchParams.get("name"), NAME_MAX);
      const hook = clamp(searchParams.get("hook"), HOOK_MAX);
      card = <ToolCard name={name} hook={hook} />;
      break;
    }
    default: {
      card = <DefaultCard />;
      break;
    }
  }

  const fonts = await loadFonts();

  return new ImageResponse(card, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts,
    headers: {
      // Not immutable: card copy embeds price strings that change at the
      // quarterly fact refresh — let CDNs/scrapers re-pull within ~30 days.
      "Cache-Control": "public, no-transform, max-age=86400, s-maxage=2592000",
    },
  });
}

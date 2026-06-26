// /home.md — the clean-Markdown twin of the seldonframe.com marketing homepage
// (app/(public)/page.tsx). Served at the explicit `/home.md` URL, and as the
// negotiated Markdown representation of `/` when the client EXPLICITLY prefers
// text/markdown (the proxy rewrites `/` → `/home.md` for that case only; a `*/*`
// browser always gets the HTML homepage). See src/proxy.ts → handleHomeNegotiation.
//
// Rendered from renderHomeMarkdown, which single-sources the positioning line
// from the page module (no drift on the core promise). Vary: Accept + a Link
// rel="alternate" back to the HTML homepage declare the twin to CDNs/crawlers —
// the same dual-representation pattern M1's /marketplace.md uses.

import { siteBaseUrl } from "@/app/sitemap";
import { renderHomeMarkdown, homeUrl } from "@/lib/marketplace/render-home-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

// Reads the request's UA/Referer to measure AI traffic (design doc technique #6),
// which makes the route dynamic; the s-maxage header still lets the CDN cache the
// body so the function only executes (and logs) on a miss.
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  // Best-effort AI-traffic measurement (never blocks, never throws). /home.md is
  // not in the proxy matcher, so it logs itself.
  logMarkdownFetch(req, { surface: "home", mode: "explicit_md", path: "/home.md" });

  const base = siteBaseUrl();
  const md = renderHomeMarkdown(base);

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      Link: `<${homeUrl(base)}/>; rel="alternate"; type="text/html"`,
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

// /robots.txt — crawl policy + the AI-content signal.
//
// Hand-rolled as a raw text/plain route (not Next's MetadataRoute.Robots) so we
// can emit the Cloudflare `Content-Signal` line, which the typed metadata API
// can't express. Served at /robots.txt.
//
// Two deliberate choices (design doc technique #0):
//   1. AI crawlers are NOT disallowed. We WANT GPTBot / ClaudeBot / PerplexityBot
//      (and friends) to read the public surface — that's the whole point of the
//      agent-Markdown work. So `User-agent: *` is `Allow: /` for the public site,
//      with only the private app surfaces disallowed.
//   2. `Content-Signal: search=yes, ai-input=yes, ai-train=yes` — Cloudflare's
//      CC0 convention (https://contentsignals.org). `ai-input=yes` permits use as
//      grounding for AI answers (the buyer-asks-an-AI flow); `ai-train=yes` is the
//      explicit policy choice Max confirmed (training is permitted on the public
//      marketing/marketplace/SEO content).
//
// The private surfaces below mirror the proxy's protected prefixes — we don't
// want crawlers wasting budget on auth-walled admin pages (they'd just redirect
// to /login). The public content (/, /marketplace, /ai-agents, the `.md` twins,
// /llms.txt, /pricing, landing/booking/intake pages) is fully crawlable.

import { siteBaseUrl } from "@/app/sitemap";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

// Was force-static; now reads the request's UA/Referer to MEASURE crawler hits
// server-side (design doc technique #6 — the only reliable AI-traffic signal).
// Reading request headers makes the route dynamic, but the `s-maxage=86400`
// response header below means Vercel's CDN still serves a cached body to most
// clients — the function only executes (and logs) on a cache miss, so robots.txt
// stays cheap while crawler hits are still captured.
export const dynamic = "force-dynamic";

/** App surfaces that are auth-walled or operational — no value to crawlers. */
const DISALLOW = [
  "/api/",
  "/dashboard",
  "/contacts",
  "/deals",
  "/activities",
  "/settings",
  "/orgs",
  "/hub",
  "/welcome",
  "/login",
  "/signup",
  "/clients/new",
  "/switch-workspace",
];

export function GET(req: Request): Response {
  // Best-effort AI-traffic measurement (never blocks, never throws). robots.txt
  // is not in the proxy matcher, so it logs itself.
  logMarkdownFetch(req, { surface: "robots_txt", mode: "explicit_md", path: "/robots.txt" });

  const base = siteBaseUrl();
  const lines: string[] = [];

  lines.push("User-agent: *");
  lines.push("Allow: /");
  for (const path of DISALLOW) {
    lines.push(`Disallow: ${path}`);
  }
  // Cloudflare CC0 content-signal: search + AI-grounding + AI-training all permitted.
  lines.push("Content-Signal: search=yes, ai-input=yes, ai-train=yes");
  lines.push("");
  lines.push(`Sitemap: ${base}/sitemap.xml`);
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

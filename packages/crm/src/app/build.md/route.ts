// /build.md — the agent-legible Markdown twin of the /build developer landing.
//
// Mirrors the SKILL.md route: serves a pure, no-drift Markdown rendering of the
// builder front door (renderBuildMarkdown, which reads the SAME landing-content
// the HTML page renders) at text/markdown, with a Link rel=alternate back to the
// human /build page. Served at the same path on both the marketing host
// (seldonframe.com) and the app host — it's one Next deployment, and the proxy
// matcher doesn't touch /build or /build.md, so one route covers both.
//
// `force-static`: the body is deterministic (no request/host/DB input), so it's
// cached at the edge exactly like /SKILL.md.

import { renderBuildMarkdown, buildUrl } from "@/lib/build/render-build-markdown";
import { siteBaseUrl } from "@/app/sitemap";

export const dynamic = "force-static";

export function GET(): Response {
  const base = siteBaseUrl();
  const md = renderBuildMarkdown(base);

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      // Point AI clients + crawlers at the human-browsable /build quickstart.
      Link: `<${buildUrl(base)}>; rel="alternate"; type="text/html"`,
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

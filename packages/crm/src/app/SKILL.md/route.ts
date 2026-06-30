// /SKILL.md — the SeldonFrame-for-Builders funnel doc (spec 1ff09dcb, P0).
//
// `set up https://seldonframe.com/SKILL.md` is the headline entry point: a dev's
// IDE agent fetches this Markdown and learns to connect the SeldonFrame MCP and
// build → test → list → price an agent. Served at the same path on both the
// marketing host (seldonframe.com) and the app host (app.seldonframe.com) — it's
// one Next deployment, so one route covers both. The body is rendered from the
// SAME pure builder (buildSkillMd) the unit tests pin, so it can never drift.

import { buildSkillMd, SKILL_MD_BUILD_PATH } from "@/lib/build/skill-md";
import { siteBaseUrl } from "@/app/sitemap";

export const dynamic = "force-static";

export function GET(): Response {
  const md = buildSkillMd();
  const base = siteBaseUrl();

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      // Point AI clients + crawlers at the human-browsable /build quickstart.
      Link: `<${base}${SKILL_MD_BUILD_PATH}>; rel="alternate"; type="text/html"`,
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

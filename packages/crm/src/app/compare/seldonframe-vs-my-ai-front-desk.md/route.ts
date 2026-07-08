// /compare/seldonframe-vs-my-ai-front-desk.md — Markdown twin of the SeldonFrame head-to-head page.
import { getCompetitor } from "@/lib/seo/alternative-pages";
import { renderSeldonframeVsMarkdown } from "@/lib/seo/seldonframe-vs-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "sf_vs_page", mode: "explicit_md", path: "/compare/seldonframe-vs-my-ai-front-desk.md" });
  const md = renderSeldonframeVsMarkdown(getCompetitor("my-ai-front-desk"));
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://www.seldonframe.com/compare/seldonframe-vs-my-ai-front-desk>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

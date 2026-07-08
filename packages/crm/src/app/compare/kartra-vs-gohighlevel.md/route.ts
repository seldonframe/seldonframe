// /compare/kartra-vs-gohighlevel.md — Markdown twin of the head-to-head page.
import { getVsPair } from "@/lib/seo/alternative-pages-extras";
import { renderVsMarkdown } from "@/lib/seo/alternative-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "compare_page", mode: "explicit_md", path: "/compare/kartra-vs-gohighlevel.md" });
  const { pair, a, b } = getVsPair("kartra-vs-gohighlevel");
  const md = renderVsMarkdown(pair, a, b);
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://seldonframe.com/compare/kartra-vs-gohighlevel>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

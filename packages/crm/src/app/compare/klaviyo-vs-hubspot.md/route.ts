// /compare/klaviyo-vs-hubspot.md — Markdown twin of the head-to-head page.
import { getVsPair } from "@/lib/seo/alternative-pages-extras";
import { renderVsMarkdown } from "@/lib/seo/alternative-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "compare_page", mode: "explicit_md", path: "/compare/klaviyo-vs-hubspot.md" });
  const { pair, a, b } = getVsPair("klaviyo-vs-hubspot");
  const md = renderVsMarkdown(pair, a, b);
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://seldonframe.com/compare/klaviyo-vs-hubspot>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

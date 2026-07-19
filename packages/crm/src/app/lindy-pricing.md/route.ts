// /lindy-pricing.md — the agent-legible Markdown twin of the HTML
// pricing page (static dotted folder; no proxy rewrite needed).
import { renderCompetitorPricingMarkdown } from "@/lib/seo/competitor-pricing-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "pricing_page", mode: "explicit_md", path: "/lindy-pricing.md" });
  const md = renderCompetitorPricingMarkdown("lindy");
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://www.seldonframe.com/lindy-pricing>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

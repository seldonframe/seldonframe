// /charts/crm-pricing-index.md — Markdown twin of the CRM Pricing Index.
import { renderPricingIndexMarkdown } from "@/lib/seo/pricing-index-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  // "guide" is the closest existing MarkdownSurface enum value (md-analytics.ts
  // is out of this task's touched-files scope, shared with 3 sibling chart
  // agents building alongside this one — not adding a new "chart" surface here).
  logMarkdownFetch(req, { surface: "guide", mode: "explicit_md", path: "/charts/crm-pricing-index.md" });
  const md = renderPricingIndexMarkdown();
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://www.seldonframe.com/charts/crm-pricing-index>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

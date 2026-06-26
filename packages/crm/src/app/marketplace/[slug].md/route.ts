// /marketplace/[slug].md — the clean-Markdown twin of a single agent listing.
//
// Explicit `.md` URL → ALWAYS Markdown (no Accept negotiation). Resolves the
// SAME StorefrontAgent the HTML listing page renders (loadStorefrontAgentBySlug,
// live catalog → seed fallback) and renders it via the pure renderListingMarkdown.
// 404 when the slug doesn't resolve, mirroring the HTML page's notFound().

import { loadStorefrontAgentBySlug } from "@/lib/marketplace/load-storefront";
import { renderListingMarkdown, listingUrl } from "@/lib/marketplace/render-markdown";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
  const { slug } = await ctx.params;
  const agent = await loadStorefrontAgentBySlug(slug);

  if (!agent) {
    return new Response(`# Not found\n\nNo agent listing exists at \`/marketplace/${slug}\`.\n`, {
      status: 404,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  const md = renderListingMarkdown(agent);

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      Link: `<${listingUrl(agent.slug)}>; rel="alternate"; type="text/html"`,
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

// /marketplace/listing.md?slug=<slug> — the clean-Markdown twin of a single
// agent listing. Served at the PUBLIC URL `/marketplace/<slug>.md` (and as the
// negotiated Markdown representation of `/marketplace/<slug>`); the proxy
// rewrites both of those to THIS static route, passing the slug as a query
// param. See src/proxy.ts → handleMarketplaceNegotiation.
//
// Why a static `listing.md` folder + `?slug=` instead of a `[slug].md` folder:
// Next 16 cannot extract the dynamic param from a dotted dynamic segment
// (`[slug].md`) — its generated route-type validator gives that path an EMPTY
// param map, so no handler signature can satisfy `RouteHandlerConfig`, breaking
// `tsc`/typecheck (TS2344). A literal `listing.md` folder is a STATIC segment
// (no brackets), so Next generates no param validator and typecheck passes. The
// public `/marketplace/<slug>.md` URL is preserved entirely at the proxy layer.
//
// Explicit `.md` URL → ALWAYS Markdown (no Accept negotiation). Resolves the
// SAME StorefrontAgent the HTML listing page renders (loadStorefrontAgentBySlug,
// live catalog → seed fallback) and renders it via the pure renderListingMarkdown.
// 404 when the slug is missing or doesn't resolve, mirroring the HTML page's
// notFound().

import { loadStorefrontAgentBySlug } from "@/lib/marketplace/load-storefront";
import { renderListingMarkdown, listingUrl } from "@/lib/marketplace/render-markdown";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const slug = new URL(req.url).searchParams.get("slug")?.trim() ?? "";
  const agent = slug ? await loadStorefrontAgentBySlug(slug) : null;

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

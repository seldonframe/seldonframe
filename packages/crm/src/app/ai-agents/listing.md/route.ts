// /ai-agents/listing.md?job=<job>&vertical=<vertical> — the clean-Markdown twin
// of a single agent answer page. Served at the PUBLIC URLs `/ai-agents/<job>.md`
// and `/ai-agents/<job>/for/<vertical>.md` (and as the negotiated Markdown
// representation of the HTML pages); the proxy rewrites all of those to THIS
// static route, passing job + (optional) vertical as query params.
// See src/proxy.ts → handleAiAgentsNegotiation.
//
// Why a static `listing.md` folder + `?job=`/`?vertical=` instead of a
// `[job].md` / `[vertical].md` dynamic-dot folder: Next 16 cannot extract the
// dynamic param from a dotted dynamic segment — its generated route-type
// validator gives that path an EMPTY param map, so no handler signature can
// satisfy `RouteHandlerConfig`, breaking `tsc`/typecheck (TS2344). A literal
// `listing.md` folder is a STATIC segment (no brackets), so Next generates no
// param validator and typecheck passes. The public `.md` URLs are preserved
// entirely at the proxy layer.
//
// Explicit `.md` URL → ALWAYS Markdown (no Accept negotiation). Resolves the
// SAME registry the HTML page renders (getJob + optional getVertical) and renders
// via the pure renderers. 404 when the job (or named vertical) doesn't resolve,
// mirroring the HTML page's notFound().

import { getJob, getVertical, isKeptPair } from "@/lib/seo/agent-pages";
import {
  renderAiAgentJobMarkdown,
  renderAiAgentJobVerticalMarkdown,
  aiAgentUrl,
} from "@/lib/marketplace/render-ai-agents-markdown";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  const url = new URL(req.url);
  const jobSlug = url.searchParams.get("job")?.trim() ?? "";
  const verticalSlug = url.searchParams.get("vertical")?.trim() || undefined;

  let job;
  try {
    job = getJob(jobSlug);
  } catch {
    return notFoundMd(`/ai-agents/${jobSlug}`);
  }

  let vertical;
  if (verticalSlug) {
    try {
      vertical = getVertical(verticalSlug);
    } catch {
      return notFoundMd(`/ai-agents/${jobSlug}/for/${verticalSlug}`);
    }
    // Folded pair (indexation consolidation, 2026-07-17) — 301 the Markdown
    // twin to the job hub's, mirroring the HTML page's permanentRedirect.
    if (!isKeptPair(job.slug, vertical.slug)) {
      return Response.redirect(new URL(`/ai-agents/${job.slug}.md`, req.url), 308);
    }
  }

  const md = vertical
    ? renderAiAgentJobVerticalMarkdown(job, vertical)
    : renderAiAgentJobMarkdown(job);

  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      Link: `<${aiAgentUrl(job.slug, vertical?.slug)}>; rel="alternate"; type="text/html"`,
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

/** A clean 404 Markdown body for an unknown job/vertical (mirrors the HTML
 *  page's notFound() — same status, agent-legible text). */
function notFoundMd(path: string): Response {
  return new Response(`# Not found\n\nNo agent page exists at \`${path}\`.\n`, {
    status: 404,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

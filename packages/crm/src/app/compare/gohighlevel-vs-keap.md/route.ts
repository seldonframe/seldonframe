// /compare/gohighlevel-vs-keap.md — folded pair (indexation consolidation, 2026-07-17): 308
// to the /alternatives hub, mirroring the HTML page's permanentRedirect. See
// docs/strategy/seo/2026-07-17-indexation-consolidation-plan.md.
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  return Response.redirect(new URL("/alternatives", req.url), 308);
}

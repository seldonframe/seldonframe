// /index.md — the conventional "root Markdown" entry point. For SeldonFrame's
// app host the agent-legible root IS the marketplace catalog, so /index.md
// 308-redirects to /marketplace.md (one canonical Markdown index, no duplicate
// content store). The marketing-root .md is M3 — this keeps the convention live
// now without pre-building it.

export const dynamic = "force-static";

export function GET(request: Request): Response {
  const target = new URL("/marketplace.md", request.url);
  return Response.redirect(target, 308);
}

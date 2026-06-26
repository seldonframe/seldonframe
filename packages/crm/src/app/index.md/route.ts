// /index.md — the conventional "root Markdown" entry point. For SeldonFrame's
// app host the agent-legible root IS the marketplace catalog, so /index.md
// 308-redirects to /marketplace.md (one canonical Markdown index, no duplicate
// content store). The marketing homepage's own Markdown twin is /home.md (M3).
//
// Was force-static; now reads the request's UA/Referer to MEASURE which AI
// clients hit the conventional root (design doc technique #6 — server-side is
// the only reliable signal). /index.md is not in the proxy matcher, so it logs
// itself before redirecting.

import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  logMarkdownFetch(request, { surface: "index", mode: "explicit_md", path: "/index.md" });

  const target = new URL("/marketplace.md", request.url);
  return Response.redirect(target, 308);
}

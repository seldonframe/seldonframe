// /alternative-to-synthflow.md — the agent-legible Markdown twin of the HTML
// comparison page (static dotted folder; no proxy rewrite needed).
import { getCompetitor } from "@/lib/seo/alternative-pages";
import { renderAlternativeMarkdown } from "@/lib/seo/alternative-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "alternative_page", mode: "explicit_md", path: "/alternative-to-synthflow.md" });
  const md = renderAlternativeMarkdown(getCompetitor("synthflow"));
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://www.seldonframe.com/alternative-to-synthflow>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

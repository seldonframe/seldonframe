// /guides/is-geo-legit.md — Markdown twin of the guide article.
import { renderGuideMarkdown } from "@/lib/seo/guide-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "guide", mode: "explicit_md", path: "/guides/is-geo-legit.md" });
  const md = renderGuideMarkdown("is-geo-legit");
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://www.seldonframe.com/guides/is-geo-legit>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

// /guides/how-to-answer-business-calls-professionally.md — Markdown twin of the guide article.
import { renderGuideMarkdown } from "@/lib/seo/guide-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "guide", mode: "explicit_md", path: "/guides/how-to-answer-business-calls-professionally.md" });
  const md = renderGuideMarkdown("how-to-answer-business-calls-professionally");
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://www.seldonframe.com/guides/how-to-answer-business-calls-professionally>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

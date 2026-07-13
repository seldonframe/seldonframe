// /blog/why-original-content-wins-seo.md — Markdown twin of the blog article.
import { renderBlogMarkdown } from "@/lib/seo/blog-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "guide", mode: "explicit_md", path: "/blog/why-original-content-wins-seo.md" });
  const md = renderBlogMarkdown("why-original-content-wins-seo");
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://www.seldonframe.com/blog/why-original-content-wins-seo>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

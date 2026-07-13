// /blog/agents-are-the-new-saas.md — Markdown twin of the blog article.
import { renderBlogMarkdown } from "@/lib/seo/blog-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "guide", mode: "explicit_md", path: "/blog/agents-are-the-new-saas.md" });
  const md = renderBlogMarkdown("agents-are-the-new-saas");
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://www.seldonframe.com/blog/agents-are-the-new-saas>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

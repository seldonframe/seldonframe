// /best/crm-for-salons.md — Markdown twin of the listicle page.
import { renderBestMarkdown } from "@/lib/seo/best-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "best_page", mode: "explicit_md", path: "/best/crm-for-salons.md" });
  const md = renderBestMarkdown("crm-for-salons");
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://www.seldonframe.com/best/crm-for-salons>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

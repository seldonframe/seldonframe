// /best/ai-receptionist-for-dentists.md â€” Markdown twin of the listicle page.
import { renderBestMarkdown } from "@/lib/seo/best-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "best_page", mode: "explicit_md", path: "/best/ai-receptionist-for-dentists.md" });
  const md = renderBestMarkdown("ai-receptionist-for-dentists");
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://seldonframe.com/best/ai-receptionist-for-dentists>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

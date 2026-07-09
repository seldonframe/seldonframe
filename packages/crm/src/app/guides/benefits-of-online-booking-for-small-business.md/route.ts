// /guides/benefits-of-online-booking-for-small-business.md — Markdown twin of the guide article.
import { renderGuideMarkdown } from "@/lib/seo/guide-markdown";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  logMarkdownFetch(req, { surface: "guide", mode: "explicit_md", path: "/guides/benefits-of-online-booking-for-small-business.md" });
  const md = renderGuideMarkdown("benefits-of-online-booking-for-small-business");
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://www.seldonframe.com/guides/benefits-of-online-booking-for-small-business>; rel="alternate"; type="text/html"',
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

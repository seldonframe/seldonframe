// /blog/<slug> — long-form original articles statically generated from the
// BLOG_ARTICLES registry (the content engine). Next static routes take
// precedence over this dynamic segment, so hand-coded posts like
// /blog/why-mcp keep rendering their own page.tsx untouched; only registry
// article slugs land here. Additive: no DB.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticlePage } from "@/components/seo/blog-page";
import { allBlogSlugs, getBlogArticle } from "@/lib/seo/blog";
import { buildOgUrl } from "@/lib/seo/og-card";

type RouteParams = { params: Promise<{ slug: string }> };

export function generateStaticParams(): { slug: string }[] {
  return allBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  let a;
  try {
    a = getBlogArticle(slug);
  } catch {
    return { title: "Not found — SeldonFrame" };
  }
  const canonical = `/blog/${slug}`;
  const ogUrl = buildOgUrl({ kind: "tool", name: a.title, hook: a.targetKeyword ?? a.title });
  return {
    title: `${a.title} — Blog`,
    description: a.description,
    alternates: { canonical, types: { "text/markdown": `${canonical}.md` } },
    openGraph: { title: a.title, description: a.description, url: canonical, type: "article", images: [{ url: ogUrl, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: a.title, description: a.description, images: [ogUrl] },
  };
}

export default async function BlogSlugPage({ params }: RouteParams) {
  const { slug } = await params;
  try {
    getBlogArticle(slug);
  } catch {
    notFound();
  }
  return <BlogArticlePage slug={slug} />;
}

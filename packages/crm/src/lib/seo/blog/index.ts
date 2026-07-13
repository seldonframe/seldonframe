// Blog registry — the long-form original-article surface of the content
// engine, sibling to lib/seo/guides. Mirrors the guides index.ts pattern:
// import each article file, export the flat list + typed lookups. Pure data +
// pure lookups so it's unit-testable and importable from server components,
// sitemap, llms.txt, and the /blog/<slug>.md twin routes alike.

import type { BlogArticle } from "./types";

import { article as whyOriginalContentWinsSeo } from "./why-original-content-wins-seo";
import { article as agentsAreTheNewSaas } from "./agents-are-the-new-saas";

export type { BlogArticle, BlogSection, BlogCallout, BlogFaq, BlogSource, BlogSourceVideo } from "./types";

export const BLOG_ARTICLES: BlogArticle[] = [whyOriginalContentWinsSeo, agentsAreTheNewSaas];

export function getBlogArticle(slug: string): BlogArticle {
  const found = BLOG_ARTICLES.find((a) => a.slug === slug);
  if (!found) throw new Error(`unknown blog article slug: ${slug}`);
  return found;
}

export function allBlogSlugs(): string[] {
  return BLOG_ARTICLES.map((a) => a.slug);
}

/** Newest-first, for the /blog index and any "latest" widgets. */
export function articlesNewestFirst(): BlogArticle[] {
  return [...BLOG_ARTICLES].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

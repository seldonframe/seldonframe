// /best/<slug> — the "best <category> for <audience>" listicle pages,
// statically generated from the curated BEST_PAGES registry. Additive: no DB.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BestPage } from "@/components/seo/best-page";
import { allBestSlugs, getBestPage } from "@/lib/seo/best-pages";

type RouteParams = { params: Promise<{ slug: string }> };

export function generateStaticParams(): { slug: string }[] {
  return allBestSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  let resolved;
  try {
    resolved = getBestPage(slug);
  } catch {
    return { title: "Not found — SeldonFrame" };
  }
  const { category, audience } = resolved;
  const total = category.contenders.length + 1;
  const topNames = category.contenders.slice(0, 3).map((c) => c.name).join(", ");
  const title = `The ${total} Best ${category.nounPlural} for ${audience.label} (2026) — honest comparison`;
  const description = `SeldonFrame vs ${topNames} and more: an honest, ranked comparison of the best ${category.nounPlural.toLowerCase()} for ${audience.label.toLowerCase()} — pricing, strengths and the real catch for each.`;
  const canonical = `/best/${slug}`;
  return {
    title,
    description,
    alternates: { canonical, types: { "text/markdown": `${canonical}.md` } },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BestSlugPage({ params }: RouteParams) {
  const { slug } = await params;
  try {
    getBestPage(slug);
  } catch {
    notFound();
  }
  return <BestPage slug={slug} />;
}

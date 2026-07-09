// /guides/<slug> — long-form articles statically generated from the GUIDES
// registry (the content engine). Additive: no DB.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuidePage } from "@/components/seo/guide-page";
import { allGuideSlugs, getGuide } from "@/lib/seo/guides";
import { buildOgUrl } from "@/lib/seo/og-card";

type RouteParams = { params: Promise<{ slug: string }> };

export function generateStaticParams(): { slug: string }[] {
  return allGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  let g;
  try {
    g = getGuide(slug);
  } catch {
    return { title: "Not found — SeldonFrame" };
  }
  const canonical = `/guides/${slug}`;
  const ogUrl = buildOgUrl({ kind: "tool", name: g.title, hook: g.targetKeyword });
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical, types: { "text/markdown": `${canonical}.md` } },
    openGraph: { title: g.title, description: g.description, url: canonical, type: "article", images: [{ url: ogUrl, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: g.title, description: g.description, images: [ogUrl] },
  };
}

export default async function GuideSlugPage({ params }: RouteParams) {
  const { slug } = await params;
  try {
    getGuide(slug);
  } catch {
    notFound();
  }
  return <GuidePage slug={slug} />;
}

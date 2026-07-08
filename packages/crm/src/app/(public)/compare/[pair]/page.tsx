// /compare/<a>-vs-<b> — third-party head-to-head pages (X vs Y ending in the
// SeldonFrame both-worlds answer), statically generated from the curated
// VS_PAIRS registry. Additive: no DB.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VsPage } from "@/components/seo/vs-page";
import { VS_PAIRS, getVsPair, vsSlug } from "@/lib/seo/alternative-pages-extras";
import { LAST_UPDATED } from "@/lib/seo/alternative-pages";

type RouteParams = { params: Promise<{ pair: string }> };

export function generateStaticParams(): { pair: string }[] {
  return VS_PAIRS.map((p) => ({ pair: vsSlug(p) }));
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { pair: pairSlug } = await params;
  let resolved;
  try {
    resolved = getVsPair(pairSlug);
  } catch {
    return { title: "Comparison not found — SeldonFrame" };
  }
  const { a, b } = resolved;
  const title = `${a.name} vs ${b.name}: What You Need to Know (${LAST_UPDATED}) — SeldonFrame`;
  const description = `${a.name} vs ${b.name}, honestly compared: pricing, AI receptionist, whitelabel and the business system behind the agent — plus the both-worlds option.`;
  const canonical = `/compare/${pairSlug}`;
  return {
    title,
    description,
    alternates: { canonical, types: { "text/markdown": `${canonical}.md` } },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ComparePairPage({ params }: RouteParams) {
  const { pair: pairSlug } = await params;
  let resolved;
  try {
    resolved = getVsPair(pairSlug);
  } catch {
    notFound();
  }
  return <VsPage pair={resolved.pair} a={resolved.a} b={resolved.b} />;
}

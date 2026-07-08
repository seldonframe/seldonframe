// /compare/<a>-vs-<b> — head-to-head comparison pages, statically generated.
// Two families share this route:
//   /compare/seldonframe-vs-<slug>  — SeldonFrame vs each registry competitor
//     (the first-person flagship comparison, SeldonFrameVsPage), one per
//     COMPETITORS entry.
//   /compare/<a>-vs-<b>             — third-party X vs Y pages from the curated
//     VS_PAIRS registry, ending in the SeldonFrame both-worlds answer (VsPage).
// Additive: no DB.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VsPage } from "@/components/seo/vs-page";
import { SeldonFrameVsPage } from "@/components/seo/seldonframe-vs-page";
import { VS_PAIRS, getVsPair, vsSlug } from "@/lib/seo/alternative-pages-extras";
import { COMPETITORS, getCompetitor, LAST_UPDATED, type Competitor } from "@/lib/seo/alternative-pages";

type RouteParams = { params: Promise<{ pair: string }> };

const SF_VS_PREFIX = "seldonframe-vs-";

/** Resolve a /compare/seldonframe-vs-<slug> param to its competitor, or null. */
function resolveSfVs(pairSlug: string): Competitor | null {
  if (!pairSlug.startsWith(SF_VS_PREFIX)) return null;
  try {
    return getCompetitor(pairSlug.slice(SF_VS_PREFIX.length));
  } catch {
    return null;
  }
}

export function generateStaticParams(): { pair: string }[] {
  return [
    ...COMPETITORS.map((c) => ({ pair: `${SF_VS_PREFIX}${c.slug}` })),
    ...VS_PAIRS.map((p) => ({ pair: vsSlug(p) })),
  ];
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { pair: pairSlug } = await params;
  const canonical = `/compare/${pairSlug}`;

  const sfVs = resolveSfVs(pairSlug);
  if (sfVs) {
    const title = `SeldonFrame vs ${sfVs.name}: Which Should You Choose? (${LAST_UPDATED})`;
    const description = `SeldonFrame vs ${sfVs.name}, honestly compared: pricing, the AI receptionist, website, CRM & booking behind it, whitelabel and switching — including where ${sfVs.name} wins.`;
    return {
      title,
      description,
      alternates: { canonical, types: { "text/markdown": `${canonical}.md` } },
      openGraph: { title, description, url: canonical, type: "website" },
      twitter: { card: "summary_large_image", title, description },
    };
  }

  let resolved;
  try {
    resolved = getVsPair(pairSlug);
  } catch {
    return { title: "Comparison not found — SeldonFrame" };
  }
  const { a, b } = resolved;
  const title = `${a.name} vs ${b.name}: What You Need to Know (${LAST_UPDATED}) — SeldonFrame`;
  const description = `${a.name} vs ${b.name}, honestly compared: pricing, AI receptionist, whitelabel and the business system behind the agent — plus the both-worlds option.`;
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

  const sfVs = resolveSfVs(pairSlug);
  if (sfVs) return <SeldonFrameVsPage competitor={sfVs} />;

  let resolved;
  try {
    resolved = getVsPair(pairSlug);
  } catch {
    notFound();
  }
  return <VsPage pair={resolved.pair} a={resolved.a} b={resolved.b} />;
}

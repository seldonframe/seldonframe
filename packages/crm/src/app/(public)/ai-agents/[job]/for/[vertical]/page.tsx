// Tier-2 programmatic agent page — /ai-agents/[job]/for/[vertical]
// (e.g. /ai-agents/ai-receptionist/for/plumbers).
//
// Public, no auth. Statically generated for every job × vertical pair via
// generateStaticParams (the long-tail SEO/GEO surface). generateMetadata emits
// vertical-aware title/description/canonical/OG. The body is the same GEO
// template, passed both the job AND the vertical so the copy localizes.
//
// ADDITIVE: no migration, no DB — pure registry → static HTML.

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  KEPT_PAIRS,
  isKeptPair,
  getJob,
  getVertical,
  composePageCopy,
} from "@/lib/seo/agent-pages";
import { AgentPage } from "@/components/seo/agent-page";

type RouteParams = { params: Promise<{ job: string; vertical: string }> };

/** Statically pre-render only the kept (job, vertical) pairs — see
 *  KEPT_PAIRS (indexation consolidation, 2026-07-17). Every other valid
 *  pair still resolves at request time and 301s to its job hub. */
export function generateStaticParams(): { job: string; vertical: string }[] {
  return KEPT_PAIRS;
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { job: jobSlug, vertical: verticalSlug } = await params;
  let job;
  let vertical;
  try {
    job = getJob(jobSlug);
    vertical = getVertical(verticalSlug);
  } catch {
    return { title: "Agent not found — SeldonFrame" };
  }
  if (!isKeptPair(job.slug, vertical.slug)) permanentRedirect(`/ai-agents/${job.slug}`);
  const copy = composePageCopy(job, vertical);
  const canonical = `/ai-agents/${job.slug}/for/${vertical.slug}`;
  return {
    title: copy.title,
    description: copy.metaDescription,
    // canonical + the Markdown twin so DOM-parsing crawlers discover the `.md`.
    alternates: { canonical, types: { "text/markdown": `${canonical}.md` } },
    openGraph: {
      title: `${job.name} for ${vertical.plural}`,
      description: copy.metaDescription,
      url: canonical,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: copy.h1,
      description: copy.metaDescription,
    },
  };
}

export default async function AgentJobVerticalPage({ params }: RouteParams) {
  const { job: jobSlug, vertical: verticalSlug } = await params;
  let job;
  let vertical;
  try {
    job = getJob(jobSlug);
    vertical = getVertical(verticalSlug);
  } catch {
    notFound();
  }
  if (!isKeptPair(job.slug, vertical.slug)) permanentRedirect(`/ai-agents/${job.slug}`);
  return <AgentPage job={job} vertical={vertical} />;
}

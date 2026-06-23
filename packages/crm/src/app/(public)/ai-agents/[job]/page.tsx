// Tier-1 programmatic agent page — /ai-agents/[job] (e.g. /ai-agents/ai-receptionist).
//
// Public, no auth (it lives in the (public) route group). Statically generated
// from the SEO registry: generateStaticParams enumerates every job, and
// generateMetadata emits per-page title/description/canonical/OG. The page body
// is the world-class GEO template (components/seo/agent-page.tsx).
//
// ADDITIVE: no migration, no DB — pure registry → static HTML.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AGENT_JOBS, getJob, composePageCopy } from "@/lib/seo/agent-pages";
import { AgentPage } from "@/components/seo/agent-page";

type RouteParams = { params: Promise<{ job: string }> };

/** Statically pre-render one page per job. */
export function generateStaticParams(): { job: string }[] {
  return AGENT_JOBS.map((j) => ({ job: j.slug }));
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { job: jobSlug } = await params;
  let job;
  try {
    job = getJob(jobSlug);
  } catch {
    return { title: "Agent not found — SeldonFrame" };
  }
  const copy = composePageCopy(job);
  const canonical = `/ai-agents/${job.slug}`;
  return {
    title: copy.title,
    description: copy.metaDescription,
    alternates: { canonical },
    openGraph: {
      title: `${job.name} — deploy a working agent in 60 seconds`,
      description: copy.metaDescription,
      url: canonical,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: job.h1,
      description: copy.metaDescription,
    },
  };
}

export default async function AgentJobPage({ params }: RouteParams) {
  const { job: jobSlug } = await params;
  let job;
  try {
    job = getJob(jobSlug);
  } catch {
    notFound();
  }
  return <AgentPage job={job} />;
}

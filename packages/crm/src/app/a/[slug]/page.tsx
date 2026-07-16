// Agent setup mode slice (T5) — the public share card. The ONLY new public
// surface this slice adds: resolves the org/agent from the share_cards row
// by slug (never session), shows an animated SVG pipeline of the sanitized
// steps, and links to /record so a visitor can build their own. Deleting
// the row (unpublish) makes this 404 — see lib/share/public-share.ts.
//
// L-18: no dashboard/client-only import chain — this page pulls only the
// public-share lib, the standalone SVG/beacon components, and next/*.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicShareCard } from "@/lib/share/public-share";
import { SharePipelineSvg } from "@/components/share/share-pipeline-svg";
import { ShareVisitBeacon } from "@/components/share/share-visit-beacon";

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "https://app.seldonframe.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const card = await getPublicShareCard(slug);
  if (!card) return { title: "Agent not found — SeldonFrame" };

  const title = `${card.agentName} — built with SeldonFrame`;
  const description = "Built with SeldonFrame from a screen recording.";
  const ogUrl = `${APP_ORIGIN}/api/og?kind=agent-share&name=${encodeURIComponent(card.agentName)}&steps=${encodeURIComponent(
    card.steps.map((s) => s.label).join("|"),
  )}`;
  const canonical = `${APP_ORIGIN}/a/${slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website", images: [{ url: ogUrl, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [ogUrl] },
  };
}

export default async function PublicShareCardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = await getPublicShareCard(slug);
  if (!card) notFound();

  return (
    <main className="light flex min-h-screen flex-col items-center justify-center gap-8 bg-[#0b0e14] px-6 py-16 text-center">
      <ShareVisitBeacon slug={slug} />
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[#A39B8D]">Built with SeldonFrame</p>
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">{card.agentName}</h1>
      </div>

      <div className="w-full max-w-3xl overflow-x-auto rounded-2xl border border-[#4A4032] bg-[#12151d] p-6">
        <SharePipelineSvg steps={card.steps} />
      </div>

      <a
        href={`/record?ref=share-${encodeURIComponent(slug)}`}
        className="inline-flex items-center gap-2 rounded-[11px] bg-[#F6F2EA] px-6 py-3 text-sm font-semibold text-[#1F2B24] transition-opacity hover:opacity-90"
      >
        Build yours from a screen recording →
      </a>
    </main>
  );
}

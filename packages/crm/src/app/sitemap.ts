// XML sitemap — the crawl map for the programmatic SEO/GEO agent pages (and the
// marketplace storefront). Next serves this at /sitemap.xml. Static + derived
// purely from the registry (+ the marketplace seed/live catalog), so it needs
// no DB and never blocks.
//
// Scope: the /ai-agents index, every Tier-1 /ai-agents/[job], every Tier-2
// /ai-agents/[job]/for/[vertical], the /marketplace browse page, and every live (or
// seed) /marketplace/[slug] listing — so search engines discover the full tree
// and the programmatic↔marketplace cross-links are crawlable both ways.
//
// Base URL matches the root layout's metadataBase (https://seldonframe.com); an
// env override (NEXT_PUBLIC_SITE_URL) wins for non-prod deploys.

import type { MetadataRoute } from "next";
import { AGENT_JOBS, allJobVerticalPairs } from "@/lib/seo/agent-pages";
import { COMPETITORS } from "@/lib/seo/alternative-pages";
import { VS_PAIRS, vsSlug } from "@/lib/seo/alternative-pages-extras";
import { allBestSlugs } from "@/lib/seo/best-pages";
import { allPricingSlugs } from "@/lib/seo/competitor-pricing";
import { listMarketplaceAgentsFromDb } from "@/lib/marketplace/agent-listings";
import { MARKETPLACE_SEED } from "@/components/marketplace/marketplace-seed";

/** The canonical public base URL — mirrors layout.tsx's metadataBase. */
export function siteBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (fromEnv && fromEnv.replace(/\/$/, "")) || "https://seldonframe.com";
}

/** Resolve the marketplace listing slugs to include (live, else seed). */
async function marketplaceSlugs(): Promise<string[]> {
  try {
    const rows = await listMarketplaceAgentsFromDb();
    if (rows.length > 0) return rows.map((r) => r.slug);
  } catch {
    // DB unavailable (e.g. preview) — fall through to the seed catalog.
  }
  return MARKETPLACE_SEED.map((a) => a.slug);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBaseUrl();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [];

  // The agent library hub.
  entries.push({
    url: `${base}/ai-agents`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.9,
  });

  // Tier-1: one per job (the highest-value single-dimension pages).
  for (const job of AGENT_JOBS) {
    entries.push({
      url: `${base}/ai-agents/${job.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  // Tier-2: job × vertical (the long tail).
  for (const { job, vertical } of allJobVerticalPairs()) {
    entries.push({
      url: `${base}/ai-agents/${job}/for/${vertical}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  // Marketplace browse + listings (so the cross-links resolve for crawlers).
  entries.push({
    url: `${base}/marketplace`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  });
  for (const slug of await marketplaceSlugs()) {
    entries.push({
      url: `${base}/marketplace/${slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  // Competitor comparison pages (/alternatives hub + /alternative-to-<slug>).
  entries.push({
    url: `${base}/alternatives`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  });
  for (const competitor of COMPETITORS) {
    entries.push({
      url: `${base}/alternative-to-${competitor.slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    });
  }

  // Competitor pricing breakdowns (/<slug>-pricing) — the highest-intent
  // keyword family ("<name> pricing"); one per registry competitor.
  for (const slug of allPricingSlugs()) {
    entries.push({
      url: `${base}/${slug}-pricing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    });
  }

  // SeldonFrame head-to-head pages (/compare/seldonframe-vs-<slug>) — the
  // first-person flagship comparisons, one per registry competitor.
  for (const competitor of COMPETITORS) {
    entries.push({
      url: `${base}/compare/seldonframe-vs-${competitor.slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    });
  }

  // Head-to-head comparison pages (/compare/<a>-vs-<b>).
  for (const pair of VS_PAIRS) {
    entries.push({
      url: `${base}/compare/${vsSlug(pair)}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  // Best-of buying guides (/best hub + /best/<category>-for-<audience>).
  entries.push({ url: `${base}/best`, lastModified: now, changeFrequency: "weekly", priority: 0.8 });
  for (const slug of allBestSlugs()) {
    entries.push({
      url: `${base}/best/${slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  // Free tools.
  entries.push({ url: `${base}/tools`, lastModified: now, changeFrequency: "monthly", priority: 0.7 });
  for (const tool of [
    "missed-call-calculator",
    "google-review-link-generator",
    "ai-receptionist-cost-calculator",
    "a2p-10dlc-checker",
    "review-response-generator",
    "claude-project-brief-generator",
  ]) {
    entries.push({
      url: `${base}/tools/${tool}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  return entries;
}

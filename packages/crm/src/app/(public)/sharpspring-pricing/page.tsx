// /sharpspring-pricing — "sharpspring pricing" SEO page, driven by the
// competitor-pricing registry (lib/seo/competitor-pricing.ts). Additive: no DB.
import type { Metadata } from "next";
import { CompetitorPricingPage } from "@/components/seo/pricing-page";
import { getCompetitorPricing } from "@/lib/seo/competitor-pricing";
import { getCompetitor } from "@/lib/seo/alternative-pages";
import { buildOgUrl } from "@/lib/seo/og-card";

const SLUG = "sharpspring";
const p = getCompetitorPricing(SLUG);
const c = getCompetitor(SLUG);
const title = `${c.name} Pricing (July 2026) — Plans, Hidden Costs & What You'll Actually Pay`;
const startsAt = p.plans[0]?.price ?? "quote-gated pricing";
const description = `${c.name} pricing broken down: plans starting at ${startsAt}, the add-ons that stack on top, and what you'll actually pay. Checked ${p.verified}.`;
const canonical = `/${SLUG}-pricing`;
const ogUrl = buildOgUrl({ kind: "tool", name: `${c.name} Pricing (2026)`, hook: "Plans, hidden costs & what you'll actually pay" });

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical, types: { "text/markdown": `${canonical}.md` } },
  openGraph: { title, description, url: canonical, type: "website", images: [{ url: ogUrl, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title, description, images: [ogUrl] },
};

export default function Page() {
  return <CompetitorPricingPage slug={SLUG} />;
}

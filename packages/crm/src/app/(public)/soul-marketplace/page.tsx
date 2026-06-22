// Legacy soul-marketplace → unified /marketplace redirect.
//
// The storefront moved to the SEO-friendly, unified /marketplace. This route is
// kept only so existing soul-marketplace links don't 404 — it 308-redirects to
// /marketplace?kind=soul, preserving the original query (niche/q) so a deep
// link still lands on the right filtered view. Per-soul detail pages
// (/soul-marketplace/[slug]) are unchanged.

import { redirect } from "next/navigation";

type LegacySoulMarketplaceProps = {
  searchParams: Promise<{ niche?: string; q?: string }>;
};

export default async function LegacySoulMarketplacePage({ searchParams }: LegacySoulMarketplaceProps) {
  const params = await searchParams;
  const qs = new URLSearchParams({ kind: "soul" });
  if (params.niche) qs.set("niche", String(params.niche));
  if (params.q) qs.set("q", String(params.q));
  redirect(`/marketplace?${qs.toString()}`);
}

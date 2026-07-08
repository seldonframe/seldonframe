// packages/crm/src/app/pricing/tier-checkout.ts
//
// Shared /pricing checkout wiring — extracted 2026-07-08 (post-rebrand
// dedup follow-up). PricingShell (SF_TIER_LADDER flag-OFF legacy view) and
// PricingShellMarketing (flag-ON marketing view) carried byte-identical
// copies of the POST /api/stripe/checkout flow, and the marketing shell
// additionally owned the sellable-tier ladder helpers. One copy of each
// lives here; both shells import it. Pure logic only — no JSX, no state;
// the shells keep their own pending/error useState wiring.
//
// NOT the same seam as lib/billing/start-checkout.ts (the UpgradeModal
// helper): that one sends `priceId` in the body, uses `/clients` as its
// cancelPath and THROWS on failure. This /pricing flow deliberately keeps
// price ids OUT of the client (`tier` only — the checkout route resolves
// the price server-side), bounces unauthed visitors to /signup?plan=, and
// returns an inline error message instead of throwing.

import { PLANS, type TierId } from "@/lib/billing/plans";

export type Audience = "personal" | "agency";

export const PERSONAL_TIER_IDS: TierId[] = ["builder", "managed"];
export const AGENCY_TIER_IDS: TierId[] = ["agency_starter", "agency_growth", "agency_scale"];

export type LadderTier = {
  id: TierId;
  name: string;
  price: number;
  tagline: string;
  maxSubAccounts: number;
  fullWhiteLabel: boolean;
  stripePriceId: string;
};

export const SELLABLE_TIERS: LadderTier[] = PLANS.filter((p) => p.sellable).map((p) => ({
  id: p.id,
  name: p.name,
  price: p.price,
  tagline: p.tagline,
  maxSubAccounts: p.limits.maxSubAccounts,
  fullWhiteLabel: p.limits.fullWhiteLabel,
  stripePriceId: p.stripePriceId,
}));

export function ladderTiersFor(audience: Audience): LadderTier[] {
  const ids = audience === "personal" ? PERSONAL_TIER_IDS : AGENCY_TIER_IDS;
  return ids
    .map((id) => SELLABLE_TIERS.find((t) => t.id === id))
    .filter((t): t is LadderTier => Boolean(t));
}

export function subAccountLabel(tier: LadderTier): string {
  if (tier.maxSubAccounts === 0) return "";
  if (tier.maxSubAccounts === -1) return "Unlimited client sub-accounts";
  return `${tier.maxSubAccounts} client sub-accounts included`;
}

// POST /api/stripe/checkout for a sellable tier. Returns null when
// navigation was initiated (Stripe Checkout url, or the 401→/signup?plan=
// bounce — the page is about to unload either way), or the inline error
// message the caller should render when checkout could not start.
export async function requestTierCheckout(tierId: TierId): Promise<string | null> {
  try {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier: tierId,
        successPath: "/dashboard?upgraded=1&session_id={CHECKOUT_SESSION_ID}",
        cancelPath: "/pricing",
      }),
    });
    // Unauthed visitors get bounced to signup with the chosen plan.
    if (res.status === 401) {
      window.location.assign(`/signup?plan=${encodeURIComponent(tierId)}`);
      return null;
    }
    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (data.url) {
      window.location.assign(data.url);
      return null;
    }
    return data.error ?? "Couldn't start checkout. Try again in a moment.";
  } catch {
    return "Couldn't reach Stripe. Check your connection and try again.";
  }
}

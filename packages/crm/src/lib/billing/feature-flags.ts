// The 6 feature flags Cut B introduces. Source of truth for the Tier
// Features table in the spec (lines 280-291). Each flag maps to the
// minimum tier that unlocks it. The hasFeature() helper in features.ts
// reads org.subscription.tier and compares.

export const FEATURE_FLAGS = [
  "branding_hidden",
  "custom_domain",
  "client_portal",
  "ai_agents",
  "white_label_portal",
  "priority_support",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

// 2026-06-18 pricing migration — minimum-tier map for the builder /
// workspace / agency ladder. Builder unlocks own domain + branding;
// Workspace adds the client portal + AI agents (the full business OS);
// Agency adds the white-label portal + priority support.
export type MinimumTier = "builder" | "workspace" | "agency";

export const FEATURE_TIERS: Record<FeatureFlag, MinimumTier> = {
  branding_hidden: "builder",
  custom_domain: "builder",
  client_portal: "workspace",
  ai_agents: "workspace",
  white_label_portal: "agency",
  priority_support: "agency",
};

// Rank order. "inactive" (no plan) and any legacy/unknown string sort
// to 0 so they unlock nothing.
//
// 2026-07-08 post-review fix wave (item #7) — extended for the 5 new
// pricing-ladder tiers (plans.ts) so hasFeature()/tierMeetsMinimum
// don't silently rank them at 0 (unlock nothing) if a future caller
// wires them up. Ranked by actual entitlement level from plans.ts's
// Plan.limits, not by price:
//   builder / managed  — no client_portal, no white_label_portal
//                         (same rank as the legacy "builder" minimum —
//                         both unlock branding_hidden/custom_domain,
//                         neither unlocks client_portal/ai_agents).
//   workspace           — GRANDFATHERED; unchanged rank (client_portal
//                          + ai_agents, no white-label).
//   agency_starter/
//   growth/scale         — full white-label + client portal, same as
//                           the grandfathered "agency" tier.
const TIER_RANK: Record<string, number> = {
  inactive: 0,
  builder: 1,
  managed: 1,
  workspace: 2,
  agency_starter: 3,
  agency_growth: 3,
  agency_scale: 3,
  agency: 3,
};

export function tierMeetsMinimum(
  currentTier: string | null | undefined,
  minimumTier: MinimumTier
): boolean {
  const currentRank = TIER_RANK[currentTier ?? "inactive"] ?? 0;
  const minimumRank = TIER_RANK[minimumTier];
  return currentRank >= minimumRank;
}

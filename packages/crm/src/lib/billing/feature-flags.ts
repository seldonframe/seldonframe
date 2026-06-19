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
const TIER_RANK: Record<string, number> = {
  inactive: 0,
  builder: 1,
  workspace: 2,
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

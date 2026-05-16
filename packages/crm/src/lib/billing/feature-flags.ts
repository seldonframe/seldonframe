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

export type MinimumTier = "growth" | "scale";

export const FEATURE_TIERS: Record<FeatureFlag, MinimumTier> = {
  branding_hidden: "growth",
  custom_domain: "growth",
  client_portal: "growth",
  ai_agents: "scale",
  white_label_portal: "scale",
  priority_support: "scale",
};

// April 30, 2026 pricing migration. The TIER_FEATURES dict is the
// terminal feature-flag surface — code branches off the resolved tier
// to gate UI affordances + entitlements. The shape is preserved (so
// callers reading `features.maxWorkspaces` still work); only the keys
// changed (free / growth / scale, with legacy keys aliased).
//
// Cut B (web-onboarding pivot) layered on a typed FeatureFlag surface
// for binary UI gates (e.g. "should this org see the custom-domain
// settings page?"). FEATURE_TIERS lives in ./feature-flags so both
// the modal layout and the hasFeature() DB call share one source of
// truth.

import { FEATURE_TIERS, tierMeetsMinimum, type FeatureFlag } from "./feature-flags";
import { getOrgSubscription as getOrgSubscriptionDb } from "./subscription";

export type { FeatureFlag } from "./feature-flags";
export { FEATURE_FLAGS, FEATURE_TIERS, tierMeetsMinimum } from "./feature-flags";

export const TIER_FEATURES = {
  free: {
    maxWorkspaces: 1,
    maxContacts: 50,
    maxAgentRunsPerMonth: 100,
    seldonIt: "byok",
    customDomains: false,
    whiteLabel: false,
    clientPortal: false,
    managedEmail: false,
    marketplace: false,
    support: "community",
  },
  growth: {
    maxWorkspaces: 3,
    maxContacts: 500,
    maxAgentRunsPerMonth: 1000,
    seldonIt: "unlimited",
    customDomains: true,
    whiteLabel: false,
    clientPortal: true,
    managedEmail: true,
    marketplace: false,
    support: "email",
  },
  scale: {
    // -1 = unlimited
    maxWorkspaces: -1,
    maxContacts: -1,
    maxAgentRunsPerMonth: -1,
    seldonIt: "unlimited",
    customDomains: true,
    whiteLabel: true,
    clientPortal: true,
    managedEmail: true,
    marketplace: true,
    support: "priority",
  },
} as const;

export type BillingTier = keyof typeof TIER_FEATURES;

/** Map a stored tier string (which may be a legacy value like
 *  "cloud_pro" or "pro_3") to one of the three current tiers. Defaults
 *  to "free" if the input is null / empty / unrecognized. */
export function normalizeTierId(raw: string | null | undefined): BillingTier {
  if (!raw) return "free";
  const v = raw.trim().toLowerCase();
  if (v === "free") return "free";
  if (v === "growth") return "growth";
  if (v === "scale") return "scale";
  // Legacy → new tier mapping. Starter ($49) was the lowest paid tier
  // and matches Growth's price band most closely; everything heavier
  // (Cloud Pro $99, Pro 3 $149, Pro 5/10/20) gets Scale's entitlements
  // since they were already paying for unlimited usage.
  if (
    v === "starter" ||
    v === "cloud_starter" ||
    v === "cloud-starter"
  ) {
    return "growth";
  }
  if (
    v === "cloud_pro" ||
    v === "cloud-pro" ||
    v === "pro" ||
    v === "self_service" ||
    v === "pro_3" ||
    v === "pro-3" ||
    v === "pro_5" ||
    v === "pro-5" ||
    v === "pro_10" ||
    v === "pro-10" ||
    v === "pro_20" ||
    v === "pro-20"
  ) {
    return "scale";
  }
  return "free";
}

export function getOrgFeatures(tier: string | null | undefined) {
  return TIER_FEATURES[normalizeTierId(tier)];
}

/**
 * Async tier-gated check: does the given org's current subscription
 * tier meet the minimum tier required to unlock `featureName`?
 *
 * Resolves the org's subscription, normalizes the legacy tier id, and
 * compares it against FEATURE_TIERS[featureName]. Defensive: null /
 * undefined orgId short-circuits to false WITHOUT hitting the DB.
 *
 * Tests inject `deps.getOrgSubscription` to stay pure (no DB). Real
 * callers omit `deps` and get the production reader.
 */
export async function hasFeature(
  orgId: string | null | undefined,
  featureName: FeatureFlag,
  deps: {
    getOrgSubscription?: (orgId: string | null | undefined) => Promise<{ tier?: string | null }>;
  } = {}
): Promise<boolean> {
  if (!orgId) {
    return false;
  }

  const getSubscription = deps.getOrgSubscription ?? getOrgSubscriptionDb;
  const subscription = await getSubscription(orgId);
  // Normalize legacy tier ids (cloud_pro, pro_3, etc.) into the modern
  // free/growth/scale trichotomy before the rank comparison. Otherwise
  // a grandfathered paying customer on "cloud_pro" would fail every
  // hasFeature check.
  const normalizedTier = normalizeTierId(subscription.tier ?? null);
  const minimumTier = FEATURE_TIERS[featureName];
  return tierMeetsMinimum(normalizedTier, minimumTier);
}

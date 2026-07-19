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

// 2026-06-18 pricing migration — three offered tiers plus an
// "inactive" no-plan state (replaces the old "free" tier; nobody is on
// a free plan anymore). Shape is a superset of the old dict so callers
// reading `features.maxWorkspaces` / `.customDomains` / `.managedEmail`
// keep working; new keys (`maxLandingPages`, `crm`, `booking`,
// `agents`, `includedWorkspaces`) drive the builder/workspace split.
//
// 2026-07-08 pricing ladder — 5 new sellable tiers layered on top.
// "builder" and "agency" keys are REPURPOSED here to match the new
// plans.ts catalog (builder = $29 unlimited-own-workspaces BYOK,
// agency key stays as the grandfathered $29-flat legacy shape via
// normalizeTierId's remap target). "workspace" is UNCHANGED
// (grandfathered — existing subscribers keep it exactly).
//
//   inactive       — no active subscription: nothing unlocked.
//   builder        — $29, unlimited own workspaces, full front office, BYOK.
//   managed        — $49, one workspace, full front office, SF-keys runtime.
//   agency_starter — $99, unlimited own + 10 sub-accounts, whitelabel.
//   agency_growth  — $199, unlimited own + 30 sub-accounts, whitelabel.
//   agency_scale   — $299, unlimited own + unlimited sub-accounts, whitelabel.
//   workspace      — GRANDFATHERED: one full workspace, all modules, client portal.
//   agency         — GRANDFATHERED: $29-flat, unlimited workspaces, white-label.
export const TIER_FEATURES = {
  inactive: {
    maxWorkspaces: 0,
    maxLandingPages: 0,
    includedWorkspaces: 0,
    crm: false,
    booking: false,
    agents: false,
    seldonIt: "none",
    customDomains: false,
    whiteLabel: false,
    clientPortal: false,
    managedEmail: false,
    marketplace: false,
    support: "community",
    // Legacy no-op caps (kept for usage.ts / dashboard compat).
    maxContacts: 0,
    maxAgentRunsPerMonth: 0,
  },
  builder: {
    maxWorkspaces: -1,
    maxLandingPages: -1,
    includedWorkspaces: -1,
    crm: true,
    booking: true,
    agents: true,
    seldonIt: "managed",
    customDomains: true,
    whiteLabel: false,
    clientPortal: false,
    managedEmail: true,
    marketplace: true,
    support: "email",
    maxContacts: -1,
    maxAgentRunsPerMonth: -1,
  },
  managed: {
    maxWorkspaces: 1,
    maxLandingPages: -1,
    includedWorkspaces: 1,
    crm: true,
    booking: true,
    agents: true,
    seldonIt: "managed",
    customDomains: true,
    whiteLabel: false,
    clientPortal: false,
    managedEmail: true,
    marketplace: true,
    support: "email",
    maxContacts: -1,
    maxAgentRunsPerMonth: -1,
  },
  agency_starter: {
    maxWorkspaces: -1,
    maxLandingPages: -1,
    includedWorkspaces: -1,
    crm: true,
    booking: true,
    agents: true,
    seldonIt: "managed",
    customDomains: true,
    whiteLabel: true,
    clientPortal: true,
    managedEmail: true,
    marketplace: true,
    support: "email",
    maxContacts: -1,
    maxAgentRunsPerMonth: -1,
  },
  agency_growth: {
    maxWorkspaces: -1,
    maxLandingPages: -1,
    includedWorkspaces: -1,
    crm: true,
    booking: true,
    agents: true,
    seldonIt: "managed",
    customDomains: true,
    whiteLabel: true,
    clientPortal: true,
    managedEmail: true,
    marketplace: true,
    support: "priority",
    maxContacts: -1,
    maxAgentRunsPerMonth: -1,
  },
  agency_scale: {
    maxWorkspaces: -1,
    maxLandingPages: -1,
    includedWorkspaces: -1,
    crm: true,
    booking: true,
    agents: true,
    seldonIt: "managed",
    customDomains: true,
    whiteLabel: true,
    clientPortal: true,
    managedEmail: true,
    marketplace: true,
    support: "priority",
    maxContacts: -1,
    maxAgentRunsPerMonth: -1,
  },
  // ── GRANDFATHERED legacy tiers — UNCHANGED shape (existing subscribers) ──
  workspace: {
    maxWorkspaces: 1,
    maxLandingPages: -1,
    includedWorkspaces: 1,
    crm: true,
    booking: true,
    agents: true,
    seldonIt: "managed",
    customDomains: true,
    whiteLabel: false,
    clientPortal: true,
    managedEmail: true,
    marketplace: false,
    support: "email",
    maxContacts: -1,
    maxAgentRunsPerMonth: -1,
  },
  agency: {
    // -1 = unlimited
    maxWorkspaces: -1,
    maxLandingPages: -1,
    includedWorkspaces: 10,
    crm: true,
    booking: true,
    agents: true,
    seldonIt: "managed",
    customDomains: true,
    whiteLabel: true,
    clientPortal: true,
    managedEmail: true,
    marketplace: true,
    support: "priority",
    maxContacts: -1,
    maxAgentRunsPerMonth: -1,
  },
} as const;

export type BillingTier = keyof typeof TIER_FEATURES;

/** Map a stored tier string (which may be a legacy value like
 *  "cloud_pro", "growth", or "pro_3") to one of the current tiers.
 *  Defaults to "inactive" (no plan) for null / empty / "free" /
 *  unrecognized input. growth-family → workspace, scale-family →
 *  agency. */
export function normalizeTierId(raw: string | null | undefined): BillingTier {
  if (!raw) return "inactive";
  const v = raw.trim().toLowerCase();
  if (v === "builder") return "builder";
  if (v === "managed") return "managed";
  if (v === "agency_starter") return "agency_starter";
  if (v === "agency_growth") return "agency_growth";
  if (v === "agency_scale") return "agency_scale";
  if (v === "workspace") return "workspace";
  if (v === "agency") return "agency";
  // Legacy growth-family ($29 Growth / Cloud Starter / Starter) →
  // Workspace (the closest single-full-workspace tier).
  if (
    v === "growth" ||
    v === "starter" ||
    v === "cloud_starter" ||
    v === "cloud-starter"
  ) {
    return "workspace";
  }
  // Legacy scale-family ($99 Scale / Cloud Pro / Cloud Agency / Pro_N)
  // → Agency (they were already paying for multi-workspace/unlimited).
  if (
    v === "scale" ||
    v === "cloud_pro" ||
    v === "cloud-pro" ||
    v === "cloud_agency" ||
    v === "cloud-agency" ||
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
    return "agency";
  }
  // "free" and everything unknown → no active plan.
  return "inactive";
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

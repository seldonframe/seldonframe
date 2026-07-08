// 2026-07-08 pricing ladder. The catalog offers 5 SELLABLE tiers behind
// SF_TIER_LADDER (spec docs/superpowers/specs/2026-07-08-pricing-ladder-design.md):
//   Builder $29 · Managed $49 · Agency Starter $99 · Agency Growth $199
//   · Agency Scale $299 (Plan.sellable === true).
// Two GRANDFATHERED legacy tiers ("workspace" $49, "agency" $29-flat)
// remain in the catalog ONLY so existing subscribers' ids/limits/price
// keep resolving byte-identically (Plan.sellable === false — new
// checkout never offers them). Until SF_TIER_LADDER flips, the public
// pricing page still renders the single $29 flat card (see
// pricing-shell.tsx) even though the catalog itself already has 5
// sellable tiers — the flag gates the UI, not the data model.
//
// (2026-06-22 reconciliation — the prior single-plan-only era — and the
// even-earlier 2026-06-18 Builder $19/Workspace $49/Agency $297 model
// are both superseded; those tier shapes are grandfathered above.)
//
// Legacy plan ids ("free", "growth", "scale", "cloud-starter",
// "cloud-pro", "pro-3", etc.) are still resolvable via `getPlan()` so
// callers reading a stored `planId` from a stale row keep working:
//   growth-family → workspace, scale-family → agency, free → no plan.
//
// The metered overage fields (`metered`, `maxContacts`,
// `maxAgentRunsPerMonth`) are retained as LEGACY no-op fields so
// `lib/billing/usage.ts` and the billing settings page keep compiling.
// The new tiers are flat (unlimited contacts/runs, no metered lines).

import {
  BUILDER_PRICE_ID,
  MANAGED_PRICE_ID,
  AGENCY_STARTER_PRICE_ID,
  AGENCY_GROWTH_PRICE_ID,
  AGENCY_SCALE_PRICE_ID,
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
  LEGACY_CLOUD_STARTER_PRICE_ID,
  LEGACY_CLOUD_PRO_PRICE_ID,
  LEGACY_CLOUD_AGENCY_PRICE_ID,
} from "./price-ids";

// 2026-07-08 — pricing ladder. Five NEW sellable tiers (builder /
// managed / agency_starter / agency_growth / agency_scale) plus two
// GRANDFATHERED legacy tiers ("workspace", "agency") that existing
// subscribers hold — their ids, limits, and price are frozen (one-way
// door, spec §D1). New checkout only ever offers the 5 new ids
// (Plan.sellable gates this).
export type TierId =
  | "builder"
  | "managed"
  | "agency_starter"
  | "agency_growth"
  | "agency_scale"
  | "workspace"
  | "agency";

export interface MeteredItem {
  /** Number of units bundled in the base subscription. */
  includedQty: number;
  /** Per-unit price in dollars. Used for in-app overage estimation. */
  pricePerUnit: number;
  /** Stripe price id of the metered overage line. Empty = not created. */
  stripePriceId: string;
  /** Stripe meter `event_name` the price consumes. */
  meterEventName: string;
}

export interface Plan {
  id: TierId;
  name: string;
  /** Public-facing one-liner shown on /pricing + /settings/billing. */
  tagline: string;
  /** Internal classification — all current tiers are paid. */
  type: "paid";
  /** True for the 5 NEW tiers offered at checkout. False for the
   *  grandfathered legacy tiers ("workspace", "agency") — they remain
   *  in the catalog for resolution only; new checkouts never sell them. */
  sellable: boolean;
  /** Flat base price in dollars/mo. */
  price: number;
  /** Yearly base price in dollars/yr. 0 = no yearly variant yet. */
  yearlyPrice: number;
  /** Stripe price id for the base flat subscription. */
  stripePriceId: string;
  stripeYearlyPriceId: string;
  /** Agency only — the $10 quantity-licensed "extra client workspace"
   *  overage price. Empty string for builder/workspace. */
  workspaceOveragePriceId: string;
  limits: {
    /** Max FULL workspaces (org with CRM/booking/etc). -1 = unlimited.
     *  builder = 0 (landing pages only), workspace = 1, agency = -1. */
    maxOrgs: number;
    /** Standalone landing-page cap (builder's product). -1 = unlimited.
     *  Only builder is capped here; workspace/agency are unlimited. */
    maxLandingPages: number;
    /** Agency: number of client workspaces included before the $10
     *  per-workspace overage kicks in. */
    includedWorkspaces: number;
    /** 2026-07-08 — number of CLIENT sub-accounts (parent_agency_id
     *  attachments) allowed on the agency_* tiers. -1 = unlimited. 0 on
     *  every non-agency tier (builder/managed have no handoff surface).
     *  Grandfathered "agency" keeps its existing unlimited whitelabel
     *  entitlement (-1); "workspace" never had sub-accounts (0). */
    maxSubAccounts: number;
    /** Full CRM (contacts/deals/pipeline). builder = false. */
    crm: boolean;
    /** Booking page + appointment types. builder = false. */
    booking: boolean;
    /** Intake forms. builder = false. */
    intake: boolean;
    /** AI agents / website chatbot. builder = false. */
    agents: boolean;
    customDomain: boolean;
    removeBranding: boolean;
    fullWhiteLabel: boolean;
    clientPortal: boolean;
    marketplace: boolean;
    prioritySupport: boolean;
    // ── LEGACY no-op fields (flat tiers → unlimited, no metering) ──
    /** @deprecated Flat tiers don't cap contacts. -1 = unlimited. */
    maxContacts: number;
    /** @deprecated Flat tiers don't cap agent runs. -1 = unlimited. */
    maxAgentRunsPerMonth: number;
  };
  /** @deprecated Legacy metered overage items. The new flat tiers have
   *  no metered lines; retained as null so usage.ts keeps compiling. */
  metered: {
    contacts: MeteredItem | null;
    agentRuns: MeteredItem | null;
  };
}

export const PLANS: Plan[] = [
  // ─── 2026-07-08 pricing ladder — 5 SELLABLE tiers ─────────────────
  {
    // Repurposes the "builder" id for the new $29 tier: unlimited OWN
    // workspaces, full front-office, BYOK runtime. Not the same shape
    // as the old ($19, landing-pages-only) "builder" — that tier never
    // shipped to checkout, so no grandfathering is owed to it.
    id: "builder",
    name: "Builder",
    tagline: "$29/mo · unlimited workspaces for your own businesses · BYOK",
    type: "paid",
    sellable: true,
    price: 29,
    yearlyPrice: 0,
    stripePriceId: BUILDER_PRICE_ID,
    stripeYearlyPriceId: "",
    workspaceOveragePriceId: "",
    limits: {
      maxOrgs: -1,
      maxLandingPages: -1,
      includedWorkspaces: -1,
      maxSubAccounts: 0,
      crm: true,
      booking: true,
      intake: true,
      agents: true,
      customDomain: true,
      removeBranding: true,
      fullWhiteLabel: false,
      clientPortal: false,
      marketplace: true,
      prioritySupport: false,
      maxContacts: -1,
      maxAgentRunsPerMonth: -1,
    },
    metered: { contacts: null, agentRuns: null },
  },
  {
    id: "managed",
    name: "Managed",
    tagline: "$49/mo · one workspace, runs on SeldonFrame's keys (fair use)",
    type: "paid",
    sellable: true,
    price: 49,
    yearlyPrice: 0,
    stripePriceId: MANAGED_PRICE_ID,
    stripeYearlyPriceId: "",
    workspaceOveragePriceId: "",
    limits: {
      maxOrgs: 1,
      maxLandingPages: -1,
      includedWorkspaces: 1,
      maxSubAccounts: 0,
      crm: true,
      booking: true,
      intake: true,
      agents: true,
      customDomain: true,
      removeBranding: true,
      fullWhiteLabel: false,
      clientPortal: false,
      marketplace: true,
      prioritySupport: false,
      maxContacts: -1,
      maxAgentRunsPerMonth: -1,
    },
    metered: { contacts: null, agentRuns: null },
  },
  {
    id: "agency_starter",
    name: "Agency Starter",
    tagline: "$99/mo · unlimited own workspaces + 10 client sub-accounts",
    type: "paid",
    sellable: true,
    price: 99,
    yearlyPrice: 0,
    stripePriceId: AGENCY_STARTER_PRICE_ID,
    stripeYearlyPriceId: "",
    workspaceOveragePriceId: "",
    limits: {
      maxOrgs: -1,
      maxLandingPages: -1,
      includedWorkspaces: -1,
      maxSubAccounts: 10,
      crm: true,
      booking: true,
      intake: true,
      agents: true,
      customDomain: true,
      removeBranding: true,
      fullWhiteLabel: true,
      clientPortal: true,
      marketplace: true,
      prioritySupport: false,
      maxContacts: -1,
      maxAgentRunsPerMonth: -1,
    },
    metered: { contacts: null, agentRuns: null },
  },
  {
    id: "agency_growth",
    name: "Agency Growth",
    tagline: "$199/mo · unlimited own workspaces + 30 client sub-accounts",
    type: "paid",
    sellable: true,
    price: 199,
    yearlyPrice: 0,
    stripePriceId: AGENCY_GROWTH_PRICE_ID,
    stripeYearlyPriceId: "",
    workspaceOveragePriceId: "",
    limits: {
      maxOrgs: -1,
      maxLandingPages: -1,
      includedWorkspaces: -1,
      maxSubAccounts: 30,
      crm: true,
      booking: true,
      intake: true,
      agents: true,
      customDomain: true,
      removeBranding: true,
      fullWhiteLabel: true,
      clientPortal: true,
      marketplace: true,
      prioritySupport: true,
      maxContacts: -1,
      maxAgentRunsPerMonth: -1,
    },
    metered: { contacts: null, agentRuns: null },
  },
  {
    id: "agency_scale",
    name: "Agency Scale",
    tagline: "$299/mo · unlimited own workspaces + unlimited client sub-accounts",
    type: "paid",
    sellable: true,
    price: 299,
    yearlyPrice: 0,
    stripePriceId: AGENCY_SCALE_PRICE_ID,
    stripeYearlyPriceId: "",
    workspaceOveragePriceId: "",
    limits: {
      maxOrgs: -1,
      maxLandingPages: -1,
      includedWorkspaces: -1,
      maxSubAccounts: -1,
      crm: true,
      booking: true,
      intake: true,
      agents: true,
      customDomain: true,
      removeBranding: true,
      fullWhiteLabel: true,
      clientPortal: true,
      marketplace: true,
      prioritySupport: true,
      maxContacts: -1,
      maxAgentRunsPerMonth: -1,
    },
    metered: { contacts: null, agentRuns: null },
  },
  // ─── GRANDFATHERED legacy tiers (one-way door, spec §D1) ──────────
  // Existing subscribers hold these exact ids/limits/prices — they are
  // NOT touched by the ladder and are no longer sold (sellable: false).
  {
    id: "workspace",
    name: "Workspace",
    tagline: "One complete business OS — website, booking, CRM & chatbot",
    type: "paid",
    sellable: false,
    price: 49,
    yearlyPrice: 0,
    stripePriceId: WORKSPACE_PRICE_ID,
    stripeYearlyPriceId: "",
    workspaceOveragePriceId: "",
    limits: {
      maxOrgs: 1,
      maxLandingPages: -1,
      includedWorkspaces: 1,
      maxSubAccounts: 0,
      crm: true,
      booking: true,
      intake: true,
      agents: true,
      customDomain: true,
      removeBranding: true,
      fullWhiteLabel: false,
      clientPortal: true,
      marketplace: false,
      prioritySupport: false,
      maxContacts: -1,
      maxAgentRunsPerMonth: -1,
    },
    metered: { contacts: null, agentRuns: null },
  },
  {
    // 2026-06-22 pricing reconciliation: the "agency" tier was the
    // SINGLE offered plan — $29/mo flat, UNLIMITED workspaces, no
    // per-workspace overage. 2026-07-08: grandfathered — existing
    // subscribers keep this exact tier; new checkout never sells it.
    // (The id stays "agency" so legacy subscriptions + the data-driven
    // webhook tier-resolver keep resolving.)
    id: "agency",
    name: "SeldonFrame",
    tagline: "$29/mo · unlimited workspaces · cancel anytime",
    type: "paid",
    sellable: false,
    price: 29,
    yearlyPrice: 0,
    stripePriceId: AGENCY_BASE_PRICE_ID,
    stripeYearlyPriceId: "",
    // No overage on the flat plan — workspaces are unlimited at $29.
    workspaceOveragePriceId: "",
    limits: {
      // -1 = unlimited workspaces, with NO per-workspace overage
      // (includedWorkspaces: -1 → max(0, active − included) is always 0).
      maxOrgs: -1,
      maxLandingPages: -1,
      includedWorkspaces: -1,
      maxSubAccounts: -1,
      crm: true,
      booking: true,
      intake: true,
      agents: true,
      customDomain: true,
      removeBranding: true,
      fullWhiteLabel: true,
      clientPortal: true,
      marketplace: true,
      prioritySupport: true,
      maxContacts: -1,
      maxAgentRunsPerMonth: -1,
    },
    metered: { contacts: null, agentRuns: null },
  },
];

/** Legacy plan-id → new tier-id remap. Used by `getPlan()` so a stale
 *  `users.planId` / `subscription.tier` value (e.g. "cloud-starter")
 *  still resolves to a current Plan object. growth-family → workspace,
 *  scale-family → agency. "free" is intentionally absent — it no longer
 *  maps to any offered plan (callers treat undefined as "no plan"). */
const LEGACY_PLAN_ID_REMAP: Record<string, TierId> = {
  // Growth-family ($29 Growth / Cloud Starter / Starter) → Workspace
  growth: "workspace",
  "cloud-starter": "workspace",
  cloud_starter: "workspace",
  starter: "workspace",
  // Scale-family ($99 Scale / Cloud Pro / Cloud Agency / Pro_N) → Agency
  scale: "agency",
  "cloud-pro": "agency",
  cloud_pro: "agency",
  "cloud-agency": "agency",
  cloud_agency: "agency",
  pro: "agency",
  self_service: "agency",
  "pro-3": "agency",
  "pro-5": "agency",
  "pro-10": "agency",
  "pro-20": "agency",
  pro_3: "agency",
  pro_5: "agency",
  pro_10: "agency",
  pro_20: "agency",
};

export function getPlan(planId: string): Plan | undefined {
  // Direct hit on a current tier id
  const direct = PLANS.find((plan) => plan.id === planId);
  if (direct) return direct;

  // Legacy alias remap (case-insensitive)
  const remapped = LEGACY_PLAN_ID_REMAP[planId] ?? LEGACY_PLAN_ID_REMAP[planId?.toLowerCase?.() ?? ""];
  if (remapped) return PLANS.find((plan) => plan.id === remapped);

  return undefined;
}

export function getCloudPlans(): Plan[] {
  return PLANS.filter((plan) => plan.type === "paid");
}

/** @deprecated The old "Pro" tier family no longer exists. Returns
 *  empty array. Kept so legacy callers don't break. */
export function getProPlans(): Plan[] {
  return [];
}

/** Resolve the plan that owns a given Stripe base price id. Walks new
 *  tier prices first, then legacy ids (which are pinned to workspace /
 *  agency). Returns null for unknown / overage prices. */
export function getPlanByStripePriceId(
  priceId: string
): { plan: Plan; billingPeriod: "monthly" | "yearly" } | null {
  // Modern tier base prices
  for (const plan of PLANS) {
    if (plan.stripePriceId && plan.stripePriceId === priceId) {
      return { plan, billingPeriod: "monthly" };
    }
    if (plan.stripeYearlyPriceId && plan.stripeYearlyPriceId === priceId) {
      return { plan, billingPeriod: "yearly" };
    }
  }

  // Legacy price ids — grandfathered to workspace or agency.
  const workspace = PLANS.find((plan) => plan.id === "workspace");
  const agency = PLANS.find((plan) => plan.id === "agency");

  if (priceId === LEGACY_CLOUD_STARTER_PRICE_ID && workspace) {
    return { plan: workspace, billingPeriod: "monthly" };
  }
  if (
    (priceId === LEGACY_CLOUD_PRO_PRICE_ID || priceId === LEGACY_CLOUD_AGENCY_PRICE_ID) &&
    agency
  ) {
    return { plan: agency, billingPeriod: "monthly" };
  }

  return null;
}

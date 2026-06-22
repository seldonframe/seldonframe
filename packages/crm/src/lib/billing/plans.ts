// 2026-06-22 pricing reconciliation. The catalog now offers ONE public
// plan — the "agency" tier, repurposed to **$29/mo flat · unlimited
// workspaces · 14-day free trial** — matching the marketing site. The
// builder/workspace tiers remain in the catalog (no longer offered) only
// so legacy subscriptions + stored planIds keep resolving in the webhook.
//
//   SeldonFrame ($29/mo, id "agency") — the single offered plan:
//                        UNLIMITED full workspaces (no per-workspace
//                        overage), white-label, marketplace, all
//                        modules. 14-day trial set on the platform
//                        checkout routes.
//
// (Earlier 2026-06-18 model — Builder $19 / Workspace $49 / Agency $297
// with a $10/workspace overage — is superseded. Those tier objects stay
// catalogued for back-compat; only "agency" is sold, now at $29 flat.)
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
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
  LEGACY_CLOUD_STARTER_PRICE_ID,
  LEGACY_CLOUD_PRO_PRICE_ID,
  LEGACY_CLOUD_AGENCY_PRICE_ID,
} from "./price-ids";

export type TierId = "builder" | "workspace" | "agency";

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
  /** Internal classification — all three current tiers are paid. */
  type: "paid";
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
  {
    id: "builder",
    name: "Builder",
    tagline: "Launch up to 10 landing pages on your own domain",
    type: "paid",
    price: 19,
    yearlyPrice: 0,
    stripePriceId: BUILDER_PRICE_ID,
    stripeYearlyPriceId: "",
    workspaceOveragePriceId: "",
    limits: {
      maxOrgs: 0,
      maxLandingPages: 10,
      includedWorkspaces: 0,
      crm: false,
      booking: false,
      intake: false,
      agents: false,
      customDomain: true,
      removeBranding: true,
      fullWhiteLabel: false,
      clientPortal: false,
      marketplace: false,
      prioritySupport: false,
      maxContacts: -1,
      maxAgentRunsPerMonth: -1,
    },
    metered: { contacts: null, agentRuns: null },
  },
  {
    id: "workspace",
    name: "Workspace",
    tagline: "One complete business OS — website, booking, CRM & chatbot",
    type: "paid",
    price: 49,
    yearlyPrice: 0,
    stripePriceId: WORKSPACE_PRICE_ID,
    stripeYearlyPriceId: "",
    workspaceOveragePriceId: "",
    limits: {
      maxOrgs: 1,
      maxLandingPages: -1,
      includedWorkspaces: 1,
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
    // 2026-06-22 pricing reconciliation: the "agency" tier is now the
    // SINGLE offered plan — $29/mo flat, UNLIMITED workspaces, no
    // per-workspace overage. (The id stays "agency" so legacy
    // subscriptions + the data-driven webhook tier-resolver keep
    // resolving; a future cleanup can rename it to "flat".)
    id: "agency",
    name: "SeldonFrame",
    tagline: "$29/mo · unlimited workspaces · 14-day free trial",
    type: "paid",
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

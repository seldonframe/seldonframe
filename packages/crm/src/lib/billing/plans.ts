// April 30, 2026 pricing migration. The PLAN catalog now describes the
// three public tiers (Free / Growth / Scale) plus the metered overage
// items each one ships with. Legacy plan ids ("cloud-starter",
// "cloud-pro", "pro-3", etc.) are still resolvable via `getPlan()` so
// callers that read a stored `planId` from a stale users row continue
// to work — they're aliased to the new tiers via `getPlan()`.

import {
  GROWTH_BASE_PRICE_ID,
  GROWTH_CONTACTS_PRICE_ID,
  GROWTH_AGENT_RUNS_PRICE_ID,
  SCALE_BASE_PRICE_ID,
  SCALE_AGENT_RUNS_PRICE_ID,
  LEGACY_CLOUD_STARTER_PRICE_ID,
  LEGACY_CLOUD_PRO_PRICE_ID,
  LEGACY_CLOUD_AGENCY_PRICE_ID,
} from "./price-ids";

export type TierId = "free" | "growth" | "scale";

export interface MeteredItem {
  /** Number of units bundled in the base subscription. Beyond this we
   *  bill the per-unit price. For Scale agent runs this is 0 — every
   *  run is metered. */
  includedQty: number;
  /** Per-unit price in dollars. Used for in-app overage estimation. */
  pricePerUnit: number;
  /** Stripe price id of the metered overage line. Empty string means
   *  the price hasn't been created in Stripe yet — checkout will skip
   *  this line. The base flat subscription still works; meter events
   *  are reported but not billed until the price exists. */
  stripePriceId: string;
  /** Stripe meter `event_name` the price consumes. Used by
   *  `lib/billing/meters.ts` when emitting meter events. */
  meterEventName: string;
}

export interface Plan {
  id: TierId;
  name: string;
  /** Public-facing one-liner shown on /pricing + /settings/billing. */
  tagline: string;
  /** Internal classification — keeps backward compat with old code
   *  that did `plan.type === "pro"`. New code should branch on
   *  `plan.id` instead. */
  type: "free" | "paid";
  /** Flat base price in dollars/mo. 0 for Free. */
  price: number;
  /** Yearly base price in dollars/yr. 0 = no yearly variant yet. */
  yearlyPrice: number;
  /** Stripe price id for the base flat subscription. Empty string for
   *  Free (Free has no Stripe subscription). */
  stripePriceId: string;
  stripeYearlyPriceId: string;
  limits: {
    /** Max workspaces under the same Stripe customer. -1 = unlimited. */
    maxOrgs: number;
    /** Hard cap on total contacts per workspace. -1 = unlimited.
     *  Free is hard-capped (no overage); Growth has soft-cap with
     *  metered overage; Scale is unlimited. */
    maxContacts: number;
    /** Hard cap on agent runs per calendar month. -1 = unlimited.
     *  Free hard-caps; Growth + Scale soft-cap (overage metered). */
    maxAgentRunsPerMonth: number;
    customDomain: boolean;
    removeBranding: boolean;
    fullWhiteLabel: boolean;
    clientPortal: boolean;
    prioritySupport: boolean;
  };
  /** Metered overage items added to the subscription on checkout.
   *  Null means the tier has no overage line for that resource. */
  metered: {
    contacts: MeteredItem | null;
    agentRuns: MeteredItem | null;
  };
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Free forever — upgrade when you grow",
    type: "free",
    price: 0,
    yearlyPrice: 0,
    stripePriceId: "",
    stripeYearlyPriceId: "",
    limits: {
      maxOrgs: 1,
      maxContacts: 50,
      maxAgentRunsPerMonth: 100,
      customDomain: false,
      removeBranding: false,
      fullWhiteLabel: false,
      clientPortal: false,
      prioritySupport: false,
    },
    metered: { contacts: null, agentRuns: null },
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For operators with paying clients",
    type: "paid",
    price: 29,
    yearlyPrice: 0,
    stripePriceId: GROWTH_BASE_PRICE_ID,
    stripeYearlyPriceId: "",
    limits: {
      maxOrgs: 3,
      maxContacts: -1,
      maxAgentRunsPerMonth: -1,
      customDomain: true,
      removeBranding: true,
      fullWhiteLabel: false,
      clientPortal: true,
      prioritySupport: false,
    },
    metered: {
      contacts: {
        includedQty: 500,
        pricePerUnit: 0.02,
        stripePriceId: GROWTH_CONTACTS_PRICE_ID,
        meterEventName: "seldonframe_contacts",
      },
      agentRuns: {
        includedQty: 1000,
        pricePerUnit: 0.03,
        stripePriceId: GROWTH_AGENT_RUNS_PRICE_ID,
        meterEventName: "seldonframe_agent_runs",
      },
    },
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "For agencies building for multiple clients",
    type: "paid",
    price: 99,
    yearlyPrice: 0,
    stripePriceId: SCALE_BASE_PRICE_ID,
    stripeYearlyPriceId: "",
    limits: {
      maxOrgs: -1,
      maxContacts: -1,
      maxAgentRunsPerMonth: -1,
      customDomain: true,
      removeBranding: true,
      fullWhiteLabel: true,
      clientPortal: true,
      prioritySupport: true,
    },
    metered: {
      contacts: null,
      agentRuns: {
        includedQty: 0,
        pricePerUnit: 0.02,
        stripePriceId: SCALE_AGENT_RUNS_PRICE_ID,
        meterEventName: "seldonframe_agent_runs",
      },
    },
  },
];

/** Legacy plan-id → new tier-id remap. Used by `getPlan()` so a stale
 *  `users.planId` value (e.g. "cloud-starter") still resolves to a
 *  current Plan object. Existing paying customers on legacy tiers are
 *  grandfathered to the closest new tier (Starter → Growth, everything
 *  else → Scale). */
const LEGACY_PLAN_ID_REMAP: Record<string, TierId> = {
  // Old kebab ids
  "cloud-starter": "growth",
  "cloud-pro": "scale",
  "pro-3": "scale",
  "pro-5": "scale",
  "pro-10": "scale",
  "pro-20": "scale",
  // Old snake / single-word ids (some surfaces store these)
  cloud_starter: "growth",
  cloud_pro: "scale",
  pro_3: "scale",
  pro_5: "scale",
  pro_10: "scale",
  pro_20: "scale",
  starter: "growth",
  pro: "scale",
};

export function getPlan(planId: string): Plan | undefined {
  // Direct hit on a current tier id
  const direct = PLANS.find((plan) => plan.id === planId);
  if (direct) return direct;

  // Legacy alias remap
  const remapped = LEGACY_PLAN_ID_REMAP[planId];
  if (remapped) return PLANS.find((plan) => plan.id === remapped);

  return undefined;
}

export function getCloudPlans(): Plan[] {
  return PLANS.filter((plan) => plan.type === "paid");
}

/** @deprecated The old "Pro" tier family no longer exists. Returns
 *  empty array. Kept so legacy callers don't break — remove once
 *  references are gone. */
export function getProPlans(): Plan[] {
  return [];
}

/** Resolve the plan that owns a given Stripe base price id. Walks new
 *  tier prices first, then legacy ids (which are pinned to growth /
 *  scale via constants below). Returns null for metered overage prices
 *  — those are not standalone plans. */
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

  // Legacy price ids — grandfathered to growth or scale. Match by the
  // hard-coded legacy constants so this works regardless of env vars.
  const growth = PLANS.find((plan) => plan.id === "growth");
  const scale = PLANS.find((plan) => plan.id === "scale");

  if (priceId === LEGACY_CLOUD_STARTER_PRICE_ID && growth) {
    return { plan: growth, billingPeriod: "monthly" };
  }
  if (
    (priceId === LEGACY_CLOUD_PRO_PRICE_ID || priceId === LEGACY_CLOUD_AGENCY_PRICE_ID) &&
    scale
  ) {
    return { plan: scale, billingPeriod: "monthly" };
  }

  return null;
}

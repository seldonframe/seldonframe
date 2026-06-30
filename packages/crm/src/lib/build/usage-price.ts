// set_usage_price — pure resolver for the builder usage-pricing tool (P0 Task 4).
//
// The MCP tool set_usage_price({ listingId, model, amountCents, outcomeType? })
// is how a builder sets a USAGE price on their listing from the IDE. It is
// ADDITIVE + intent/display only: it writes the marketplace_listings pricing
// columns (per_call_price_cents / per_outcome_price_cents + price_model) and
// NEVER charges anyone (metered settlement is a later x402/AP2 rail). This
// module owns the validation + the mapping of the spec's two usage models onto
// the persisted columns, reusing the shared normalizePricingForPersist so the
// route is a thin DB update. Pure (no I/O, no React).
//
// Model name note: the spec exposes `per_call` and `per_outcome`. The persisted
// price_model enum calls the per-call model `per_usage` (stored in
// per_call_price_cents). We translate per_call → per_usage here so the wire
// vocabulary matches the spec while the DB stays consistent with the storefront.

import {
  normalizePricingForPersist,
  isOutcomeType,
  type OutcomeType,
  type PricingPersist,
} from "@/lib/marketplace/pricing-model";

/** The usage models a builder can set from the IDE tool. (onetime/monthly are
 *  set via the listing editor, not this tool.) */
export type UsagePriceModel = "per_call" | "per_outcome";

export type UsagePriceInput = {
  model: UsagePriceModel;
  /** The price in whole cents (> 0). Floored to an integer. */
  amountCents: number;
  /** Required when model === 'per_outcome'. */
  outcomeType?: OutcomeType | string | null;
};

export type UsagePriceResolution =
  | { ok: true; persist: PricingPersist; label: string }
  | { ok: false; error: string };

/** A cents-accurate price label for echo-back, e.g. 10 → "$0.10 per call". The
 *  storefront's priceModelLabel is whole-dollar (so 10¢ would read "Free"); this
 *  builder echo needs sub-dollar precision. */
function usageLabel(model: UsagePriceModel, cents: number, outcome: OutcomeType | null): string {
  const dollars = (cents / 100).toFixed(2);
  if (model === "per_call") return `$${dollars} per call`;
  return `$${dollars} per ${outcome ?? "outcome"}`;
}

/**
 * Validate + resolve a usage-price update to the exact columns to persist.
 * - model must be per_call | per_outcome (others rejected — wrong surface).
 * - amountCents must be a finite number > 0 (floored to whole cents).
 * - per_outcome additionally requires a valid outcomeType.
 * The persisted columns come from normalizePricingForPersist (which zeroes/nulls
 * every non-selected model amount), so a builder can switch models without
 * leaving a stale amount behind. Pure.
 */
export function resolveUsagePriceUpdate(input: UsagePriceInput): UsagePriceResolution {
  const model = input.model;
  if (model !== "per_call" && model !== "per_outcome") {
    return {
      ok: false,
      error: `Unsupported usage model "${String(model)}". Use "per_call" or "per_outcome".`,
    };
  }

  const cents = Math.floor(Number(input.amountCents));
  if (!Number.isFinite(cents) || cents <= 0) {
    return { ok: false, error: "amountCents must be a whole number of cents greater than 0." };
  }

  if (model === "per_outcome" && !isOutcomeType(input.outcomeType)) {
    return {
      ok: false,
      error: 'per_outcome requires an outcomeType: "booking", "review", "quote", or "message".',
    };
  }

  const outcome: OutcomeType | null = isOutcomeType(input.outcomeType) ? input.outcomeType : null;

  // Map the spec's per_call onto the persisted per_usage model + its column.
  const persist =
    model === "per_call"
      ? normalizePricingForPersist({ priceModel: "per_usage", priceCents: 0, perCallPriceCents: cents })
      : normalizePricingForPersist({
          priceModel: "per_outcome",
          priceCents: 0,
          perOutcomePriceCents: cents,
          outcomeType: outcome,
        });

  return { ok: true, persist, label: usageLabel(model, cents, outcome) };
}

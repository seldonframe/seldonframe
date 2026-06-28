// Agent marketplace — pricing MODEL pure logic (BUILD #2).
//
// A seller picks ONE pricing model for their listing. This module is the single
// source of truth for validating, labelling, and normalizing-for-persist the
// four models, so the server action, the publish UI, and the earnings dashboard
// all agree. Pure — no DB, no React.
//
// Models:
//   - onetime    → the original one-time install price, stored in `price`
//                  (cents). price 0 = "free" and is explicitly allowed.
//   - monthly    → recurring, stored in monthly_price_cents.
//   - per_usage  → metered per agent call, stored in per_call_price_cents.
//   - per_outcome→ metered per billable outcome, stored in per_outcome_price_cents
//                  + outcome_type (booking | review | quote | message).
//
// IMPORTANT: this build SETS + DISPLAYS the chosen model. The actual metered
// SETTLEMENT for per_usage / per_outcome is a later x402/AP2 follow-on — nothing
// here charges money. The 5% marketplace fee (earnings.ts) still applies to the
// gross the seller reports, exactly as before.
//
// Audience is GUIDANCE, not a gate: research shows ~27% of SMBs now also want
// outcome pricing, so all four models are selectable for any seller.

export const PRICE_MODELS = ["onetime", "monthly", "per_usage", "per_outcome"] as const;
export type PriceModel = (typeof PRICE_MODELS)[number];

export const OUTCOME_TYPES = ["booking", "review", "quote", "message"] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

/** The label suffix shown for each billable outcome ("$10 per booking"). */
const OUTCOME_NOUN: Record<OutcomeType, string> = {
  booking: "booking",
  review: "review",
  quote: "quote",
  message: "message",
};

export function isPriceModel(v: unknown): v is PriceModel {
  return typeof v === "string" && (PRICE_MODELS as readonly string[]).includes(v);
}

export function isOutcomeType(v: unknown): v is OutcomeType {
  return typeof v === "string" && (OUTCOME_TYPES as readonly string[]).includes(v);
}

/** The pricing form-state / persisted-row projection this module reasons over. */
export type PricingInput = {
  priceModel: PriceModel;
  /** The one-time install price in cents (the `price` column). 0 = free. */
  priceCents: number;
  monthlyPriceCents?: number | null;
  perCallPriceCents?: number | null;
  perOutcomePriceCents?: number | null;
  outcomeType?: OutcomeType | null;
};

export type PricingValidation = { ok: true } | { ok: false; reason: string };

/** A finite number strictly greater than zero. */
function gtZero(n: unknown): boolean {
  const v = Number(n);
  return Number.isFinite(v) && v > 0;
}

/** Clamp to a non-negative integer (cents); junk → 0. */
function nonNegIntCents(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.round(v);
}

/** Cents → whole-dollar string for labels: 2900 → "29", 4900 → "49". */
function dollars(cents: number | null | undefined): string {
  return String(Math.round(nonNegIntCents(cents) / 100));
}

/**
 * Validate that the amount the chosen model requires is present (> 0). `onetime`
 * is always valid (free = price 0 is allowed); `per_outcome` additionally
 * requires a valid outcomeType. An unknown model is invalid.
 */
export function validateListingPricing(input: PricingInput): PricingValidation {
  const model = input.priceModel;
  if (!isPriceModel(model)) return { ok: false, reason: "Unknown pricing model." };

  switch (model) {
    case "onetime":
      // Free (price 0) and any positive one-time price are both allowed.
      return { ok: true };
    case "monthly":
      return gtZero(input.monthlyPriceCents)
        ? { ok: true }
        : { ok: false, reason: "Enter a monthly price greater than $0." };
    case "per_usage":
      return gtZero(input.perCallPriceCents)
        ? { ok: true }
        : { ok: false, reason: "Enter a per-call price greater than $0." };
    case "per_outcome":
      if (!gtZero(input.perOutcomePriceCents)) {
        return { ok: false, reason: "Enter a per-outcome price greater than $0." };
      }
      if (!isOutcomeType(input.outcomeType)) {
        return { ok: false, reason: "Choose which outcome you bill for." };
      }
      return { ok: true };
    default: {
      // Exhaustiveness guard — if PRICE_MODELS grows, TS flags this.
      const _never: never = model;
      return { ok: false, reason: `Unsupported pricing model: ${String(_never)}` };
    }
  }
}

/**
 * The human price label the card / preview / earnings render. Mirrors the
 * storefront's whole-dollar style. A model whose amount isn't set yet (or
 * onetime with price 0) reads "Free" — never "$0/mo".
 */
export function priceModelLabel(input: PricingInput): string {
  const model = isPriceModel(input.priceModel) ? input.priceModel : "onetime";
  switch (model) {
    case "onetime":
      return gtZero(input.priceCents) ? `$${dollars(input.priceCents)} one-time` : "Free";
    case "monthly":
      return gtZero(input.monthlyPriceCents) ? `$${dollars(input.monthlyPriceCents)}/mo` : "Free";
    case "per_usage":
      return gtZero(input.perCallPriceCents)
        ? `$${dollars(input.perCallPriceCents)} per call`
        : "Free";
    case "per_outcome": {
      if (!gtZero(input.perOutcomePriceCents)) return "Free";
      const noun = isOutcomeType(input.outcomeType) ? OUTCOME_NOUN[input.outcomeType] : "outcome";
      return `$${dollars(input.perOutcomePriceCents)} per ${noun}`;
    }
    default:
      return "Free";
  }
}

/** The exact column values to persist on marketplace_listings for a model. */
export type PricingPersist = {
  priceModel: PriceModel;
  /** The one-time price column. Only non-zero for the `onetime` model. */
  price: number;
  monthlyPriceCents: number | null;
  perCallPriceCents: number | null;
  perOutcomePriceCents: number | null;
  outcomeType: OutcomeType | null;
};

/**
 * Project the chosen model onto the row columns, zeroing/nulling every
 * non-selected model so we never persist a stale cross-model amount. An amount
 * that isn't > 0 is stored as null (reads as "unset"), except `price`, which is
 * a NOT-NULL integer column and so is stored as 0. An unknown model is coerced
 * to `onetime` (safe default).
 */
export function normalizePricingForPersist(input: PricingInput): PricingPersist {
  const model = isPriceModel(input.priceModel) ? input.priceModel : "onetime";
  const base: PricingPersist = {
    priceModel: model,
    price: 0,
    monthlyPriceCents: null,
    perCallPriceCents: null,
    perOutcomePriceCents: null,
    outcomeType: null,
  };

  switch (model) {
    case "onetime":
      base.price = nonNegIntCents(input.priceCents);
      break;
    case "monthly": {
      const c = nonNegIntCents(input.monthlyPriceCents);
      base.monthlyPriceCents = c > 0 ? c : null;
      break;
    }
    case "per_usage": {
      const c = nonNegIntCents(input.perCallPriceCents);
      base.perCallPriceCents = c > 0 ? c : null;
      break;
    }
    case "per_outcome": {
      const c = nonNegIntCents(input.perOutcomePriceCents);
      base.perOutcomePriceCents = c > 0 ? c : null;
      base.outcomeType = isOutcomeType(input.outcomeType) ? input.outcomeType : null;
      break;
    }
  }

  return base;
}

// ─── storefront READ decision (the bug fix) ──────────────────────────────────
//
// The persisted marketplace_listings columns the storefront needs to price a
// listing. A non-`onetime` model keeps `price` at 0 and carries its amount in
// the matching *_cents column — so reading `price` alone makes a $29/mo listing
// look free. This is the SAME column set normalizePricingForPersist writes.

/** The pricing columns of a marketplace_listings row, as the storefront reads
 *  them. Every field is optional so partial rows (the curated starter rows, a
 *  pre-migration DB, the seed catalog) read as a plain one-time listing.
 *  `priceModel` may be absent/NULL on legacy rows → coerced to onetime. */
export type StorefrontPricingRow = {
  /** The legacy one-time install price column (cents). Source of truth for the
   *  `onetime` model; 0 for the others. */
  price?: number | null;
  priceModel?: PriceModel | string | null;
  monthlyPriceCents?: number | null;
  perCallPriceCents?: number | null;
  perOutcomePriceCents?: number | null;
  outcomeType?: OutcomeType | string | null;
};

/** What the storefront should display for a listing's price. */
export type StorefrontPrice = {
  /** The chargeable amount for the SELECTED model, in cents (0 when free/unset).
   *  Drives the sidebar "$X / per month" and the schema.org offers.price. */
  priceCents: number;
  /** The human label ("Free", "$29/mo", "$2 per call", "$49 one-time"). */
  label: string;
  /** Same as `label`, but UNDEFINED for one-time/free so the card keeps using
   *  its own priceLabel(priceCents) derivation (avoids double-formatting). Set
   *  only for the non-one-time models that priceCents alone can't express. */
  labelOverride: string | undefined;
  /** True when the listing charges anything under its selected model. */
  isPaid: boolean;
};

/**
 * Resolve the storefront price (cents + label) for a listing from its persisted
 * pricing columns. Pure. The single fix for the "$29/mo shows Free" bug: it
 * reads the SELECTED model's column, not just `price`.
 *
 * - onetime  → reads `price` (0 = Free). No override (card derives "$X/mo").
 * - monthly  → reads monthly_price_cents → "$29/mo".
 * - per_usage→ reads per_call_price_cents → "$2 per call".
 * - per_outcome → reads per_outcome_price_cents (+ outcome_type) → "$10 per booking".
 *
 * A model whose amount is unset reads "Free"/0 (never "$0/mo") so an in-progress
 * draft is honest. Unknown/legacy model → onetime (backward compatible).
 */
export function storefrontPriceFromRow(row: StorefrontPricingRow): StorefrontPrice {
  const model = isPriceModel(row.priceModel) ? row.priceModel : "onetime";
  const pricingInput: PricingInput = {
    priceModel: model,
    priceCents: nonNegIntCents(row.price),
    monthlyPriceCents: row.monthlyPriceCents ?? null,
    perCallPriceCents: row.perCallPriceCents ?? null,
    perOutcomePriceCents: row.perOutcomePriceCents ?? null,
    outcomeType: isOutcomeType(row.outcomeType) ? row.outcomeType : null,
  };

  const label = priceModelLabel(pricingInput);

  // The chargeable amount for the chosen model (0 for free / unset).
  const amountForModel = ((): number => {
    switch (model) {
      case "onetime":
        return nonNegIntCents(row.price);
      case "monthly":
        return nonNegIntCents(row.monthlyPriceCents);
      case "per_usage":
        return nonNegIntCents(row.perCallPriceCents);
      case "per_outcome":
        return nonNegIntCents(row.perOutcomePriceCents);
      default:
        return nonNegIntCents(row.price);
    }
  })();

  const isPaid = amountForModel > 0;
  // Only the non-one-time models need an explicit override; for onetime/free the
  // card's priceLabel(priceCents) already produces the right thing.
  const labelOverride = model === "onetime" ? undefined : isPaid ? label : undefined;

  return { priceCents: amountForModel, label, labelOverride, isPaid };
}

// ─── publish/edit GATE decision ──────────────────────────────────────────────

/**
 * The publish/edit gate, extracted pure so the seller action, the publish route,
 * and tests all agree. A free listing always goes live (price 0, no Connect). A
 * paid listing goes live ONLY when the seller's Stripe Connect is ready (charges
 * enabled); otherwise it is saved as a draft and the UI is told to prompt the
 * connect flow (`needsConnect`). This is the money-safe fallback: a paid agent
 * without Stripe stays unpublished rather than charging through an unconfigured
 * account.
 */
export function resolveListingPublishState(input: {
  isPaid: boolean;
  connectReady: boolean;
}): { isPublished: boolean; needsConnect: boolean } {
  if (!input.isPaid) {
    return { isPublished: true, needsConnect: false };
  }
  return input.connectReady
    ? { isPublished: true, needsConnect: false }
    : { isPublished: false, needsConnect: true };
}

// ─── selling clarity banner state ────────────────────────────────────────────

/** Which clarity message the listing editor's "how selling works" banner shows.
 *  - "free"          → a free price is selected; no Stripe needed, no warning.
 *  - "active"        → a paid price is selected AND Stripe Connect is ready.
 *  - "needs_connect" → a paid price is selected but Stripe isn't connected yet
 *                      (the agent will list as "Free to install" until it is). */
export type SellingBannerState = "active" | "needs_connect" | "free";

/**
 * Decide the clarity-banner state from the seller's connect status + whether the
 * currently-selected pricing is paid. Pure mirror of the publish gate
 * (`resolveListingPublishState`) for the *explainer* surface: free pricing never
 * warns; paid pricing reads "active" only when Stripe is connected, otherwise
 * "needs_connect". Fail-soft: an unknown connect status (treated as
 * `connectReady:false`) on a paid price degrades to "needs_connect" — the
 * neutral "connect to turn on paid pricing" prompt, never a false "active".
 */
export function sellingBannerState(input: {
  connectReady: boolean;
  isPaidSelected: boolean;
}): SellingBannerState {
  if (!input.isPaidSelected) return "free";
  return input.connectReady ? "active" : "needs_connect";
}

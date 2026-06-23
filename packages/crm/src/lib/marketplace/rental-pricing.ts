// Agent marketplace — the THREE-LANE rental charge resolver (pure, no DB).
//
// The MCP rental rail (lib/marketplace/agent-mcp-handler) meters every billable
// `tools/call` (deterministic tool or `ask`). This module is the single source
// of truth for WHICH pricing lane a call falls into and HOW MUCH it costs, so
// the rail can decide whether to return an x402 `402 Payment Required`. Pure:
// same input → same output, no IO, no money moved here.
//
// THE THREE LANES (confirmed by Max):
//   1. SeldonFrame FIRST-PARTY agents — FREE up to SF_FREE_CALLS per renter /
//      listing / month, then a low floor (SF_FLOOR_CENTS_PER_CALL). SF keeps
//      100% of its OWN agent's calls, so feeCents == amountCents (the whole
//      charge is SF's).
//   2. BUILDERS' agents — the listing's metered priceModel amount (per_usage
//      perCallPriceCents / per_outcome perOutcomePriceCents) PLUS the SF 5%
//      marketplace fee (computeMarketplaceFeeCents — the SAME primitive the
//      checkout + earnings paths use, so the builder's "you keep 95%" is exact).
//   3. DEPLOY-into-workspace — NOT this rail (it's the $29/mo workspace on the
//      renter's BYOK; no per-call meter), so it never reaches this resolver.
//
// `isFirstParty` is decided by the CALLER (the rail), by comparing the listing's
// creatorOrgId to the configured SeldonFrame house org (SELDONFRAME_HOUSE_ORG_ID
// — see isFirstPartyListing). When that env is unset, NO listing is first-party,
// so every agent bills on the builder lane (fail-safe: SF never silently grants
// its free/floor lane to a builder it can't prove it owns).

import { computeMarketplaceFeeCents } from "@/lib/billing/gmv";
import type { PriceModel, OutcomeType } from "@/lib/marketplace/pricing-model";

/**
 * SeldonFrame first-party free allowance: the number of rental calls a renter
 * gets FREE per first-party listing per calendar month before the floor kicks
 * in. Exported so UI/copy never hardcodes "100".
 */
export const SF_FREE_CALLS = 100;

/**
 * The per-call floor (in cents) SF charges on its OWN first-party agents once a
 * renter exhausts SF_FREE_CALLS for the month. A deliberately low number — the
 * point is a nominal meter, not margin. Exported so UI/copy never hardcodes "2".
 */
export const SF_FLOOR_CENTS_PER_CALL = 2;

/** The pricing-menu projection of a listing the resolver reasons over. Mirrors
 *  the relevant marketplace_listings columns. */
export type RentalChargeListing = {
  priceModel: PriceModel;
  perCallPriceCents?: number | null;
  perOutcomePriceCents?: number | null;
  monthlyPriceCents?: number | null;
  outcomeType?: OutcomeType | null;
};

/** Which lane a metered rental call resolves to. */
export type RentalChargeLane =
  | "sf_free" // first-party, inside the monthly allowance → $0
  | "sf_floor" // first-party, over the allowance → the SF floor (SF keeps 100%)
  | "builder" // a builder's metered listing → priceModel amount + SF 5%
  | "free"; // a non-metered / unpriced call → $0

export type RentalCharge = {
  lane: RentalChargeLane;
  /** What the renter pays for THIS call, in cents (0 for free lanes). */
  amountCents: number;
  /** Whether the rail must demand payment (HTTP 402) before serving the call. */
  requiresPayment: boolean;
  /** SF's cut of `amountCents`: the full floor on the SF lane, the 5% fee on
   *  the builder lane, 0 on free lanes. */
  feeCents: number;
};

/** Clamp to a finite, non-negative integer (cents); junk → 0. */
function nonNegIntCents(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.round(v);
}

/**
 * Resolve the charge for ONE metered rental call across the three lanes.
 *
 * @param listing               the listing's pricing projection
 * @param isFirstParty          true iff the listing's creator IS the SF house org
 * @param renterCallsThisMonth  rental calls this renter ALREADY made against this
 *                              listing in the current calendar month (so this is
 *                              call number renterCallsThisMonth + 1)
 */
export function resolveRentalCharge(input: {
  listing: RentalChargeListing;
  isFirstParty: boolean;
  renterCallsThisMonth: number;
}): RentalCharge {
  const { listing, isFirstParty, renterCallsThisMonth } = input;

  // ── Lane 1: SeldonFrame first-party. ──
  if (isFirstParty) {
    // FAIL-CLOSED on money: only a counter we can PROVE is below the allowance
    // earns the free lane. A non-finite/corrupt counter is NOT < allowance, so
    // it falls through to the floor (never grant unlimited free calls by
    // accident). A negative counter is below the allowance → free (harmless).
    const used = Number(renterCallsThisMonth);
    const insideAllowance = Number.isFinite(used) && used < SF_FREE_CALLS;
    if (insideAllowance) {
      return { lane: "sf_free", amountCents: 0, requiresPayment: false, feeCents: 0 };
    }
    // Over the allowance → the floor. SF keeps 100% of its own agent's charge.
    return {
      lane: "sf_floor",
      amountCents: SF_FLOOR_CENTS_PER_CALL,
      requiresPayment: true,
      feeCents: SF_FLOOR_CENTS_PER_CALL,
    };
  }

  // ── Lane 2: a builder's agent. Only PER-CALL metered models bill on this
  // per-call rail (per_usage / per_outcome). onetime/monthly/unpriced → free
  // here (their settlement, if any, happens off this rail). ──
  const perCallCents = meteredAmountCents(listing);
  if (perCallCents > 0) {
    return {
      lane: "builder",
      amountCents: perCallCents,
      requiresPayment: true,
      // The SAME 5% primitive checkout + earnings use → "you keep 95%" is exact.
      feeCents: computeMarketplaceFeeCents(perCallCents),
    };
  }

  // ── Free: nothing to meter on this call. ──
  return { lane: "free", amountCents: 0, requiresPayment: false, feeCents: 0 };
}

/**
 * The per-call amount (cents) a builder's metered model charges, or 0 when the
 * model isn't per-call-metered (onetime/monthly) or its amount is unset/junk.
 * per_usage reads perCallPriceCents; per_outcome reads perOutcomePriceCents
 * (each metered call IS the billable outcome for an outcome-priced agent on
 * this rail).
 */
function meteredAmountCents(listing: RentalChargeListing): number {
  switch (listing.priceModel) {
    case "per_usage":
      return nonNegIntCents(listing.perCallPriceCents);
    case "per_outcome":
      return nonNegIntCents(listing.perOutcomePriceCents);
    default:
      // onetime / monthly / unknown → not metered per call on this rail.
      return 0;
  }
}

/**
 * Decide whether a listing is a SeldonFrame FIRST-PARTY agent: its creator org
 * is the configured SF house org. Returns false when SELDONFRAME_HOUSE_ORG_ID is
 * unset/blank — fail-safe, so SF never grants its free/floor lane to a builder
 * agent it can't prove it owns (those bill on the builder lane). Max must set
 * SELDONFRAME_HOUSE_ORG_ID to the SF house org's id to activate lane 1.
 */
export function isFirstPartyListing(
  creatorOrgId: string,
  houseOrgId: string | undefined = process.env.SELDONFRAME_HOUSE_ORG_ID,
): boolean {
  const house = (houseOrgId ?? "").trim();
  if (!house) return false;
  return creatorOrgId === house;
}

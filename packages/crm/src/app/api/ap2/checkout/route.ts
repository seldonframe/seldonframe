// AP2 (Agent Payments Protocol) checkout endpoint — the mandate-verification +
// cart-authorization layer that settles through the EXISTING x402 rail.
//
//   POST /api/ap2/checkout
//   Step 1 (present cart):  { cart_mandate, intent_mandate? }
//                           → 402 + x402 PaymentRequirements + AP2 challenge
//   Step 2 (pay):           { cart_mandate, payment_mandate } + X-PAYMENT header
//                           → 200 receipt (settled via the INERT x402 verifier)
//
// AP2 is Google's open, payment-method-agnostic protocol for agentic commerce:
// signed MANDATES (Intent → Cart → Payment) prove user intent, and x402 is one
// of its native settlement rails. SeldonFrame already has the x402 rail merged
// (inert). This endpoint adds the AP2 mandate layer ON TOP, settling through the
// same x402 path — reaching Google/Gemini + the UCP umbrella while reusing
// everything already built.
//
// This route is a THIN wrapper: it binds the REAL deps + maps the DI'd handler's
// { status, body } onto NextResponse. All verify/settle/log logic lives in
// lib/ap2/handler (unit-tested with fakes).
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY: settlement is delegated to x402's `devStubVerifier` (below),
// which moves NO money — it validates the payment's shape + amount and returns a
// fake `dev-` reference. There is NO facilitator wired here. To turn on live
// USDC settlement, Max swaps `settlementVerifier` for
// coinbaseFacilitatorVerifier(...) (see lib/marketplace/x402.ts) and sets the
// same x402 env (X402_FACILITATOR_URL/KEY, X402_PAY_TO) — the identical flip
// that turns the metered-rental rail live. AP2 adds no separate money path.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";
import { handleAp2Checkout, type Ap2CheckoutDeps, type ResolvedListing } from "@/lib/ap2/handler";
import { getAp2SigningSecret } from "@/lib/ap2/signing-secret";
import { devStubVerifier } from "@/lib/marketplace/x402";
import { trackEvent } from "@/lib/analytics/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CORS: an AP2 client is typically a server-side agent, but mirror the rental
// endpoint's permissive stance + advertise the X-PAYMENT header the x402 retry
// carries. Authorization happens via the signed mandates, not the Origin.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, X-Payment",
  "Access-Control-Max-Age": "86400",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** The canonical resource URL the x402 402 body advertises (this endpoint). */
function resourceUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.seldonframe.com").replace(/\/$/, "");
  return `${base}/api/ap2/checkout`;
}

/**
 * DB-backed published-listing resolver: a cart item's `listing_slug` →
 * a published marketplace listing + its creator (seller) org. Mirrors
 * resolveRentalAgent's query shape. Returns null when the slug isn't a published
 * listing, which the handler maps to 404.
 */
async function resolveListing(slug: string): Promise<ResolvedListing | null> {
  const [row] = await db
    .select({
      id: marketplaceListings.id,
      slug: marketplaceListings.slug,
      name: marketplaceListings.name,
      price: marketplaceListings.price,
      creatorOrgId: marketplaceListings.creatorOrgId,
    })
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.slug, slug), eq(marketplaceListings.isPublished, true)))
    .limit(1);

  if (!row) return null;
  return {
    slug: row.slug,
    listingId: row.id,
    name: row.name,
    priceCents: row.price ?? 0,
    creatorOrgId: row.creatorOrgId,
  };
}

const REAL_DEPS: Ap2CheckoutDeps = {
  getSecret: getAp2SigningSecret,
  now: () => new Date(),
  resolveListing,
  resource: resourceUrl(),
  // X402_PAY_TO → the USDC address that receives settlement (Max's setup). When
  // unset, an empty pay-to still yields a 402 body, but no real settlement can
  // occur (the verifier is the dev stub regardless) — so prod stays money-safe.
  payTo: process.env.X402_PAY_TO ?? "",
  // Log the settled payment as a `seldonframe_events` `ap2_settlement` row,
  // attributed to the SELLER org — the SAME accrual shape the x402 metered-
  // rental rail logs (`agent_rental_call`), which the seller-earnings dashboard
  // reads. amount_cents + fee_cents (5% marketplace cut) ride the property bag;
  // no migration.
  logSettlement: (entry) =>
    trackEvent(
      "ap2_settlement",
      {
        cart_ref: entry.cartRef,
        listing_id: entry.listingId,
        amount_cents: entry.amountCents,
        fee_cents: entry.feeCents,
        payment_ref: entry.paymentRef,
        method: entry.method,
        seller_org_id: entry.sellerOrgId,
      },
      // Attribute to the SELLER org (whose listing earned the sale — the side the
      // 5% accrues to).
      { orgId: entry.sellerOrgId },
    ),

  // ── x402 settlement verifier. The DEV STUB → NO money moves. To turn on live
  // USDC settlement, Max swaps this for coinbaseFacilitatorVerifier(...) (see
  // lib/marketplace/x402.ts) + sets X402_FACILITATOR_URL/KEY + X402_PAY_TO.
  settlementVerifier: devStubVerifier, // TODO(Max): coinbaseFacilitatorVerifier
};

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", reason: "Body must be valid JSON." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const xPayment = request.headers.get("x-payment");
  const outcome = await handleAp2Checkout(
    (body ?? {}) as Parameters<typeof handleAp2Checkout>[0],
    xPayment,
    REAL_DEPS,
  );

  return NextResponse.json(outcome.body, { status: outcome.status, headers: CORS_HEADERS });
}

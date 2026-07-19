// packages/crm/src/lib/billing/start-checkout.ts
//
// Browser-side helper used by UpgradeModal to wire its upgrade buttons to
// the /api/stripe/checkout route. Returns the Stripe checkout URL the
// caller redirects to (`window.location.href = url`).
//
// The /api/stripe/checkout route at packages/crm/src/app/api/stripe/checkout/route.ts
// understands `{ tier: "builder" | "workspace" | "agency" }` body fields
// and assembles the per-tier base line item + the payment-critical
// metadata via `buildCheckoutSessionParams(...)`. This helper just builds
// the JSON body with the right `successPath` + `cancelPath` and POSTs it.
//
// 2026-06-18 pricing migration (Phase 3): the tier union is the new
// ladder (builder / workspace / agency). Legacy "growth"/"scale" no
// longer originate from the client; the route still accepts them for
// replayed/old links.
//
// 2026-07-08 hydration-mismatch fix ("no price id lives in the client") —
// `priceId` DROPPED from this helper's input. The route resolves the
// Stripe price id server-side from `tier` alone (PLANS lookup, see
// route.ts's `targetTier` resolution — `tier` is checked FIRST, before
// any priceId fallback); the client never needed to know a Stripe price
// id at all, and importing STRIPE_*_PRICE_ID constants into a "use
// client" caller (the old upgrade-modal.tsx) baked an always-undefined
// (browser-side env is server-only) value into the bundle for no reason.
//
// TDD-extractable so the modal can be tested without poking at fetch
// globals.

import type { TierId } from "@/lib/billing/plans";

export type StartCheckoutInput = {
  tier: TierId;
  /** Test seam — production callers omit and fall back to global `fetch`. */
  fetchImpl?: typeof fetch;
};

export type StartCheckoutResult = {
  url: string;
};

export async function startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
  const fetchFn = input.fetchImpl ?? fetch;
  const response = await fetchFn("/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tier: input.tier,
      successPath: `/dashboard?upgraded=${input.tier}`,
      cancelPath: "/clients",
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { url?: string; error?: string }
    | null;

  if (!response.ok) {
    // contract:throw-ok: browser-side helper — the sole caller
    // (upgrade-modal's upgrade()) try/catches and renders the message
    // via setError; the throw IS the structured error channel here.
    throw new Error(payload?.error ?? `checkout failed: ${response.status}`);
  }

  if (!payload?.url) {
    // contract:throw-ok: same as above — caught by upgrade-modal and
    // rendered as an inline error state.
    throw new Error("checkout response missing url");
  }

  return { url: payload.url };
}

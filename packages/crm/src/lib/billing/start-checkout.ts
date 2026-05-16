// packages/crm/src/lib/billing/start-checkout.ts
//
// Browser-side helper used by UpgradeModal (Cut A) to wire its two upgrade
// buttons to the existing /api/stripe/checkout route. Returns the Stripe
// checkout URL the caller redirects to (`window.location.href = url`).
//
// The existing /api/stripe/checkout route at packages/crm/src/app/api/stripe/checkout/route.ts
// already understands `{ tier: "growth" | "scale" }` body fields (lines 117,
// 136-137) and assembles the multi-price line items via
// `buildCheckoutLineItemsForTier(targetTier)`. This helper just builds the
// JSON body with the right `successPath` + `cancelPath` and POSTs it.
//
// Cut B Phase 5, Task 28 — TDD-extractable so the modal can be tested
// without poking at fetch globals.

type AgencyTier = "growth" | "scale";

export type StartCheckoutInput = {
  priceId: string;
  tier: AgencyTier;
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
      priceId: input.priceId,
      tier: input.tier,
      successPath: `/dashboard?upgraded=${input.tier}`,
      cancelPath: "/clients",
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { url?: string; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `checkout failed: ${response.status}`);
  }

  if (!payload?.url) {
    throw new Error("checkout response missing url");
  }

  return { url: payload.url };
}

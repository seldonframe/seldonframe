// packages/crm/src/lib/billing/domain-gate.ts
//
// 2026-05-27 — /settings/domain becomes the new upgrade trigger.
//
// Context: the deferred-card signup flow (commit c519b75e) moved card
// capture out of the mandatory signup chain. That change unblocked
// onboarding completion BUT removed every nudge that pushed free-tier
// operators toward saving a card. The 3-step onboarding arc now ends
// at /settings/domain:
//
//   Step 1 — /signup/connect-ai           (add Anthropic API key)
//   Step 2 — /clients/new → build → Ready (see the magic)
//   Step 3 — /settings/domain             (custom domain → upgrade nudge)
//
// This helper turns step 3 into the upgrade trigger. The previous
// /settings/domain used <UpgradeGate> which blurred the form behind a
// "Upgrade to Cloud" overlay — too generic for the new onboarding arc,
// and the CTA hit /settings/billing (which assumes the user already
// has a card on file and is browsing tier comparisons). The new gate:
//
//   - Free + NO card on file        → upsell with "Add a card to unlock"
//                                      CTA → /signup/billing?next=/settings/domain
//   - Free + card on file already   → render the existing domain form
//                                      (they've already done the card-on-file step;
//                                      the next ask is a paid plan, which lives
//                                      under /settings/billing — out of scope here)
//   - Growth / Scale (paid)         → render the existing domain form
//
// The "free + card on file" branch falls through to the form so we don't
// double-charge users for the same gesture — they already cleared the
// card hurdle once; if they actually try to connect a domain we let
// /lib/domains/actions.ts handle the entitlement check at action time
// (it already gates via getOrgFeatures(tier).customDomains).
//
// Pure-function shape with dependency injection so the gate decision is
// unit-testable without a DB. The page layer composes the real readers.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { resolveTierForWorkspace } from "./tier-resolver";
import { normalizeTierId, type BillingTier } from "./features";

export type DomainGateDecision =
  /** Tier qualifies (paid) OR no-plan user already has a card on
   *  file. Render the existing domain-connection form. */
  | { kind: "render-form"; tier: BillingTier; reason: "paid-tier" | "free-tier-with-card" }
  /** No active plan AND no card on file. Render the upsell card instead
   *  of the form. The CTA routes to /signup/billing?next=/settings/domain
   *  so the user lands back on the form once the card is saved. */
  | { kind: "render-upsell"; tier: "inactive" };

export type DomainGateInputs = {
  /** The resolved tier string (already legacy-normalised). The page
   *  layer reads this via resolveTierForWorkspace + normalizeTierId. */
  tier: BillingTier;
  /** Whether `users.stripe_payment_method_id` is non-null for the
   *  acting user. The page layer reads this via the users table. */
  hasCardOnFile: boolean;
};

/**
 * Pure gate function — given a tier and a card-on-file flag, decides
 * which surface to render. Easily unit-testable.
 *
 * Decision tree:
 *   tier !== "free"         → render-form (paid-tier)
 *   tier === "free" + card  → render-form (free-tier-with-card)
 *   tier === "free" + nope  → render-upsell
 */
export function decideDomainGate(inputs: DomainGateInputs): DomainGateDecision {
  if (inputs.tier !== "inactive") {
    return { kind: "render-form", tier: inputs.tier, reason: "paid-tier" };
  }

  if (inputs.hasCardOnFile) {
    return { kind: "render-form", tier: "inactive", reason: "free-tier-with-card" };
  }

  return { kind: "render-upsell", tier: "inactive" };
}

/**
 * DB-bound wrapper. Reads the operator's user row to check
 * stripe_payment_method_id and resolves the workspace's effective tier
 * via the tier-resolver chain (so agency-managed workspaces inherit
 * their parent's paid tier).
 *
 * Returns the gate decision OR null when one of the inputs is missing
 * (no userId / no orgId). The page renders a generic "sign in" prompt
 * in that case.
 */
export async function resolveDomainGate(params: {
  userId: string | null | undefined;
  orgId: string | null | undefined;
}): Promise<DomainGateDecision | null> {
  if (!params.userId || !params.orgId) return null;

  const [userRow] = await db
    .select({ stripePaymentMethodId: users.stripePaymentMethodId })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  // No users row would mean an operator-portal session or admin-token
  // synthetic user — those don't carry a Stripe card. Fall through to
  // upsell so the upgrade nudge fires; the upsell CTA bounces them
  // through /signup/billing which has its own auth handling.
  const hasCardOnFile = Boolean(userRow?.stripePaymentMethodId);

  const rawTier = await resolveTierForWorkspace(params.orgId);
  const tier = normalizeTierId(rawTier);

  return decideDomainGate({ tier, hasCardOnFile });
}

# Recurring & Metered Agent Billing (#139) — Design

**Date:** 2026-06-28
**Status:** Spec for review. **LIVE-MONEY path — build money-safe (Stripe TEST mode first; real charges gated behind Max's keys + an explicit go-live).**
**Gates:** Max's live Stripe keys in Vercel + the #139 reset migration. Until then: test-mode only, no real card touched.

## Problem
The marketplace prices agents correctly (one-time / monthly / per_usage / per_outcome — fixed this session) but **charges nothing** — the ACP checkout is a v1 no-charge stub and storefront installs are free/BYOK. To actually bill buyers (recurring + metered) and pay sellers, wire **fiat Stripe Connect** settlement with the 5% marketplace fee. (The x402/AP2 crypto rail is a separate, optional agent-to-agent path — out of scope here.)

## Principle: reuse the rail, never charge in dev
- The rail already exists: **Stripe Connect** onboarding + one-time Checkout (Proposals), `computeMarketplaceFeeCents` (5% `MARKETPLACE_FEE_PERCENT`), the pricing-model columns, and the `agent_rental_call` usage counter.
- **Money-safety invariants (non-negotiable):** Stripe **test mode** is the default; the mode is **KEY-DERIVED** — `resolveBillingMode` returns `'live'` iff `STRIPE_SECRET_KEY` is a live key (`sk_live_`/`rk_live_`), else `'test'` (a test key, or no key → inert). So a live charge requires (a) the seller's Connect account `charges_enabled`, (b) a **live `STRIPE_SECRET_KEY` configured** (the label can't disagree with the key in play — there is **no separate go-live flag**), and (c) is never reachable from a dev/test conversation. The single enable flag is `SF_MARKETPLACE_BILLING`. Every Stripe create call uses an **idempotency key**. Every webhook **verifies the Stripe signature**. No real card is charged in any test/eval/dev path.

## The mechanism, per pricing model (all **PLATFORM destination charges**, 5% application fee)
**Architecture: platform destination charges.** Both one-time and subscription/metered charges are created on the **PLATFORM** Stripe account (NO `{ stripeAccount }` on any session/price/meter call). The customer, subscription, recurring Price, and Meter all live on the platform; the seller is paid via `transfer_data.destination` + the 5% application fee. Consequence: the marketplace settlement webhook (`/api/v1/marketplace/stripe/webhook`) is a normal **platform** endpoint — it does **not** need to listen to Connect (connected-account) events.

| Model | Stripe object | Fee |
|---|---|---|
| `onetime` | Checkout Session (mode=payment), `payment_intent_data.transfer_data.destination`=seller | `application_fee_amount` (5% of total) |
| `monthly` | **Subscription** (recurring monthly Price on platform), `subscription_data.transfer_data.destination`=seller | `application_fee_percent: 5` — Stripe splits every cycle |
| `per_usage` | **Metered** Subscription (usage-based Price + Meter on platform) + usage records | `application_fee_percent: 5` |
| `per_outcome` | Metered Subscription, one usage unit per outcome event | `application_fee_percent: 5` |

## Architecture

### Schema (additive — one migration)
`marketplace_purchases` (or extend the install row): `{ id, listingId, slug, buyerOrgId, sellerOrgId, priceModel, amountCents, stripeMode ('test'|'live'), stripeCustomerId, stripeSubscriptionId?, stripeCheckoutId?, status ('pending'|'active'|'past_due'|'canceled'), createdAt, currentPeriodEnd? }`. The `agent_rental_call` events already exist for metered usage — no new usage table.

### Flow
1. **Install of a PAID agent** (`installAgentAction` / the rental mint) → `createAgentPurchase`:
   - Resolve the seller's Connect account (`readConnectStatus`); if not `charges_enabled` → keep today's free-to-install fallback + a "seller hasn't enabled payouts" note (no charge).
   - `onetime` → a Checkout Session; `monthly`/`per_usage`/`per_outcome` → a Subscription (recurring or metered Price created/looked-up on the seller account) — all with the 5% fee + an **idempotency key** keyed on `(buyerOrg, listing, period)`. Persist the purchase row `status:pending`.
   - **Test mode unless live-gated.** Return the Checkout URL (one-time) or confirm the subscription (recurring).
2. **Webhook** `/api/v1/marketplace/stripe/webhook` (signature-verified, a **PLATFORM** endpoint — no Connect events): `checkout.session.completed` / `invoice.paid` → `status:active` + activate the install (+ stamp the platform `stripeCustomerId` / `stripeSubscriptionId`); `invoice.payment_failed` → `past_due` + grace/dunning; `customer.subscription.deleted` → `canceled` + deactivate. Idempotent on the Stripe event id.
3. **Metered reporting** — when a rented agent runs / an outcome fires (the existing `agent_rental_call` emit), push a Stripe **meter event** / usage record for the buyer's subscription item. Stripe bills at period end + withholds the 5%.

### Surfaces (truth, not estimates)
- **Buyer:** the install shows "Subscribed · $29/mo · next bill <date>" / "Past due — update payment"; a Manage-billing link (Stripe billing portal).
- **Seller (Revenue + the agents-list Marketplace column):** revenue switches from the current computed estimate to **settled** amounts from real `invoice.paid` events (the earnings engine already groups by listing — feed it settled rows).

## Phasing (each ships test-mode-safe)
- **P0** — schema (`marketplace_purchases`) + the key-derived test/live gate + the Stripe-ready predicate reuse. No charges.
- **P1** — `onetime` Checkout on the seller account + the 5% fee + the purchase row (proves Connect+fee+idempotency end-to-end in test mode).
- **P2** — `monthly` Subscription (`application_fee_percent`).
- **P3** — `per_usage`/`per_outcome` metered (usage records from `agent_rental_call`).
- **P4** — the signature-verified webhook (activate / past_due / cancel, idempotent) + the buyer billing-portal link.
- **P5** — settled revenue on the Revenue dashboard + the agents-list column (replace the estimate).

## Non-goals
- The x402/AP2 **crypto** rail (separate optional path for agent-to-agent USDC).
- The SMB's own service billing (Proposals/invoices — already 2% GMV, separate).
- Real charges in dev/test/eval — explicitly forbidden.

## Risks / gates
- **Live money:** test-mode default; live is KEY-DERIVED — gated by `charges_enabled` + a live `STRIPE_SECRET_KEY` (no separate go-live flag) + the `SF_MARKETPLACE_BILLING` enable flag. Idempotency keys everywhere. Webhook signature verification mandatory.
- **Tax/VAT** — Stripe Tax later; v1 tax=0 (matches the ACP session math).
- **Refunds/disputes** — surface but defer automation to a follow-up.
- **Reuse** the Proposals Connect onboarding + Checkout pattern (don't reinvent); the 5% fee primitive; the pricing-model columns; the rental counter.

## Related
The marketplace pricing-display fixes (this session), the 5% `MARKETPLACE_FEE_PERCENT`, Proposals' Stripe Connect, [[marketplace-distribution-state]], [[agent-marketplace]].

# #139 Recurring Agent Billing — P0 + P1 (one-time Checkout, money-safe)

Worktree: `.claude/worktrees/icp3-wedge/packages/crm` (branch feature/chatgpt-app-submission)

## Patterns being reused (investigated)
- **Connect Checkout w/ app-fee** — `src/lib/marketplace/actions.ts` `installAgentListingAction` (lines 583-618) already does `mode:"payment"` + `payment_intent_data.application_fee_amount = computeMarketplaceFeeCents(price)` + `transfer_data.destination = listing.stripeConnectAccountId`. MIRROR this; add money-safety gating + idempotency + a purchase row (it has none today).
- **Connect status** — `readConnectStatus` is `actions`-private in `seller-actions.ts`; the rail predicate is `stripeConnections.isActive === true` + `stripeAccountId`. Listings already denormalize the seller acct into `marketplaceListings.stripeConnectAccountId`.
- **Stripe client** — `@seldonframe/payments` `getStripeClient()` → null when `STRIPE_SECRET_KEY` unset (INERT seam). apiVersion 2025-08-27.basil.
- **Fee** — `computeMarketplaceFeeCents` + `MARKETPLACE_FEE_PERCENT=5` in `src/lib/billing/gmv.ts`.
- **Price** — `storefrontPriceFromRow` in `src/lib/marketplace/pricing-model.ts` → `{ priceCents, label, isPaid }`.
- **Money-safe idiom** — `src/lib/acp/processor.ts` (`resolveProcessor` env-flag throw-on-live, dev stub) + DI'd handler/store + fake-deps tests (`tests/unit/acp/*`). Mirror this exactly.
- **Additive table** — `src/db/schema/acp.ts` is the sibling template. Migration `drizzle/0058_*.sql` + journal entry idx 35 (CREATE TABLE IF NOT EXISTS, TIMESTAMPTZ, gen_random_uuid). `db:check-journaled` is the gate; `assert-schema-drift` only checks a curated column list (skips w/o DATABASE_URL).
- **Tests** — `node --import tsx --test <files>`, `node:test` + `node:assert/strict`, `@/` path alias. Pure/DI modules only (no Postgres).

## P0 — schema + pure gates
- [ ] `drizzle/0058_marketplace_purchases.sql` — CREATE TABLE IF NOT EXISTS marketplace_purchases (id uuid pk, listing_id, slug, buyer_org_id, seller_org_id, price_model, amount_cents, fee_cents, stripe_mode, stripe_customer_id?, stripe_checkout_id?, stripe_subscription_id?, status default 'pending', created_at, updated_at) + indexes (buyer, seller, checkout_id).
- [ ] Journal entry idx 35 → tag `0058_marketplace_purchases`.
- [ ] `src/db/schema/marketplace-purchases.ts` — drizzle pgTable + status/mode types + inferred row types.
- [ ] Export from `src/db/schema/index.ts`.
- [ ] `src/lib/marketplace/billing/purchases-store.ts` — pure store: createPurchase / updatePurchaseByCheckoutId / getPurchase (org-scoped read). DI seam mirroring acp/store.
- [ ] `src/lib/marketplace/billing/billing-mode.ts` — pure `resolveBillingMode(env)` → 'test'|'live' (KEY-DERIVED: 'live' iff STRIPE_SECRET_KEY is a live key — no separate go-live flag; the single enable flag is SF_MARKETPLACE_BILLING); `canChargeListing({priceModel, connectReady, billingEnabled})`.

## P1 — one-time Checkout (the proof)
- [ ] `src/lib/marketplace/billing/one-time-checkout.ts` — `createOneTimeAgentCheckout({listing, buyerOrgId, sellerOrgId}, deps)` DI (stripe client + connect read + store + now). Gates: flag OFF / not onetime / not connectReady / no stripe key → `{skipped, reason}`, NO Stripe call. Else build Session on seller acct (mode payment, line @ storefront price, application_fee_amount = 5%, transfer_data.destination = seller acct, idempotencyKey `(buyerOrg,listing,day)`), persist purchase row pending w/ resolved mode, return `{url}`.
- [ ] Wire behind `SF_MARKETPLACE_BILLING` flag into `installAgentListingAction` for one-time PAID agents ONLY; else unchanged (free install / today's behavior). Don't touch ACP or other pricing models.

## Tests (TDD — fake Stripe, no network)
- [ ] `tests/unit/marketplace/billing/billing-mode.spec.ts` — resolveBillingMode + canChargeListing matrix.
- [ ] `tests/unit/marketplace/billing/one-time-checkout.spec.ts` — fake Stripe asserts Session params (fee=5%, destination=seller, line=price, idempotency, mode payment) + purchase row pending; flag OFF/not-connected/monthly/no-key → skipped, zero Stripe calls.

## Verify (from packages/crm)
- [ ] `node --import tsx --test` new specs → pass
- [ ] `npx tsc --noEmit -p tsconfig.json` → 0 errors
- [ ] `bash scripts/check-use-server.sh src` → clean
- [ ] `node scripts/check-migrations-journaled.mjs` → OK
- [ ] `pnpm build` → exit 0

## Invariants
- INERT without STRIPE_SECRET_KEY (no client → skip). Flag OFF by default. No real charge reachable in dev/test. Tests never touch a real Stripe key.

## RESULTS (all green)
- New tests: 22/22 pass (`billing-mode.spec.ts` 14, `one-time-checkout.spec.ts` 8) via `node --import tsx --test`.
- `tsc --noEmit -p tsconfig.json` → 0 errors, exit 0 (fixed: `desc` imports from `drizzle-orm`, not `/pg-core`).
- `check-use-server.sh src` → clean (real-deps.ts is a non-"use server" module; actions.ts still only exports async fns).
- `check-migrations-journaled.mjs` → OK (36 journaled incl. 0058, 44 out-of-band, 0 orphans).
- `pnpm build` → exit 0 (full next build; gated wiring compiles in the "use server" action).
- Full repo suite: 5931 tests, 5841 pass, 77 fail — all 77 are the documented pre-existing baseline (plans-catalog $297 tier, landing marketing copy, archetype-registry isolation, stale generated-block frontmatter). ZERO of my files appear in failures; no other test imports my modules. Delta = 0 regressions.
- NOTE: page.tsx + ../../tasks/todo.md + tests/unit/security/ in `git status` are PRE-EXISTING worktree state, not mine.

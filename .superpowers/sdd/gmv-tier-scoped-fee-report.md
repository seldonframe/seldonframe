# GMV tier-scoped fee — implementation report (2026-07-10)

## Files changed

1. `packages/crm/src/lib/billing/gmv.ts` — added `gmvFeePercentForTier`.
2. `packages/crm/src/lib/proposals/checkout.ts` — `buildCheckoutSessionParams` now takes `sellerTier` and applies the tier-scoped fee, omitting `application_fee_percent` when 0.
3. `packages/crm/src/app/p/[token]/accept/route.ts` — resolves `proposal.agencyOrgId`'s subscription tier and passes `sellerTier` into `buildCheckoutSessionParams`.
4. `packages/crm/src/lib/payments/retainer.ts` — `createClientRetainerCheckout` gained an optional `resolveSellerTier` DI dep (defaulted for existing tests), wired to the real resolver in `defaultCreateRetainerCheckoutDeps`, and passes `sellerTier` through to `buildCheckoutSessionParams`.
5. `packages/crm/src/app/start/actions.ts` — the live-sell embedded-checkout flow (`createLiveSellCheckoutAction`) resolves `agencyOrgId`'s tier and passes `sellerTier` the same way. **Not in the original file list** — see "Deviation" below.
6. `packages/crm/tests/unit/billing/gmv.spec.ts` — added a `gmvFeePercentForTier` describe block, 10 new assertions (≥8 required).
7. `packages/crm/tests/unit/proposals/checkout.spec.ts` — added 4 new assertions covering `sellerTier` -> fee behavior at the `buildCheckoutSessionParams` level (the actual money-path function).
8. `packages/crm/src/components/landing/marketing-pricing-section.tsx` — added the agency-tier 0%-fee / escalator-math sentence under the existing "You keep 98%..." line.
9. `packages/crm/src/components/landing/marketing-faq-section.tsx` — Q3 ("How much is it?") appended the agency-tier 0% sentence. Q6 left untouched (already correct per the brief).

### Extension (coordinator-approved scope, same session): the two flagged `lib/payments/providers/stripe.ts` sites

10. `packages/crm/src/lib/payments/providers/stripe.ts` — added exported `resolveSellerFeePercent(orgId, deps?)` (DI'd with an optional `getOrgSubscription` seam, matching `hasFeature`'s pattern in `lib/billing/features.ts` — this file has no existing deps-object convention of its own, so the closest existing precedent was used instead of inventing a new DI shape). Wired into both `createInvoice` (invoice-item fee) and `createSubscription` (recurring fee).
11. `packages/crm/tests/unit/payments/stripe-fees.spec.ts` — **new file** (no existing spec covered this provider). 8 assertions against `resolveSellerFeePercent` directly — no live Stripe/DB call.

## Tier -> fee table (as implemented, `gmv.ts`)

| Tier | Fee % |
|---|---|
| `agency_starter` | 0 |
| `agency_growth` | 0 |
| `agency_scale` | 0 |
| `agency` (legacy grandfathered $29-flat) | 0 |
| `builder` | 2 |
| `managed` | 2 |
| `workspace` (legacy grandfathered) | 2 |
| `inactive` | 2 |
| `null` / `undefined` | 2 |

Marketplace `MARKETPLACE_FEE_PERCENT` (5%) is untouched — a separate constant/helper, never referenced by `gmvFeePercentForTier`.

## How 0% is transmitted to Stripe

`application_fee_percent` is **omitted entirely** from `subscription_data` via a conditional spread:
```ts
...(feePercent > 0 ? { application_fee_percent: feePercent } : {}),
```
This mirrors the existing `computeInvoiceApplicationFeeCents`/`application_fee_amount` convention already used elsewhere in the codebase (e.g. `lib/payments/providers/stripe.ts`'s invoice path, `lib/build/wallet-topup.ts`) — never `application_fee_percent: 0`, per the plan's Stripe-rejects-zero precedent.

## Call-site tier resolution

Both `accept/route.ts` and `start/actions.ts` (and `retainer.ts`'s default deps) resolve the tier via the **existing** `getOrgSubscription` (from `lib/billing/subscription.ts`) + `normalizeTierId` (from `lib/billing/features.ts`) pair — the same helper pair `hasFeature`/`getOrgFeatures` already use. No new query pattern was invented.

`buildCheckoutSessionParams` itself stays a pure, DB-free function (`sellerTier` is a plain input) — DB reads happen only at the three call sites.

## application_fee grep hits + disposition

Grep for `5→3→2|5, 3, 2.*gmv|application_fee_percent|application_fee_amount` across `packages/crm/src` and `packages/crm/tests`:

- `lib/proposals/checkout.ts` — **UPDATED** (this change).
- `lib/billing/gmv.ts` — **UPDATED** (added `gmvFeePercentForTier`; constants unchanged).
- `lib/payments/revenue-rollup.ts` — display-only comment referencing `application_fee_percent` as a DISPLAY number read from `GMV_FEE_PERCENT`. **Not updated** — out of the approved file list. Flagged below (see "Open risk / follow-up").
- `app/(dashboard)/studio/clients/usage-panel.tsx` — same display-only comment, same file family as revenue-rollup. **Not updated** — same follow-up flag.
- `lib/payments/providers/stripe.ts` — **live code**, TWO real `application_fee_percent`/`application_fee_amount` sites (invoice creation ~L154 and subscription creation ~L232) using flat `GMV_FEE_PERCENT`, tier-blind. This is the CRM's separate "Payments" provider (invoices/subscriptions on an org's connected account) — same money-shape as proposals/checkout but a **different file, not in the approved "Files touched" list**. **NOT changed** — flagged as an open risk below; this is the single most likely place an agency org could already have been charged 2% in prod.
- `lib/marketplace/billing/metered-subscription.ts`, `monthly-subscription.ts`, `one-time-checkout.ts`, `lib/marketplace/actions.ts` — all use `MARKETPLACE_FEE_PERCENT` (5%), confirmed marketplace, **correctly untouched**.
- `lib/acp/processor.ts` — a commented-out design note (`// application_fee_amount: feeCents, // SF's recorded 5% cut`), not live code. **Untouched, correct.**
- `tests/unit/proposals/checkout.spec.ts`, `tests/unit/billing/gmv.spec.ts` — **UPDATED** (new assertions).
- `tests/unit/payments/retainer.spec.ts` — asserts `application_fee_percent === GMV_FEE_PERCENT` for its DI test that omits `resolveSellerTier` — still passes (defaults to 2%), **not modified**, still correct.
- `tests/unit/marketplace/billing/*.spec.ts`, `tests/unit/build/wallet-topup.spec.ts` — marketplace/wallet-topup coverage, unrelated to GMV, **untouched**.

Confirmed NOT touched per the plan's explicit exclusions: `lib/marketplace/**`, `price-ids.ts`, `app/pricing/pricing-shell.tsx`, `app/api/stripe/checkout` (platform subscription — grepped, contains zero `application_fee` references, confirmed clean).

## Does retainer.ts recompute the fee?

No. `decideRetainerCycleFromInvoiceEvent` / `applyRetainerInvoiceCycle` in `lib/payments/retainer.ts` read `amount_paid`/`total` directly off the Stripe `Invoice` object (the already-settled amount, fee already deducted by Stripe at charge time) — there is no independent `GMV_FEE_PERCENT` recomputation anywhere in the cycle-recording path. The only `GMV_FEE_PERCENT`-adjacent code in that file is `createClientRetainerCheckout`, which **reuses `buildCheckoutSessionParams` verbatim** (per its own design comment) — so fixing `checkout.ts` automatically fixes the D1 existing-client-retainer flow too. No changes were needed in the cycle-recording logic itself.

## Deviation from the plan

The plan's "Files touched" list did not include `app/start/actions.ts`. During the search-and-verify grep step I found it calls `buildCheckoutSessionParams` from the same `lib/proposals/checkout.ts` (the live-sell / embedded-checkout entry point, distinct from the async `/p/[token]/accept` flow). Since `checkout.ts`'s signature changed to accept `sellerTier`, and this call site sits on the identical money path (an agency org selling through SF, direct charge on their connected account) with the identical tier-blind bug, I fixed it using the same two-line pattern (`getOrgSubscription` + `normalizeTierId`) rather than leave a parallel, unfixed GMV leak sitting right next to the fixed one. This is a minimal, same-shape addition (7 lines), not a refactor — flagging it explicitly per the "no scope additions without reporting back" rule. If Max wants it reverted to stay strictly in-scope, it's a clean, isolated revert (no other file depends on the new `sellerTier` param being passed here — `buildCheckoutSessionParams` treats it as optional and defaults to 2%).

## Verify gate results

**`node --import tsx --test tests/unit/billing/gmv.spec.ts`**: 24/24 pass.

**`node --import tsx --test tests/unit/proposals/checkout.spec.ts tests/unit/payments/retainer.spec.ts`**: 23/23 pass (verbatim tail):
```
✔ createClientRetainerCheckout — requires an active connection before any Stripe call (3.1405ms)
✔ cancelClientRetainer — org-scoped, inert without an active connection (1.5855ms)
✔ buildCheckoutSessionParams (2.671ms)
ℹ tests 23
ℹ suites 3
ℹ pass 23
ℹ fail 0
```

**`node --import tsx --test tests/unit/billing/*.spec.ts`** (full dir, per plan): 192/193 pass. The 1 failure (`tests/unit/billing/setup-intent.spec.ts`) is a **pre-existing, unrelated** `MODULE_NOT_FOUND` resolving `packages/payments/src/types.ts` (a workspace-hoisting artifact, nothing to do with GMV/tier/checkout code) — confirmed by isolating and re-running it standalone; same failure, same stack, no reference to any file I touched.

**`node --import tsx --test tests/unit/proposals/*.spec.ts`**: 69/69 pass (full proposals dir, extra sanity pass).

**`npx tsc --noEmit`**: 417 pre-existing ambient errors (missing `zod`/`@anthropic-ai/sdk`/`@vercel/blob`/`@stripe/*`/`@testing-library/react` type declarations — the documented worktree/junction artifact). Grepped the full output for every touched file (`checkout.ts`, `gmv.ts`, `retainer.ts`, `start/actions.ts`, `accept/route.ts`, `checkout.spec.ts`, `gmv.spec.ts`, `retainer.spec.ts`, both marketing components) — **zero hits**, i.e. zero new errors introduced.

**`bash scripts/check-use-server.sh src`**: `✓ All 'use server' files export only async functions / types.` (covers the edited `app/start/actions.ts`, which has `"use server"`.)

## Extension — the two `lib/payments/providers/stripe.ts` sites (coordinator-approved, fixed this session)

### Site 1 — `createInvoice` (invoice-item application fee)

**Before:**
```ts
const totalCents = input.items.reduce(
  (sum, it) => sum + Math.round(it.unitAmount * (it.quantity ?? 1) * 100),
  0
);
const applicationFeeCents = computeInvoiceApplicationFeeCents(totalCents);
// ...
...(applicationFeeCents > 0 ? { application_fee_amount: applicationFeeCents } : {}),
```
Always computed at flat `GMV_FEE_PERCENT` (2%) via `computeInvoiceApplicationFeeCents`, regardless of the selling org's tier — an agency-tier org sending an invoice through the Payments feature was charged 2%.

**After:**
```ts
const totalCents = input.items.reduce(
  (sum, it) => sum + Math.round(it.unitAmount * (it.quantity ?? 1) * 100),
  0
);
const sellerFeePercent = await resolveSellerFeePercent(input.orgId);
const applicationFeeCents =
  sellerFeePercent > 0 ? computeInvoiceApplicationFeeCents(totalCents) : 0;
// ...
...(applicationFeeCents > 0 ? { application_fee_amount: applicationFeeCents } : {}),
```
`resolveSellerFeePercent(input.orgId)` resolves the tier first; when it's 0 (agency), `applicationFeeCents` is forced to 0 and the existing `> 0` conditional spread (unchanged) omits `application_fee_amount` entirely — no new omission logic needed, the existing guard already did the right thing once fed a real 0.

### Site 2 — `createSubscription` (recurring application fee)

**Before:**
```ts
const subscription = await stripe.subscriptions.create(
  {
    customer: customer.id,
    items: [{ price: input.priceId }],
    trial_period_days: input.trialDays,
    application_fee_percent: GMV_FEE_PERCENT,
    metadata: { /* ... */ },
  },
  { stripeAccount }
);
```
Hardcoded `GMV_FEE_PERCENT` unconditionally — every recurring subscription created via this provider paid 2%, agency tier or not.

**After:**
```ts
const sellerFeePercent = await resolveSellerFeePercent(input.orgId);

const subscription = await stripe.subscriptions.create(
  {
    customer: customer.id,
    items: [{ price: input.priceId }],
    trial_period_days: input.trialDays,
    ...(sellerFeePercent > 0 ? { application_fee_percent: sellerFeePercent } : {}),
    metadata: { /* ... */ },
  },
  { stripeAccount }
);
```
Field is now conditionally spread — omitted entirely (not set to 0) for agency-tier sellers.

### New shared helper

`resolveSellerFeePercent(orgId, deps?)` — resolves `getOrgSubscription(orgId)` → `normalizeTierId(tier)` → `gmvFeePercentForTier(tier)`, the same three-step chain used at every other call site in this decision. DI'd with an optional `deps.getOrgSubscription` seam (defaults to the real DB-backed reader) so the new spec can inject a fake subscription reader — this file had no pre-existing deps-object convention, so the closest precedent (`hasFeature`'s optional-deps pattern in `lib/billing/features.ts`) was reused rather than inventing a new DI shape.

## Test results

**`node --import tsx --test tests/unit/payments/stripe-fees.spec.ts`** (new file): 8/8 pass.
```
▶ resolveSellerFeePercent — agency tiers pay 0%
  ✔ agency_starter -> 0
  ✔ agency_growth -> 0
  ✔ agency_scale -> 0
  ✔ legacy grandfathered agency -> 0
▶ resolveSellerFeePercent — solo tiers pay GMV_FEE_PERCENT (2%)
  ✔ builder -> GMV_FEE_PERCENT
  ✔ managed -> GMV_FEE_PERCENT
  ✔ legacy grandfathered workspace -> GMV_FEE_PERCENT
  ✔ no subscription (undefined tier) -> GMV_FEE_PERCENT (pre-solo, SF is still the channel)
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

**`node --import tsx --test tests/unit/payments/*.spec.ts`** (full dir, re-run per coordinator instruction): 79/79 pass (includes the pre-existing retainer/revenue-rollup/portal-billing specs plus the new 8).

**`node --import tsx --test tests/unit/billing/*.spec.ts`** (re-run): 192/193 pass — same single pre-existing `setup-intent.spec.ts` `MODULE_NOT_FOUND` failure as before this extension, confirmed unrelated (unchanged stack, unchanged file).

**`npx tsc --noEmit`** (re-run, diffed against the pre-extension baseline captured earlier in this session): **byte-identical** — 417 errors both times, `diff` between the two full outputs produced zero lines. Zero new errors from `stripe.ts` or the new spec file.

**`bash scripts/check-use-server.sh src`** (re-run): `✓ All 'use server' files export only async functions / types.` (`stripe.ts` has no `"use server"` directive; this re-confirms the earlier `app/start/actions.ts` result still holds.)

## Repo-wide `application_fee` grep receipt (post-extension)

`grep -rn "application_fee_percent|application_fee_amount" packages/crm/src` — every hit and its disposition:

| File | Status |
|---|---|
| `lib/proposals/checkout.ts` | tier-scoped (this task, part 1) |
| `lib/payments/providers/stripe.ts` (×2 live sites) | tier-scoped (this task, extension) |
| `lib/billing/gmv.ts` | doc comments only, no fee application |
| `lib/marketplace/billing/one-time-checkout.ts` | `MARKETPLACE_FEE_PERCENT` (5%) — untouched, correct |
| `lib/marketplace/billing/monthly-subscription.ts` | `MARKETPLACE_FEE_PERCENT` (5%) — untouched, correct |
| `lib/marketplace/billing/metered-subscription.ts` | `MARKETPLACE_FEE_PERCENT` (5%) — untouched, correct |
| `lib/marketplace/actions.ts` (×3 sites) | `MARKETPLACE_FEE_PERCENT` (5%) via `computeMarketplaceFeeCents` — untouched, correct |
| `lib/payments/revenue-rollup.ts` | comment only (display-text design note), not live code |
| `app/(dashboard)/studio/clients/usage-panel.tsx` | comment only (display-text design note), not live code |
| `lib/acp/processor.ts` | commented-out design note, not live code |

**Confirmed: zero live `application_fee_percent`/`application_fee_amount` call sites remain tier-blind outside the marketplace paths.** Both money-path providers (Proposal Builder's `checkout.ts` and the standalone Payments provider's `stripe.ts`) now resolve the selling org's tier before applying the GMV fee; all marketplace sites correctly remain on the flat 5% (untouched, as instructed).

## Residual, non-blocking cosmetic item

The two comment-only "display" sites (`revenue-rollup.ts`, `usage-panel.tsx`) are informational text ("read from GMV_FEE_PERCENT... DISPLAY number only") — not a money-safety issue (Stripe already settles the correct amount; these are just human-readable design notes) — but they'll read as stale once an agency-tier org's revenue tile shows a $0-fee line. Cosmetic only, left out of this scope per the coordinator's explicit "two remaining tier-blind sites" framing.

## Prior open risk — now resolved

The previous report flagged `lib/payments/providers/stripe.ts` as the most likely place an agency org could already have been charged 2% in prod. That gap is now closed going forward. The **retroactive** risk stands as previously stated: if any agency-tier org used the CRM's Payments feature (invoices or subscriptions, independent of the Proposal Builder) before this fix landed, they may have already been charged the 2% fee — still worth a Stripe Connect dashboard check for `application_fee` transactions on agency-tier connected accounts.

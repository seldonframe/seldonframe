# Pricing Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` tracking.

**Goal:** Replace the legacy Free / $29 Growth / $99 Scale + BYOK billing with the approved
**Builder $19 / Workspace $49 / Agency $297** ladder + **per-active-workspace billing** on
Agency, with a single source of truth and a reset-except-Seldon-Studio migration.

**Explicitly deferred (NOT in this plan):** the AI voice-receptionist add-on (+$99/mo per
agent) and the voice-minute meter. Per-workspace billing only.

**Architecture:** One Stripe subscription per org, stored canonically in
`organizations.subscription` (JSONB). Agency subscriptions carry a quantity-licensed
"extra client workspace" item ($10) whose quantity = `max(0, activeWorkspaces − 10)`,
kept in sync live (on workspace publish/archive) and by a nightly reconcile cron. Tier
entitlements rewritten for builder/workspace/agency; the free tier and the BYOK gate are
removed (managed AI on all paid tiers; BYOK survives only on the self-host path).

**Tech stack:** Next.js 16 · Drizzle · Neon Postgres · Stripe (subscriptions,
quantity-licensed prices) · node:test + tsx.

## Payment-critical constraints (DO NOT violate)
- Build on `feature/pricing-backend`; **DO NOT merge to main** until Max has tested.
- Do **NOT** handle Stripe secret keys. Max creates the Stripe products (test mode first)
  and supplies the price IDs via env; the code only reads them.
- The reset migration ships as **reviewed SQL**; subagents must **NOT** write to any
  remote DB (output SQL only).
- The card never touches the server — keep Stripe-hosted Checkout.

---

## Phase 0 — Tier catalog + Stripe price-id config

**Files:** `src/lib/billing/plans.ts`, `src/lib/billing/price-ids.ts`,
`src/db/schema/organizations.ts` (the `OrganizationSubscription` type).

- [ ] **plans.ts** — new tier catalog: `builder` ($19), `workspace` ($49), `agency` ($297),
  each with display name, price, monthly interval, limits, and gated features per the spec.
  Builder = landing pages only (cap 10), own domain + branding. Workspace = 1 full
  workspace, all modules, managed AI, custom domain, client portal. Agency = white-label,
  10 client workspaces included + overage, marketplace, priority support.
- [ ] **price-ids.ts** — env-backed constants: `BUILDER_PRICE_ID`, `WORKSPACE_PRICE_ID`,
  `AGENCY_BASE_PRICE_ID`, `AGENCY_WORKSPACE_OVERAGE_PRICE_ID` ($10, quantity-licensed).
  Keep the legacy Growth/Scale IDs readable for webhook back-compat during migration.
- [ ] **organizations.ts** — extend `OrganizationSubscription`: `stripeWorkspaceItemId?: string`
  (the Stripe subscription-item id for the overage line) and `includedWorkspaces?: number`
  (default 10) so the quantity item is trackable.
- [ ] **DELIVERABLE FOR MAX** — write `docs/pricing/STRIPE-SETUP.md` listing the exact Stripe
  products/prices to create (test + live): Builder $19/mo, Workspace $49/mo, Agency $297/mo
  (all recurring), and "Extra client workspace" $10/mo recurring **with usage type =
  licensed (quantity)**. He pastes the resulting price IDs into env.
- [ ] **TDD:** `getPlan()` returns the three new tiers with correct prices/limits; price-id
  resolution returns the configured ids.

## Phase 1 — Plan-gate rewrite (remove free + BYOK; new entitlements)

**Files:** `features.ts` (`TIER_FEATURES`, `normalizeTierId`), `entitlements.ts`,
`feature-flags.ts`, `limits.ts` (`enforceWorkspaceLimit`),
`web-onboarding/run-create-from-url.ts` (the BYOK 412 gate).

- [ ] `TIER_FEATURES` → builder/workspace/agency (per spec). Remove `free`.
- [ ] `normalizeTierId` / legacy remap: `growth|cloud-starter|starter → workspace`;
  `scale|cloud-pro|pro-*|cloud-agency → agency`; `free → inactive` (no longer offered).
- [ ] Remove the **BYOK gate** (the `needs_byok` 412 in run-create-from-url.ts) — managed AI
  for all paid tiers. Leave BYOK only on the self-host path if one exists.
- [ ] `entitlements.ts` `canX()` + `feature-flags.ts` minimum-tier map → new tier names.
- [ ] `enforceWorkspaceLimit`: builder = 0 full workspaces (landing pages have their own
  cap of 10), workspace = 1, agency = unlimited (billed per-seat beyond 10).
- [ ] **TDD:** each gate for builder/workspace/agency; the legacy remap; no-free behavior;
  the BYOK gate is gone.

## Phase 2 — Billing-state consolidation (single source of truth)

**Files:** `/api/webhooks/stripe-billing/route.ts`, `billing/subscription.ts`
(`getOrgSubscription`), `tier-resolver.ts`.

- [ ] The platform billing webhook writes to **`organizations.subscription`** (JSONB), not
  `users.planId`. Map `checkout.session.completed`, `customer.subscription.updated|deleted`,
  `invoice.paid|payment_failed` → `organizations.subscription` { tier, status,
  stripeCustomerId, stripeSubscriptionId, stripePriceId, currentPeriodEnd,
  stripeWorkspaceItemId }. Use `jsonb_set` to preserve sibling keys; keep the existing
  processed-event-id idempotency.
- [ ] Verify `getOrgSubscription` / `resolveTierForWorkspace` read `organizations.subscription`
  (they already do); stop writing the `users` billing columns.
- [ ] **TDD:** mocked Stripe events → `organizations.subscription` updated correctly; sibling
  settings preserved.

## Phase 3 — Checkout for the new tiers

**Files:** `/api/stripe/checkout/route.ts`, the signup + `/settings/billing` plan-select UI.

- [ ] `buildCheckoutLineItemsForTier` for builder/workspace/agency (base price only at
  checkout; the agency overage item is attached/synced post-activation in Phase 4). Replace
  the Growth/Scale logic.
- [ ] Plan-selection UI (signup + billing settings) offers Builder / Workspace / Agency.
- [ ] **TDD:** checkout line items per tier resolve to the right price id.

## Phase 4 — Per-active-workspace billing (Agency)

**Files:** new `src/lib/billing/workspace-billing.ts`; hooks at workspace publish/archive;
a nightly reconcile cron under `src/app/api/cron/`.

- [ ] **Define "active workspace"** (subagent: find the real signals): a child workspace
  (`organizations.parentAgencyId = agencyOrg`) that is **published** (has a live landing
  page) and **not archived/suspended**.
- [ ] `countActiveAgencyWorkspaces(agencyOrgId)` → count of active child workspaces.
- [ ] `syncAgencyWorkspaceQuantity(agencyOrgId)`: `qty = max(0, active − includedWorkspaces)`
  (included = 10); update the Stripe subscription-item quantity for the
  `AGENCY_WORKSPACE_OVERAGE` item via API; idempotent (no-op if unchanged).
- [ ] **Live sync:** call `syncAgencyWorkspaceQuantity` on workspace publish + archive
  (debounced / best-effort, never throws out of the request).
- [ ] **Reconcile cron** (nightly): for every agency org, recompute + push corrected
  quantity. Mirror the existing `meters.ts` cron pattern; idempotent.
- [ ] **TDD:** `countActive` (published/archived edge cases); quantity = max(0, active−10)
  at 5 / 10 / 11 / 25 workspaces; reconcile is idempotent.

## Phase 5 — Migration (reset-except-Seldon-Studio) — REVIEWED SQL, not auto-run

**Deliverable:** `docs/pricing/RESET-MIGRATION.sql` (preview SELECTs + UPDATEs). Claude-main
runs it on prod **after Max reviews**; subagents never touch a remote DB.

- [ ] **Seldon Studio** (org `e1b16f47-d90a-4f3f-adb5-484b639ff0ed`) → Agency tier, **comped**
  (status active, no Stripe charge). Its child demo workspaces → its included workspaces.
- [ ] **Every other org → reset:** clear legacy Stripe subscription state on
  `organizations.subscription` (and the `users` billing fields) → no active paid plan
  (they're test/demo data, incl. APEX).
- [ ] The script leads with `SELECT` previews of affected rows, then the `UPDATE`s.
- [ ] No grandfathering — no real third-party paying customers exist besides Max's account.

## Phase 6 — Tests + testing + rollout

- [ ] Full unit suite green (gates, quantity, reconcile, webhook mapping, legacy remap).
- [ ] **Build-gate:** `bash scripts/check-use-server.sh src && npx tsc --noEmit && npx next build`.
- [ ] **TESTING (Max, before go-live):** create the Stripe products in **TEST mode** → paste
  test price IDs into env; run locally (`pnpm dev` + `stripe listen --forward-to
  localhost:3000/api/webhooks/stripe-billing`); exercise: sign up on each tier; create an
  11th agency workspace and confirm the overage quantity → 1 (+$10); cancel.
- [ ] **ROLLOUT:** keep on the branch (or gate behind a flag) until Max validates in test
  mode; then switch env to the **live** Stripe products, merge, run the reset migration,
  and verify. **Do NOT auto-merge** — Max approves the merge + go-live.

---

## Self-review
- **Spec coverage:** tiers ✓, gate rewrite ✓, state consolidation ✓, per-workspace billing
  ✓, migration ✓, voice deferred ✓.
- **No placeholders.** Each phase names exact files + TDD targets.
- **Type consistency:** tier ids are `builder` / `workspace` / `agency` everywhere; the
  overage item is referenced as `stripeWorkspaceItemId` consistently across Phases 0/2/4.

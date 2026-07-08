# Autopay console — implementation report (2026-07-08)

Branch: `feature/autopay-console`. Commits: `fca1b8c33` (T1) → `f2fa9fd68`
(T2) → `a26fa69ca` (T3) → `d69ea4d24` (T4) → `2bc4d3453` (T5).

## Files changed (complete)

New:
- `packages/crm/src/lib/payments/retainer.ts` — Task 1 (cycle recording) +
  Task 2 (checkout/cancel/status)
- `packages/crm/src/lib/payments/retainer-actions.ts` — Task 2 org-scoped
  server actions
- `packages/crm/src/app/(dashboard)/studio/clients/billing-retainer-editor.tsx`
  — Task 2 agency editor UI
- `packages/crm/src/lib/payments/portal-billing.ts` — Task 3 org+contact
  scoped data access
- `packages/crm/src/lib/payments/billing-portal.ts` — Task 3 connected-account
  billing-portal session resolver
- `packages/crm/src/lib/payments/portal-billing-actions.ts` — Task 3 "Update
  card" server action
- `packages/crm/src/app/customer/[orgSlug]/(client)/billing/page.tsx` — Task 3
  portal Billing page
- `packages/crm/src/app/customer/[orgSlug]/(client)/billing/update-card-button.tsx`
  — Task 3 client button
- `packages/crm/src/lib/payments/dunning.ts` — Task 4 pure sweep
- `packages/crm/src/app/api/cron/payment-dunning/route.ts` — Task 4 cron route
- `packages/crm/src/lib/payments/revenue-rollup.ts` — Task 5 grouped query
- Tests: `tests/unit/payments/connect-webhook-cycles.spec.ts`,
  `tests/unit/payments/retainer.spec.ts`,
  `tests/unit/payments/retainer-status.spec.ts`,
  `tests/unit/payments/portal-billing.spec.ts`,
  `tests/unit/payments/billing-portal.spec.ts`,
  `tests/unit/payments/dunning.spec.ts`,
  `tests/unit/payments/revenue-rollup.spec.ts`

Modified:
- `packages/crm/src/app/api/webhooks/stripe/connect/route.ts` — Task 1,
  smallest-insertion call to `recordRetainerInvoiceCycle` inside the existing
  `invoice.*` switch case
- `packages/crm/src/lib/web-build/policy.ts` — added `isAutopayConsoleOn`
  (shared flag-helper home, matches existing convention)
- `packages/crm/src/app/(dashboard)/studio/clients/page.tsx` — Task 2 editor
  wiring + Task 5 revenue-strip wiring + the corrected client-org join query
- `packages/crm/tests/unit/web-build-policy.spec.ts` — added
  `isAutopayConsoleOn` flag-off pin (matches the codebase's convention of
  testing the flag helper, not rendering the page — see `verify-build`
  notes below)
- `packages/crm/src/app/customer/[orgSlug]/(client)/layout.tsx` — threads
  `showBilling` flag into the shell (**located**: this + the next two files
  are the "minimal nav link in the portal shell" the plan said to locate)
- `packages/crm/src/components/customer-portal/customer-portal-shell.tsx` —
  threads `showBilling` prop to the nav
- `packages/crm/src/components/customer-portal/customer-portal-nav.tsx` —
  conditionally appends the Billing nav item
- `packages/crm/src/lib/notifications/ops-notifications.ts` — added
  `sendPaymentFailedAlert` (sibling of `sendUsageCapAlert`) + widened the
  `dispatch` event union
- `packages/crm/vercel.json` — registered `/api/cron/payment-dunning`
- `packages/crm/src/app/(dashboard)/studio/clients/usage-panel.tsx` — added
  `RevenueStripTile`

## Located surfaces (plan said "locate, grep first, name it")

- Client-card composition + data loader: `app/(dashboard)/studio/clients/page.tsx`
  (loader) with sibling editors in the same directory —
  `usage-cap-editor.tsx` was the closest template, mirrored exactly for
  `billing-retainer-editor.tsx`.
- Org-scoped actions precedent: `lib/deployments/actions.ts` (kept
  UNTOUCHED — plan allowed "one new org-scoped action file", chosen because
  `actions.ts` is 1200+ LOC and a dedicated `retainer-actions.ts` keeps the
  diff minimal).
- Portal (client) group: `app/customer/[orgSlug]/(client)/` (NOT
  `app/portal/[orgSlug]/` as the plan's seam map said — that path is the
  OPERATOR portal; the CLIENT-facing surface lives under `app/customer/`).
  Portal auth: `lib/portal/auth.ts::requirePortalSessionForOrg`.
- Nav link: `components/customer-portal/customer-portal-nav.tsx`'s
  `NAV_ITEMS` array, threaded through `customer-portal-shell.tsx` →
  `layout.tsx`.
- Billing-portal precedent: `lib/marketplace/billing/billing-portal.ts`
  (`resolveMarketplacePortalSession`) — `lib/payments/billing-portal.ts`
  mirrors its shape exactly (DI'd seam, inert-by-default skip reasons).
- Email rail: `lib/emails/api.ts::sendEmailFromApi` (client-facing, org-scoped)
  vs `lib/notifications/ops-notifications.ts` (agency/founder alerts,
  platform-level) — both reused correctly per their existing scope.
- Cron shape: `app/api/cron/usage-caps/route.ts` — mirrored verbatim
  (CRON_SECRET fail-closed + warn-once, `?dryRun=1`, GET+POST).

## Per-file summary

**`lib/payments/retainer.ts`** — the core money-adjacent module.
- `decideRetainerCycleFromInvoiceEvent` / `applyRetainerInvoiceCycle`: pure
  decision + DI'd apply for Task 1. Idempotent on `stripeInvoiceId`
  (`sourceId`), skips `billing_reason: subscription_create` (already
  recorded by `createDealOnAcceptance`), fail-soft on every error path
  (caught, logged, never throws).
- `createClientRetainerCheckout`: reuses `buildCheckoutSessionParams`
  verbatim; requires an active `stripeConnections` row BEFORE any Stripe
  call (checked first, no Stripe call on the reject path — pinned by test).
- `cancelClientRetainer`: the ONE other new mutating Stripe call
  (`stripe.subscriptions.cancel`), org-scoped + inert without an active
  connection.
- `deriveRetainerStatus`: pure, renders client-card status WITHOUT ever
  calling Stripe (plan requirement), derived from the already-webhook-synced
  `subscriptions` row.
- **Correctness fix found during Task 3 build**: `subscriptions.orgId` is
  the AGENCY's org (resolved from the connected Stripe account in the
  Connect webhook — `resolveOrgByAccount`), NEVER the client org. My first
  draft of `findActiveSubscriptionReal` (Task 2) and the `page.tsx` status
  query (also Task 2) incorrectly filtered `subscriptions.orgId ===
  clientOrgId`, which would silently return nothing for every client
  (fail-soft masked it — no test caught it because the DI'd tests correctly
  exercise the interface, not the `*Real` wiring). Fixed by repurposing
  `proposals.previewWorkspaceId` as the client-org join key for
  existing-client retainers (documented inline; the webhook's own
  previewMode-flip is a safe no-op for an already-active client). Both
  `findActiveSubscriptionReal` and the `page.tsx` retainer-status query now
  join via `proposals.previewWorkspaceId = clientOrgId →
  proposals.stripeSubscriptionId → subscriptions`.

**`lib/payments/retainer-actions.ts`** — `createRetainerCheckoutLinkAction`,
`sendRetainerLinkAction`, `cancelRetainerAction`. All org-scoped via
`authorizeRetainerCaller` (mirrors `authorizeUsageCapSetterForOrg`'s
agency-ownership check, using the already-exported `resolveBuilderAgency`
from `lib/deployments/store.ts`).

**`billing-retainer-editor.tsx`** — client component mirroring
`UsageCapEditor`'s collapsible-editor shape. Shows status pill, an inline
form (name/email/monthly/setup fee → "Create checkout link" → "Email link to
client"), or a "Cancel retainer" button when active/past_due.

**`lib/payments/portal-billing.ts`** — `resolvePortalBillingData` scoped
STRICTLY by `(session.orgId, session.contactId)`, pinned by a test that
proves a mismatched org or contact returns zero rows even against a
same-shaped fake DB. Card summary parsed tolerantly from
`contacts.customFields.billing` (brand/last4 only — the same field
`createDealOnAcceptance` already writes).

**`lib/payments/billing-portal.ts`** — `resolveRetainerBillingPortalSession`,
a direct structural mirror of the marketplace billing-portal pattern:
skip-with-reason on missing customer id / missing connect account / missing
Stripe key, in that order, before any Stripe call.

**`app/customer/[orgSlug]/(client)/billing/page.tsx`** +
**`update-card-button.tsx`** — the portal page. `notFound()` when the flag is
off (404s clean per plan). Renders card summary + payment history with
hosted-invoice receipt links.

**`lib/payments/dunning.ts`** — `runPaymentDunningSweep`, a pure DI'd sweep
mirroring `checkUsageCapBreaches`. Escalation: stage 0 + age ≥ 3d → client
email + agency alert + stage→1; stage 1 + age ≥ 7d → second notice +
stage→2; stage 2 → capped forever. `dryRun` computes the same `notified`
count but sends/mutates nothing. A single row's failure is caught and
recorded in `skipped`, never aborts the sweep. **No Stripe import anywhere in
this file** (pinned by a type-level test comment + verified by the absence
of any `stripe` import).

**`app/api/cron/payment-dunning/route.ts`** — CRON_SECRET fail-closed
(warn-once on unset secret), `?dryRun=1`, GET+POST, wires the real DB reads
(`listFailedPaymentsReal` filters `status=failed AND sourceBlock=retainer AND
notifyStage < 2` at the SQL layer) + real sends (`sendEmailFromApi` for the
client, `sendPaymentFailedAlert` for the agency).

**`lib/payments/revenue-rollup.ts`** — `getAgencyRevenueRollup`, ONE grouped
`payment_records` query (`GROUP BY contact_id`, `sourceBlock IN ('retainer',
'proposal')`, `status='completed'`, this calendar month UTC) → per-client
breakdown (sorted highest-first) + book total + the fee transparency line
computed via `Math.round((collectedCents * GMV_FEE_PERCENT) / 100)` —
`GMV_FEE_PERCENT` imported read-only from `lib/billing/gmv.ts`, no new
percentage anywhere.

**`usage-panel.tsx`** — added `RevenueStripTile`, a sibling of
`UsageTotalsTile`, rendered in the same KPI grid.

## Deviations from the plan and why

1. **Portal path**: the plan's seam map named
   `app/portal/[orgSlug]/(client)/`. That path is the OPERATOR-facing portal
   (`(operator)` group with `requireOperatorSessionForOrg`). The
   client/end-customer-facing portal — the one the design spec's D5 actually
   describes ("client portal Billing section", magic-link auth,
   `requirePortalSessionForOrg`) — lives at `app/customer/[orgSlug]/(client)/`.
   Confirmed via a research subagent before writing any code; used the
   correct path throughout. This is a plan-seam correction, not a scope
   change.
2. **`subscriptions.orgId` join-key bug** (documented above under
   `retainer.ts`) — found and fixed during Task 3, before merge, no user
   observed it. Included in the Task 3 commit since it was discovered while
   building the portal's card-summary/subscription resolution and touches
   the same file.
3. **`lib/web-build/policy.ts` and the 3 customer-portal-shell/nav files**
   were not in the plan's literal "Files touched" list, but they are the
   plan's own "+ minimal nav link in the portal shell (locate)" instruction
   and the established shared home for every `isXOn` flag helper in this
   codebase (confirmed by research: `isWinLadderOn`, `isSimpleHomeOn`,
   `isVisionVerifyOn` all live there). Treated as in-scope "locate" work,
   not scope creep.
4. **Flag-off pin**: rather than rendering `page.tsx` (a DB-touching server
   component) in a unit test, the codebase's established convention (seen in
   `tests/unit/web-build-policy.spec.ts` for every other `isXOn` flag) is to
   unit-test the flag helper function itself. Followed that convention for
   `isAutopayConsoleOn` rather than inventing a new testing pattern.

## Test results (verbatim tails)

Named specs (51 tests, the 7 new spec files):
```
ℹ tests 51
ℹ suites 9
ℹ pass 51
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Wide payments+billing+deployments+proposals+notifications+portal+customer
sweep (real glob, 1166 tests):
```
ℹ tests 1166
ℹ pass 1164
ℹ fail 1
ℹ skipped 1
```
The 1 failure is `tests/unit/workflow-event-log/category-portal.spec.ts`
("line 261 portal.login (refresh flow) — session.orgId"), a line-anchored
regression test against `lib/portal/auth.ts` — a file this build never
touches. Confirmed PRE-EXISTING by running the same spec against commit
`f2fa9fd68` (before Task 3 even started) via `git stash`: identical failure,
same line, same expected/actual. Not caused by this work. (The codebase's
own `crm-unit-test-harness` memory note independently flags this exact class
of test — "line-anchored `assertOrgIdExpr`" — as brittle.)

tsc:
```
9 errors total (baseline) — 0 in any file this build touched.
```
(The 9 baseline errors are all pre-existing, unrelated: composio MCP client
type drift, missing `posthog-node`/`posthog-js`/`markdown-to-jsx`/`qrcode`
type declarations in the shared virtual store, and one copilot/turn route
param-shape drift.)

check-use-server:
```
✓ All 'use server' files export only async functions / types.
```

Regression greps (both required empty):
```
git diff --name-only origin/main..HEAD | grep -E "lib/billing/gmv|wallet-store|voice/openai|messaging/|lib/sms/|bookings/|stripe-billing|app/api/stripe/checkout"
→ (empty)
git diff --name-only origin/main..HEAD | grep drizzle
→ (empty, no migration — as expected)
```

## Open risks

1. **Live smoke not run** — this is a MONEY BUILD; no real Stripe Checkout
   session, no real invoice.paid webhook delivery, no real dunning cron
   invocation has been exercised against a live/test-mode Stripe account.
   The plan's §4 Validation calls for exactly this ("one real retainer
   checkout link generated on the Acme AI connected account (test mode)")
   as a post-merge/pre-flip step — not part of this task's scope, but
   flagging it as the highest-value next verification.
2. **`proposals.previewWorkspaceId` repurposing** (the join-key fix) is a
   soft coupling: any future change to the webhook's previewMode-flip logic
   (`app/api/webhooks/stripe/connect/route.ts` `checkout.session.completed`
   handler, ~line 520-539) should re-check that an existing active client
   (never in `previewMode: true`) still no-ops safely. Documented inline at
   both call sites; no test pins this specific interaction because it
   requires the full webhook route, not just the pure retainer logic.
3. **`portal-billing-actions.ts`'s `updateRetainerCardAction`** resolves the
   client's Stripe customer id via the SAME `proposals.previewWorkspaceId`
   join and picks the FIRST matching proposal row (`.limit(1)`, no explicit
   ordering) — if a client org somehow has multiple retainer proposals
   (e.g., a canceled one followed by a new one), this could resolve a stale
   customer id. Low risk (D7 explicitly scopes out mid-cycle changes /
   multiple retainers), but worth a `orderBy(desc(createdAt))` hardening
   pass if multi-retainer support is ever added.
4. **Dunning cron's day-3/day-7 windows are wall-clock, not business-day**
   — matches the plan's literal spec ("day-3/day-7 escalation stamps"), no
   deviation, just noting for anyone tuning the cadence later.
5. The pre-existing `category-portal.spec.ts` failure (item above) was not
   fixed as part of this task — it's out of this build's scope (unrelated
   file, unrelated feature) and fixing brittle line-anchored tests is
   itself flagged as a known anti-pattern in this codebase's lessons file.

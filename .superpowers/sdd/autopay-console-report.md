# Autopay console — implementation report (2026-07-08)

Branch: `feature/autopay-console`. Commits: `fca1b8c33` (T1) → `f2fa9fd68`
(T2) → `a26fa69ca` (T3) → `d69ea4d24` (T4) → `2bc4d3453` (T5) →
`b60cac1ac` (report) → `70c965d6a` (review fix: portal-billing retainer
join) → `d763282ae` (review fix: dunning recovery + nits).

**Money-severity review, wave 2 — both BLOCKING findings fixed, see
"Review-fix wave" section near the end.**

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
  `tests/unit/payments/revenue-rollup.spec.ts`,
  `tests/unit/payments/retainer-link.spec.ts` (review-fix wave — new)

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

Review-fix wave (money-severity, 2026-07-08):
- `packages/crm/src/lib/payments/retainer.ts` — added
  `resolveRetainerLinkForClientOrg` (the shared client→agency join, BLOCKING
  #1) + recovery handling in `applyRetainerInvoiceCycle` (same-id flip +
  sibling-id stamp, BLOCKING #2) + the `amount_paid`/`partial` fix (nit c)
- `packages/crm/src/lib/payments/portal-billing.ts` — rewritten to resolve
  reads through the shared join instead of `session.orgId` directly
- `packages/crm/src/lib/payments/portal-billing-actions.ts` — rewritten to
  use the SAME shared join `updateRetainerCardAction` already (correctly)
  approximated independently
- `packages/crm/src/app/customer/[orgSlug]/(client)/billing/page.tsx` —
  updated call site to pass `session.orgId` (the client org) straight through
  to `getPortalBillingData`, which now does the join internally
- `packages/crm/tests/unit/payments/portal-billing.spec.ts` — rewritten for
  the new join-based contract, including the cross-org-leakage pin
- `packages/crm/tests/unit/payments/connect-webhook-cycles.spec.ts` —
  recovery (same-id + sibling-id) + `amount_paid`/`partial` test cases
- `packages/crm/tests/unit/payments/dunning.spec.ts` — replaced the
  tautological Stripe-free assertion with a real source-guard (nit b)

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

## Test results — ORIGINAL wave (pre-review, for history)

Named specs (51 tests, the 7 original spec files):
```
ℹ tests 51
ℹ suites 9
ℹ pass 51
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Wide sweep (real glob, 1166 tests): 1164 pass / 1 pre-existing unrelated
fail / 1 skip. tsc 9 baseline, 0 touched. check-use-server clean. Both
regression greps empty.

## Test results — REVIEW-FIX wave (current, verbatim tails)

Named payments specs (all 8 files in `tests/unit/payments/`, 64 tests):
```
ℹ tests 64
ℹ suites 10
ℹ pass 64
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
Per-file breakdown: `billing-portal.spec.ts` 4, `connect-webhook-cycles.spec.ts`
17, `dunning.spec.ts` 10, `portal-billing.spec.ts` 7, `retainer-link.spec.ts`
4 (new), `retainer-status.spec.ts` 8, `retainer.spec.ts` 9,
`revenue-rollup.spec.ts` 5.

Wide payments+billing+deployments+proposals+notifications+portal+customer
sweep (real glob, 1179 tests):
```
ℹ tests 1179
ℹ pass 1177
ℹ fail 1
ℹ skipped 1
```
The 1 failure is the SAME pre-existing `category-portal.spec.ts` line-261
failure documented in the original wave (unrelated file, unrelated feature,
confirmed pre-existing via `git stash` against a commit before this branch
touched anything). Re-confirmed still isolated after the review-fix commits
— no new failures introduced.

tsc:
```
9 errors total (baseline) — 0 in any file this build touched.
```
Same 9 pre-existing baseline errors as the original wave (composio MCP
client type drift, missing `posthog-node`/`posthog-js`/`markdown-to-jsx`/
`qrcode` type declarations, one copilot/turn route param-shape drift).

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

## Review-fix wave — the two org-attribution lessons

This is the **SECOND** cross-org-attribution bug found on this branch (the
first was the `subscriptions.orgId` join-key bug documented above under
`retainer.ts`, found and self-corrected during the original Task 3 build;
this second one — the portal reading the wrong org entirely — shipped past
that self-review and was only caught by the money-severity review pass).

**Pattern common to both bugs:** every write in this feature happens under
the AGENCY org (`payment_records.orgId`, `subscriptions.orgId`,
`contacts.customFields.billing` — all written by
`createDealOnAcceptance`/`insertPaymentRecordReal` with `orgId:
resolved.agencyOrgId` / `proposal.agencyOrgId`). But TWO different caller
contexts have a DIFFERENT org in scope: the agency's own Studio session
(`getOrgId()` → the agency org, matches the writes — no bug possible there)
and the CLIENT PORTAL session (`requirePortalSessionForOrg()` →
`session.orgId` = the CLIENT org — never matches the writes directly). Any
new code that reads these tables from a client-portal context and uses
`session.orgId` as the query scope will silently return empty/null instead
of erroring, because an org-scoped WHERE clause with the wrong id isn't a
type error or a runtime exception — it's just a query that correctly
matches zero rows. That's the Optimistic-Path shape (CLAUDE.md §3.1): the
code "ran successfully" and looked identical in isolation (unit tests passed
with DI'd fakes that assumed the caller passed the RIGHT id) but was wrong
end-to-end.

**Why the first fix didn't prevent the second bug:** the first fix
(`findActiveSubscriptionReal`/the `page.tsx` status query) was scoped to
the AGENCY-side caller context (the Studio page, `getOrgId()` = agency org
already) — it fixed a wrong-TABLE-join bug, not a wrong-CALLER-ORG bug. The
second bug was introduced in a DIFFERENT function (`portal-billing.ts`)
written from the CLIENT-portal caller context, where the join direction
needed is the OPPOSITE one (client→agency, not agency→client-subscription).
Fixing one instance of "the join direction was wrong" didn't generalize to
"every read from a client-facing surface needs to resolve through the same
canonical join" — that generalization only happened when the review forced
BOTH `portal-billing.ts` and `portal-billing-actions.ts` to be compared side
by side and the contradiction became visible.

**Proposed lessons.md rule** (one line, for `tasks/lessons.md`):

> **Agency-side writes, client-side reads:** when a feature writes rows
> under the AGENCY org but is also read from a CLIENT-facing session (portal,
> magic link, public route), extract ONE shared `resolveXForClientOrg`-style
> join function and make every client-facing read/write go through it —
> never let two call sites independently re-derive "how do I get from the
> client's session to the agency's rows." A client-scoped `session.orgId`
> used directly against an agency-scoped table is a silent empty-result bug,
> not a compile error or a runtime throw — it will pass isolated unit tests
> that DI the "right" id and only surface in an end-to-end check.

**Preview-mode-activation coupling (documented, not changed per review
instruction):** `createProposalRowReal` (Task 2) repurposes
`proposals.previewWorkspaceId` as the client-org join key for
EXISTING-client retainers, by setting it to `input.clientOrgId`. The Connect
webhook's `checkout.session.completed` handler
(`app/api/webhooks/stripe/connect/route.ts`, the `if (proposal.previewWorkspaceId)`
block ~line 520-539) reads that same column to decide whether to flip a
workspace's `previewMode` from `true` to `false` on acceptance. For an
ALREADY-ACTIVE client (the normal case — you're attaching a retainer to an
existing, live client), this is a safe no-op: the workspace's
`previewMode` is already `false`, so the flip-check does nothing. **But if
an operator ever attaches a retainer checkout to a client workspace that is
STILL in `previewMode: true`** (e.g., a not-yet-fully-onboarded client), the
retainer checkout's acceptance will ALSO activate that preview workspace —
a side effect the operator may not expect from "set up billing." This is
existing, intentional-by-reuse behavior (not a new bug), left as-is per
review instruction, but is worth Max knowing about: **attaching autopay to
a preview-mode client workspace activates it.**

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
3. ~~**`portal-billing-actions.ts`'s `updateRetainerCardAction`**...~~
   **RESOLVED in the review-fix wave.** `updateRetainerCardAction` now calls
   the shared `resolveRetainerLinkForClientOrg`, whose
   `findProposalByClientOrgIdReal` carries `orderBy(desc(proposals.createdAt))`
   — the most recent retainer proposal always wins, so a client org with a
   canceled-then-renewed retainer resolves the CURRENT one, not a stale
   customer id.
4. **Dunning cron's day-3/day-7 windows are wall-clock, not business-day**
   — matches the plan's literal spec ("day-3/day-7 escalation stamps"), no
   deviation, just noting for anyone tuning the cadence later.
5. The pre-existing `category-portal.spec.ts` failure (item above) was not
   fixed as part of this task — it's out of this build's scope (unrelated
   file, unrelated feature) and fixing brittle line-anchored tests is
   itself flagged as a known anti-pattern in this codebase's lessons file.
6. **(new, review-fix wave) The sibling-invoice recovery match
   (`findOutstandingFailedForSubscriptionReal`)** matches on
   `metadata.subscriptionId` via a jsonb `->>'subscriptionId'` comparison
   and takes the MOST RECENT outstanding failed row
   (`orderBy(desc(createdAt))`) — if a subscription somehow accumulates
   MORE THAN ONE outstanding failed cycle before a recovery fires (e.g. two
   consecutive failed months before the card gets fixed), only the most
   recent one gets stamped `resolvedByLaterPayment`; the older one would
   still need its own resolution (either a genuinely separate unpaid past
   cycle, which is correct to keep chasing, or a Stripe-side quirk this
   build doesn't model). Not pinned by a test — flagging as a real but
   narrow edge case for anyone extending multi-cycle-failure handling.
7. **Live smoke for the recovery/join fixes specifically** is still
   outstanding, same caveat as risk #1 — no real Stripe test-mode
   invoice.paid re-fire, no real portal session hitting the fixed
   `/billing` page, has been exercised end-to-end yet.

# Autopay Console — build plan (2026-07-08)

Spec: `docs/superpowers/specs/2026-07-08-autopay-console-design.md` (approved
at Gate 1 — read it first; §0 is the verified seam map). Worktree:
`.claude/worktrees/autopay-console`, branch `feature/autopay-console` (off
main @ 09da78130). TDD per task (watch each fail), commit-per-task, diff-only
edits. **MONEY BUILD**: no new fee logic (`GMV_FEE_PERCENT` in
`lib/billing/gmv.ts` is the single source, read-only), no raw card data ever,
every Stripe-adjacent write idempotent, everything fail-soft, all UI dark
behind `SF_AUTOPAY_CONSOLE`. NO migration expected — if a schema change turns
out to be genuinely required, STOP and report instead of writing one.

## Grounded seams (from the verified recon — confirm each on this ref as you go)

- Checkout factory: `lib/proposals/checkout.ts:22-81` `buildCheckoutSessionParams`
  (subscription mode + `application_fee_percent: GMV_FEE_PERCENT` + setup-fee
  one-time line item). Callers: `app/start/actions.ts:185-188`,
  `app/p/[token]/accept/route.ts:68-71`.
- Connected accounts: `stripeConnections` (`db/schema/payments.ts:7-25`),
  resolved `orgId + isActive` (`app/start/actions.ts:81-90`).
- Connect webhook: `app/api/webhooks/stripe/connect/route.ts` —
  `checkout.session.completed` handler :444-539; card metadata →
  `contacts.customFields.billing` around :563; deal/contact/payment_records
  via `lib/proposals/create-deal-on-acceptance.ts:309-352` (idempotent on
  sourceId).
- `paymentRecords` schema: `db/schema/payments.ts:27-61`.
- Proposals: `db/schema/proposals.ts:31-94` (monthlyPriceCents, setupFeeCents,
  stripeSubscriptionId/CustomerId persisted by the webhook :503-510).
- Portal: `app/portal/[orgSlug]/` — (client) group + magic-link auth; the
  portal-documents session-scoping precedent for auth.
- Client cards: `/studio/clients` collapsible editors (BookingPolicyEditor /
  DeploymentCustomizationEditor / the usage-cap editor) + their data loader.
- Email rail: `lib/notifications/ops-notifications.ts` (`sendUsageCapAlert`
  ~:499 is the freshest sibling pattern). Cron shape:
  `app/api/cron/usage-caps/route.ts` (CRON_SECRET fail-closed, ?dryRun=1,
  vercel.json registration).
- Billing-portal precedent: `lib/marketplace/billing/billing-portal-action.ts:26-57`.

## Files touched (complete — nothing outside it; where a path says "locate",
grep first and name it in your report)

- `packages/crm/src/lib/payments/retainer.ts` (new)
- `packages/crm/src/app/api/webhooks/stripe/connect/route.ts` (invoice.paid /
  invoice.payment_failed additions ONLY — smallest insertion)
- `packages/crm/src/lib/proposals/create-deal-on-acceptance.ts` (only if the
  cycle-recording helper naturally colocates; else keep it in retainer.ts)
- the /studio/clients client-card composition + data loader (locate) + new
  `billing-retainer-editor.tsx` colocated with the other editors
- one new org-scoped action file (or extend the deployments actions file the
  other editors use) for: create-retainer-checkout-link, cancel-retainer,
  send-link
- `packages/crm/src/app/portal/[orgSlug]/(client)/billing/page.tsx` (new) +
  minimal nav link in the portal shell (locate)
- `packages/crm/src/lib/payments/billing-portal.ts` (new — connected-account
  billing-portal session, repurposing the marketplace pattern)
- `packages/crm/src/app/api/cron/payment-dunning/route.ts` (new) +
  `vercel.json` cron registration
- `packages/crm/src/lib/notifications/ops-notifications.ts`
  (`sendPaymentFailedAlert` sibling)
- Tests (new): `tests/unit/payments/retainer.spec.ts`,
  `tests/unit/payments/connect-webhook-cycles.spec.ts`,
  `tests/unit/payments/dunning.spec.ts` (+ extend existing webhook specs if
  any exist — grep first)

## Task 1 — cycle recording (live-on-merge; the 2% becomes visible)

Test first (`connect-webhook-cycles.spec.ts`, DI fakes): connected-account
`invoice.paid` → INSERT paymentRecords {sourceBlock:"retainer",
sourceId:stripeInvoiceId, status:"completed", amount from invoice total,
orgId + contactId resolved via the subscription's stored ids on proposals (or
subscription metadata — read the webhook's existing resolution and reuse)};
duplicate delivery → no second row (idempotent on sourceId); unknown
subscription → logged skip, NEVER a throw; `invoice.payment_failed` → row
status "failed" + `metadata.dunning = {failedAt, notifyStage: 0}`. The
initial-close invoice must NOT double-record (the checkout.session.completed
path already writes the first row — dedupe rule: skip invoice.paid rows whose
billing_reason is subscription_create; pin with a test).
Commit: `feat(payments): record retainer cycles from connect invoice events`.

## Task 2 — retainer lib + agency editor (flag-gated UI)

Test first (`retainer.spec.ts`, DI): `createClientRetainerCheckout` reuses
buildCheckoutSessionParams (assert the params: subscription mode, the fee
percent, line items) and requires an active stripeConnections row (none →
`{ok:false, reason:"stripe_not_connected"}`, no Stripe call); cancel action
authz = builder org owns the deployment/client (org-scoped; non-owner
rejected); link-delivery composes the existing email rail.
Implementation: `lib/payments/retainer.ts` + org-scoped actions +
`billing-retainer-editor.tsx` on the client card (status: none /
pending-link / active / past_due / canceled — derive from proposals'
stripeSubscriptionId + latest paymentRecords; do NOT call Stripe to render
status). Flag off → editor absent (pin).
Commit: `feat(payments): client retainer checkout + agency billing editor (flagged)`.

## Task 3 — portal Billing section (flag-gated)

Portal (client) group page: payment history (their org's paymentRecords,
newest first, hosted invoice links from metadata when present), card summary
from `contacts.customFields.billing` (brand/last4 only), "Update card" →
connected-account billing-portal session (`lib/payments/billing-portal.ts`,
stripe_not_connected → hide the button). Auth: the portal session's org
scoping — a client can NEVER see another org's rows (pin with a test on the
data-access function). Flag off → nav link + page absent (404s clean).
Commit: `feat(portal): client billing section — history, card, update-card (flagged)`.

## Task 4 — dunning notifications (cron)

Test first (`dunning.spec.ts`, DI): failed rows with notifyStage 0 and age ≥3d
→ client email (hosted-invoice pay link) + agency alert + stage→1; stage 1 and
age ≥7d → second notice + stage→2; stage 2 → no more (cap); dryRun sends
nothing and mutates nothing; a row that later gets a "completed" sibling for
the same subscription period → skipped. THE CRON NEVER CALLS STRIPE.
Implementation: `api/cron/payment-dunning` (usage-caps shape: CRON_SECRET
fail-closed, ?dryRun=1) + vercel.json entry + `sendPaymentFailedAlert`.
Commit: `feat(payments): dunning notifications cron (notify-only)`.

## Task 5 — revenue strip

One grouped paymentRecords query (the usage-rollup pattern — month-to-date
completed retainer+proposal amounts per client org + book total + "includes
SeldonFrame's 2% platform fee" transparency line, labeled clearly) rendered
above the client cards next to the usage totals. Flag-gated with the rest.
Commit: `feat(agency): month-to-date revenue strip on the client book (flagged)`.

## Regression set (grep must be empty)

`git diff --name-only origin/main..HEAD | grep -E
"lib/billing/gmv|wallet-store|voice/openai|messaging/|lib/sms/|bookings/|stripe-billing|app/api/stripe/checkout"`
(the tier-ladder platform-billing path is UNTOUCHED — this build lives on the
CONNECT side) · `| grep drizzle` empty.

## Verify

Named specs fail-0 → wide payments+billing+deployments sweep (glob the real
files) → tsc: baseline is now **9** post-.next-untrack, 0 in touched files →
use-server clean → regression greps empty. Report to
`.superpowers/sdd/autopay-console-report.md` (Files changed first, located
surfaces named, verbatim tails, deviations, open risks). Reply: status +
shas + one-line summary.

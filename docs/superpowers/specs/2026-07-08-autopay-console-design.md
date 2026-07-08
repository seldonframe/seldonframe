# Autopay Console — design spec (2026-07-08)

Feature: the 2% rail made default — recurring client retainers on autopay
through SeldonFrame (card on file, monthly auto-bill, fee collects itself at
the Stripe level), manageable by the agency per sub-account and visible to the
client in their portal. This is the multiple-maker from the pricing-to-1b doc.

## 0. THE HEADLINE FINDING (verified scout recon, 2026-07-08)

**The recurring rail is ALREADY BUILT.** The `/start` live-sell flow creates a
**subscription-mode** Stripe Checkout on the agency's connected account with
`application_fee_percent: GMV_FEE_PERCENT` (= 2, `lib/billing/gmv.ts:17`) via
`buildCheckoutSessionParams` (`lib/proposals/checkout.ts:22-81`) — setup fee as
a one-time line item + recurring monthly. Connected accounts live in
`stripeConnections` (`db/schema/payments.ts:7-25`, onboarding at
`/api/v1/proposals/connect/start`). The Connect webhook
(`app/api/webhooks/stripe/connect/route.ts`) already handles
`checkout.session.completed` (proposal accepted → contact + Won deal +
payment_records row) and receives subscription/invoice events. The client
portal EXISTS (`app/portal/[orgSlug]/` with a (client) group + magic-link
auth), the Connect webhook already writes card metadata to
`contacts.customFields.billing` (route.ts:563+), and 17 cron routes provide
the dunning shape (usage-caps is the freshest precedent).

**So this build is the CONSOLE around an existing rail, not a new money path:**
1. attach autopay to EXISTING clients (today only new /start closes get it),
2. record recurring cycles (today only the initial close writes
   payment_records — monthly `invoice.paid` cycles are NOT recorded → the
   agency's revenue picture undercounts, and our 2% is invisible in-product),
3. give the client a portal Billing surface,
4. notify on failures (Stripe smart-retries the card; we own the alerts),
5. show the agency their book's revenue.

## 1. Decisions

**D1 — Retainer attach for existing clients.** New `lib/payments/retainer.ts`
`createClientRetainerCheckout({ builderOrgId, clientOrgId, contact,
monthlyPriceCents, setupFeeCents? })` — REUSES `buildCheckoutSessionParams`
verbatim (subscription mode + the same 2%; zero new fee logic). Delivery: a
checkout link the agency sends (existing email/SMS rails) or the client opens
from their portal. Card entry is ALWAYS the client's own action in Stripe
surfaces — we never touch or store card numbers.

**D2 — Record every cycle.** Extend the Connect webhook: connected-account
`invoice.paid` → INSERT `payment_records` (idempotent on `stripeInvoiceId` as
sourceId; `sourceBlock: "retainer"`, amount from the invoice, contact resolved
via subscription metadata); `invoice.payment_failed` → a `failed` row +
dunning schedule. Additive + idempotent → safe live-on-merge.

**D3 — Dunning = notifications, not charges.** Stripe's own smart retries
handle re-charging on the connected account. Our `api/cron/payment-dunning`
(usage-caps shape: CRON_SECRET fail-closed, ?dryRun=1, vercel.json entry) only
NOTIFIES: client gets the hosted-invoice pay link (email), agency gets an
alert (sendUsageCapAlert sibling), once per failure with day-3/day-7
escalation stamps on the payment_records row. Money-safe: the cron never
touches Stripe.

**D4 — Agency console.** "Billing & retainer" collapsible on the
/studio/clients client card (the BookingPolicy/Customization/UsageCap editor
pattern): retainer status (none / pending-link / active / past_due /
canceled, derived from subscription state), set amount → generate + send the
checkout link, cancel subscription (the ONE new mutating Stripe call besides
checkout creation — org-scoped, confirm-gated). Plus a revenue strip on the
clients page: MTD collected across the book + our-fee transparency line,
computed from payment_records (one grouped query, the usage-rollup pattern).

**D5 — Client portal Billing section.** New page in the portal (client)
group: payment history (their payment_records), card summary
(customFields.billing brand/last4 — already written by the webhook), links to
Stripe hosted invoices/receipts, "Update card" via a Stripe billing-portal
session created on the CONNECTED account (repurpose the marketplace
billing-portal-action pattern with the stripeAccount param). Portal-session
auth scoping per the portal-documents precedent.

**D6 — Money-safety invariants.** No new fee logic (GMV_FEE_PERCENT is the
single source); flag `SF_AUTOPAY_CONSOLE` gates all UI (editor, portal
section, revenue strip); new Stripe calls are inert without an active
stripeConnections row; every ledger-ish write idempotent (stripeInvoiceId);
org-scope + portal-session-scope on every query; no card data beyond
brand/last4 metadata Stripe already gives us.

**D7 — Out of scope.** ACH/other rails · proration/mid-cycle changes ·
custom charge retries · multi-currency · invoicing-UI overhaul · migrating
legacy manually-invoiced clients (they attach via D1 when ready).

## 2. Slices (TDD, commit-per-task)

- **T1 cycle recording (live-on-merge):** webhook `invoice.paid`/`payment_failed`
  handlers + payment_records writes, DI-tested end-state (rows, idempotency,
  unknown-subscription fail-soft).
- **T2 retainer lib + agency editor:** createClientRetainerCheckout (reuses
  checkout factory) + link delivery + the client-card editor + cancel action.
- **T3 portal Billing section.**
- **T4 dunning cron + alerts.**
- **T5 revenue strip (grouped query).**

## 3. Regression set (forbidden)

`lib/billing/gmv.ts` (read-only) · wallet-store · voice webhook ·
`messaging/**` · `bookings/**` · the PLATFORM stripe billing
(checkout/webhooks/stripe-billing — the tier ladder's path; this build lives
entirely on the CONNECT side). No migration expected (payment_records +
proposals carry the state; if a column IS needed, stop and re-spec).

## 4. Validation

verify-build + the new webhook/retainer/dunning specs · opus review at money
severity (non-negotiable) · live smoke: one real retainer checkout link
generated on the Acme AI connected account (test mode) + a Stripe-CLI-shaped
fake `invoice.paid` against the webhook in tests · vision on the client card
+ portal Billing (coverage-scoped grader briefs).

## 5. Human actions

None at merge (T1 additive; UI dark behind `SF_AUTOPAY_CONSOLE`). At flip:
confirm your Stripe Connect account is active, flip the flag, attach ONE real
client retainer as the smoke.

---
id: payments
scope: universal
frameworks: agency,coaching,consulting,service,realestate,ecommerce,saas
status: core
---
# BLOCK: Payments

**Description**
Invoicing + one-off payments + recurring subscriptions via Stripe Connect Standard. Each SMB connects their own Stripe account once (OAuth); every subsequent API call routes funds, invoices, customers, and payouts to the SMB's account via the `Stripe-Account` header. SeldonFrame never holds the SMB's secret key. SMB keeps 100% of their revenue — we don't take an application fee in v1.

**Behavior**
Payments are **state-machine driven**, not turn-driven. There is no conversational payment primitive. Inbound events arrive via Stripe webhooks — some seconds after the request (payment_intent.succeeded), some months later (subscription.renewed, charge.dispute.created). The block is a thin mapping layer between our DB and Stripe's authoritative state.

Three orthogonal flows share one infrastructure:
1. **One-off charges** — Checkout Sessions routed to the connected account (existing booking-payment flow, fixed in Phase 5.b).
2. **Invoices** — Draft → Sent → Paid / Past Due / Voided. Stripe hosts the invoice page + handles collection emails + provides a hosted pay page.
3. **Subscriptions** — Active → Past Due → Canceled. `cancel_at_period_end` is the default cancellation pattern; immediate termination is opt-in.

**Integration Points**
- **CRM** — every invoice / subscription / payment targets a contact. Activity timeline picks up `invoice.paid` + `payment.refunded` for per-contact history.
- **Booking** — `booking.created` with an amount → booking checkout session on the connected account. Payment-completed webhook flips the booking to scheduled.
- **Brain v2** — `payment.completed`, `invoice.past_due`, `subscription.trial_will_end` feed retention + cash-flow signals.
- **Automations** — `send-invoice`, `cancel-subscription`, `refund-payment` compose as workflow nodes.
- **Email block** — `invoice.past_due` can trigger a templated dunning email; `subscription.trial_will_end` can trigger a pre-expiry nudge.

---

## Purpose

The "handoff" moment in the SMB's workflow — where SeldonFrame stops being a CRM dashboard and starts being the substrate that actually collects money. The v1 promise "each SMB owns their payments" only makes sense if charges route to their Stripe, not ours. That promise was silently broken in the pre-Phase-5 booking flow; Phase 5.b fixed the routing. Every Phase 5 call passes `stripeAccount` so the money always lands where it should.

---

## Entities

Minimal canonical set — full schemas in `packages/crm/src/db/schema/{payments,invoices,subscriptions,payment-events}.ts`.

- **PaymentRecord** (`payment_records`): `stripePaymentIntentId`, `stripeAccountId`, `stripeChargeId`, `amount`, `currency`, `status` (pending | completed | failed | refunded | partially_refunded | disputed), `refundedAmount`, `refundedAt`, `disputedAt`, `stripeDisputeId`, `sourceBlock` (booking | landing | manual | subscription | invoice).
- **Invoice** (`invoices`): `stripeInvoiceId`, `stripeAccountId`, `stripeCustomerId`, `number`, `status` (draft | open | paid | past_due | voided | uncollectible), `currency`, `subtotal`, `tax`, `total`, `amountPaid`, `amountDue`, `dueAt`, `sentAt`, `paidAt`, `voidedAt`, `hostedInvoiceUrl`.
- **InvoiceItem** (`invoice_items`): `invoiceId`, `description`, `quantity`, `unitAmount`, `amount`, `currency`.
- **Subscription** (`subscriptions`): `stripeSubscriptionId`, `stripeAccountId`, `stripeCustomerId`, `stripePriceId`, `productName`, `status`, `amount`, `currency`, `interval`, `intervalCount`, `currentPeriodStart`, `currentPeriodEnd`, `cancelAt`, `canceledAt`, `trialEnd`.
- **PaymentEvent** (`payment_events`): unified webhook audit — `providerAccountId`, `providerEventId` (unique for idempotency), `eventType`, `targetType` (payment | invoice | subscription | other), `targetId`, `payload`.

---

## Events

### Emits (canonical `SeldonEvent` vocabulary)

**Payments:**
- `payment.completed` — `{contactId, amount, currency, source}`. Already emitted from Phase 0 booking path; now also for invoice payments.
- `payment.failed` — `{contactId, amount, reason}`. From `payment_intent.payment_failed`.
- `payment.refunded` — `{contactId, paymentId, amount, currency}`. From `charge.refunded`.
- `payment.disputed` — `{contactId, paymentId, amount, reason}`. From `charge.dispute.created`.

**Invoices:**
- `invoice.created` — `{contactId, invoiceId, amount}`.
- `invoice.sent` — `{contactId, invoiceId}`. Invoice dispatched via Stripe's hosted flow.
- `invoice.paid` — `{contactId, invoiceId, amount, currency}`.
- `invoice.past_due` — `{contactId, invoiceId, amountDue}`. From `invoice.payment_failed`.
- `invoice.voided` — `{contactId, invoiceId}`.

**Subscriptions:**
- `subscription.created` — `{contactId, planId}`.
- `subscription.updated` — `{contactId, subscriptionId, status}`. Any mid-lifecycle change (price change, upgrade, trial → active).
- `subscription.renewed` — `{contactId, subscriptionId, amount, currency}`. (Emitted by the invoice.paid handler when the invoice is on a subscription.)
- `subscription.cancelled` — `{contactId, planId}`. At-period-end cancellations and immediate cancellations both land here when the period actually ends.
- `subscription.trial_will_end` — `{contactId, subscriptionId, trialEnd}`. Stripe fires this ~3 days before trial expiry.

### Listens
- `booking.created` (from caldiy-booking) — optional checkout session if the booking has an amount.
- `form.submitted` (from formbricks-intake, if the intake form has a paid-qualifier field) — optional invoice trigger.

---

## Composition Contract

Machine-readable contract for Phase 7 agent synthesis.

produces: [payment.completed, payment.failed, payment.refunded, payment.disputed, invoice.created, invoice.sent, invoice.paid, invoice.past_due, invoice.voided, subscription.created, subscription.updated, subscription.renewed, subscription.cancelled, subscription.trial_will_end]
consumes: [workspace.soul.business_type, workspace.soul.default_currency, contact.id, contact.email, contact.firstName, booking.id, booking.amount]
verbs: [invoice, bill, charge, collect, payment, subscribe, subscription, recurring, refund, cancel, dunning, past due, failed payment]
compose_with: [crm, caldiy-booking, email, sms, automation, brain-v2]

---

## Notes for agent synthesis

**Connect topology is non-negotiable.** Every Stripe API call the provider makes is scoped to the SMB's connected account. An agent proposing a payments flow should never try to route through the platform account — that's only for SeldonFrame's own $9/mo billing.

**Prefer Stripe's hosted flows.** Checkout Sessions, hosted invoice pages, hosted customer portal — all reduce our liability surface (PCI, SCA, 3DS) and give the SMB a familiar UX. Don't build a custom card form.

**Webhook-driven state.** For any operation an agent triggers (create_invoice, create_subscription), the immediate API response is "what Stripe accepted" — the authoritative state comes from the webhook moments or months later. Agents that act on "is this paid yet?" should check `payment_records.status` / `invoices.status` (which the webhook receiver keeps in sync), not assume the create call's response is final.

**Price ids must pre-exist.** `create_subscription` requires a `priceId` from the SMB's Stripe dashboard. v1 does not surface Price creation through MCP or UI — the assumption is SMBs set up their offerings in Stripe directly. Price creation via MCP is a V1.1 candidate if agent demand surfaces.

**Dunning + churn-save agents are natural compositions.** `invoice.past_due` + `subscription.trial_will_end` are the two highest-value triggers for retention work. Compose: `payments.invoice.past_due` → `email.send_email` (polite nudge) → `email.send_email` (firmer nudge + offer to reschedule) → `payments.void_invoice` (give up, mark as bad debt). Fully inside the existing block graph.

---

## Navigation

- `/settings/payments` — Stripe Connect status + disconnect flow
- `/settings/integrations/stripe` — webhook URL hint + environment setup
- `/contacts/[id]` — per-contact payment history (appears inline via activities)
- `/payments` — dashboard payment list (deferred — MCP list_payments covers v1 needs)
- `/invoices` — dashboard invoice list (deferred — MCP list_invoices covers v1 needs)

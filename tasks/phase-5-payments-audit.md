# Phase 5 — Payments/Invoicing kickoff audit (D-3 decision doc)

**Date:** 2026-04-21
**Slice:** 5.a
**Output:** this doc — no code changes.
**Gate:** 5.b (schema) is blocked on approval of the D-3 decision below.

---

## Why Phase 5 is shaped differently from Phases 3 and 4

Confirmed: the Conversation Primitive pattern does **not** transfer to payments. Phase 5 is state-machine-driven and webhook-heavy, not turn-driven. Key differences:

| Dimension | Email / SMS (Phase 3/4) | Payments (Phase 5) |
|---|---|---|
| Shape | Turn-driven (request → reply) | State-machine (pending → succeeded / failed / refunded / disputed) |
| Latency | Seconds | Minutes to **months** (subscription renewals, disputes) |
| Inbound | Live conversation | Webhooks firing long after the initial request |
| Reasoning | Soul-aware reply generation | None — deterministic state transitions |
| Runtime reuse | Conversation Primitive handles both | **No runtime reuse.** Payments have their own orchestration |
| Provider abstraction | Worth it (multi-provider likely) | Worth it (Paddle / Lemon Squeezy / LemonPay are real alternatives) |

**What transfers from Phase 3/4:**
- Typed `PaymentProvider` interface + Stripe impl (same pattern as `EmailProvider` / `SmsProvider`).
- Per-workspace secret storage (existing `stripe_connections` table).
- Webhook-receiver with idempotency via unique `(provider, provider_event_id)`.
- Suppression-style bookkeeping is **irrelevant** — there's no "opt out of invoices."
- `Composition Contract` schema on BLOCK.md — same 4 fields.

**What's net-new for Phase 5:**
- State-machine transitions written explicitly (no auto-generation from conversation turns).
- Dispute / chargeback flows (webhooks fire months later; must match back to original payment).
- Subscription lifecycle events (`customer.subscription.created/updated/deleted`, `invoice.payment_failed`, `customer.subscription.trial_will_end`).
- Connect topology decision — see D-3 below.

---

## Inventory — what already exists

### DB (already on main)

**`stripe_connections`** (`packages/crm/src/db/schema/payments.ts`):
- `orgId`, `stripeAccountId`, `accessToken` (OAuth token from Connect), `stripePublishableKey`, `isActive`, `connectedAt`.
- Index: `(orgId, isActive)`.
- Populated by the Connect OAuth callback (below).

**`payment_records`** (same file):
- `orgId`, `contactId`, `bookingId`, `stripePaymentIntentId`, `amount`, `currency`, `status`, `sourceBlock`, `sourceId`, `metadata`.
- Index: `(orgId, contactId)`, `(orgId, status)`.
- Currently only written from booking checkout completions.

**No `invoices` or `subscriptions` table yet** — Phase 5.b will add these.

### Server code

**`packages/payments/`** is a dedicated package (not inside `packages/crm/src/lib/`). Contains:
- `connect.ts` — `buildStripeConnectUrl(state, redirectUri)` + `exchangeStripeConnectCode(code, secretKey)`. Uses `STRIPE_CONNECT_CLIENT_ID` env → **Connect Standard OAuth flow is wired up today**.
- `checkout.ts` — `createCheckoutSession(input)` using the platform-level `STRIPE_SECRET_KEY`.
- `webhooks.ts` — Stripe signature verification + event mapping.
- `stripe-client.ts` — singleton Stripe client using platform key.
- `schema.ts` — mirror of `stripe_connections` (duplicate of the CRM-side schema for the @seldonframe/payments package).

**`packages/crm/src/lib/payments/actions.ts`** — workspace-level payments:
- `startStripeConnectAction` — redirects to Stripe OAuth (Connect Standard).
- `completeStripeConnectFromCode` — exchanges code, inserts into `stripe_connections`.
- `getStripeConnectionStatus` — looks up the active connection for the current org.
- `createBookingCheckoutSession` — creates a Stripe Checkout session for a booking.
- `handleStripeCheckoutCompleted` — webhook handler that writes `payment_records` + `bookings.metadata.paymentStatus`.

**`packages/crm/src/lib/billing/actions.ts`** — SeldonFrame platform billing ($9/mo for additional workspaces). Uses `STRIPE_SECRET_KEY` directly (platform account). Unrelated to workspace payments.

**`/api/stripe/checkout/route.ts`** — booking checkout entry point.
**`/api/stripe/portal/route.ts`** — Stripe customer portal (for SeldonFrame subscribers — platform).
**`/api/stripe/webhook/route.ts`** — single webhook endpoint currently handling platform + workspace events through the same shared secret.

### UI

- `/settings/payments` — existing settings page. Verifies status via `getStripeConnectionStatus`.
- `/settings/integrations` — does NOT currently surface Stripe Connect state.
- No invoice composer, no subscription manager — all Phase 5 scope.

### Env vars already in use

| Var | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Platform account — SeldonFrame's own $9/mo billing + current booking checkouts |
| `STRIPE_CONNECT_CLIENT_ID` | Connect Standard OAuth client id (platform-registered) |
| `STRIPE_WEBHOOK_SECRET` | Platform webhook signature secret |
| `STRIPE_TEST_SECRET_KEY` / `STRIPE_LIVE_SECRET_KEY` | Fallback chain in `getStripeClient` |

---

## Critical finding — existing booking-checkout routing bug

`createBookingCheckoutSession` in `lib/payments/actions.ts` calls `createCheckoutSession` from `@seldonframe/payments`, which uses the platform `STRIPE_SECRET_KEY` client with **no `stripeAccount` override**. That means:

- When an SMB's prospect books and pays, **the money lands in SeldonFrame's platform Stripe account**, not the SMB's connected account.
- The `stripe_connections.stripeAccountId` is stored but never used to route the charge.
- This contradicts the v1 promise that "each SMB owns their payments."

This bug is pre-Phase-5 — it's production behavior today. Phase 5.b must fix the booking checkout to pass `stripeAccount: connection.stripeAccountId` (or use `stripe.checkout.sessions.create(input, {stripeAccount})`) so funds route correctly. **Treat this as a P1 fix inside Phase 5, not a v1.1 followup** — it affects real money flow.

---

## D-3 — Stripe Connect topology decision

### Option A — Connect Standard *(recommended)*

SMB clicks "Connect Stripe" → OAuth redirect → SMB creates / logs into their own Stripe account → returns with an access token + `stripe_user_id`. We store the account id, pass it as `stripeAccount` header on every Stripe API call, so charges + payouts route directly to the SMB.

**Pros:**
- Already scaffolded — `buildStripeConnectUrl`, `exchangeStripeConnectCode`, `stripe_connections` table, callback route, settings page.
- SMB owns their Stripe account entirely — if they leave SeldonFrame, they keep it. Matches differentiator (e) data ownership.
- Standard Connect fees apply (platform can optionally add an application fee; we won't v1).
- Dispute / chargeback flows stay between SMB and Stripe directly.
- Webhooks come from connected accounts (signed with the platform secret; `account` field tells us which account).
- Security: we never hold the SMB's secret key. Only an OAuth-issued access token we can revoke.

**Cons:**
- SMB has to create a Stripe account (onboarding friction — but Stripe's onboarding is fast, and most SMBs already have one).
- Application fees, if we ever charge them, have to be set per-transaction.
- Platform is liable for SCA / 3DS compliance in the flow.

### Option B — Direct BYO secret key

SMB pastes their Stripe secret key into a form → we encrypt + store it in `workspace_secrets` → we make API calls using their key.

**Pros:**
- Zero onboarding — paste a key, done.
- Clear separation: we're "just" a dashboard over their Stripe.

**Cons:**
- **We're holding their secret key.** Any breach of our encryption key or process is game-over for every SMB.
- If they rotate the key, our store silently breaks until they re-paste.
- Webhooks must be configured per-workspace on Stripe's side — ten workspaces = ten Stripe dashboard visits.
- Doesn't match what we do for other integrations (Resend is BYO, but email keys are lower-risk than Stripe secret keys).
- Connect's standard UX (disputes, tax, payouts, onboarding compliance) isn't handled — SMB is on their own.

### Recommendation — **Connect Standard** (confirmed by the audit)

The pre-existing OAuth scaffolding + env configuration + callback route + `stripe_connections` schema biases this decisively. The friction delta is small (Stripe OAuth is 3 clicks), and the security + platform-compliance upside is material.

**Reversal cost if wrong:** moderate. If we find SMBs abandoning at the Connect OAuth step, we can add BYO as a second option in V1.1 — the provider abstraction shipped in 5.c will support both.

**Answer to D-3: Connect Standard.** Lock this decision before 5.b ships.

---

## Phase 5 slicing (proposed)

Matches the Phase 3/4 rhythm except where state-machine vs conversation-turn divergence dictates:

- **5.a** — this audit + D-3 decision (current).
- **5.b** — Schema: `invoices`, `invoice_items`, `subscriptions`, `subscription_events`, extend `payment_records` for refunds/disputes. Migration 0018. **Includes the booking-checkout routing fix** so all new schema work is coherent with corrected fund routing.
- **5.c** — `PaymentProvider` interface + Stripe impl. `send()`-equivalent is split into `createInvoice`, `createSubscription`, `createRefund`, `attachPaymentMethod`. Stripe impl uses per-workspace connected account via `stripeAccount` header.
- **5.d** — Event vocabulary: `payment.succeeded`, `payment.failed`, `invoice.created`, `invoice.paid`, `invoice.past_due`, `invoice.voided`, `subscription.created`, `subscription.renewed`, `subscription.canceled`, `payment.refunded`, `payment.disputed`. Most already in `SeldonEvent` union (Phase 0); gap check in 5.d.
- **5.e** — Stripe webhook receiver: handle Connect events (`payment_intent.*`, `invoice.*`, `customer.subscription.*`, `charge.refunded`, `charge.dispute.*`). Idempotent via `(provider, stripe_event_id)`.
- **5.f** — Server actions: `createInvoiceFromApi`, `createSubscriptionFromApi`, `refundPaymentFromApi`.
- **5.g** — MCP tools: `create_invoice`, `list_invoices`, `send_invoice`, `void_invoice`, `create_subscription`, `cancel_subscription`, `list_payments`, `refund_payment`, `get_payment`. ~9 tools.
- **5.h** — `payments.block.md` with day-1 composition contract.
- **5.i** — UI: invoice composer, payment history per contact, subscription manager on `/settings/payments` or a new `/payments` dashboard page.

**Deliberately NOT in Phase 5:**
- Stripe Tax integration (v1.1).
- Multi-currency smart routing (v1.1 if SMBs ask).
- In-product 3DS / SCA challenge screens (we redirect to Stripe's hosted flow).
- Dispute response flows (v1.1 — SMB handles via Stripe dashboard for v1).
- Application fees charged by SeldonFrame per transaction (never charging these is a positioning choice — SMB keeps 100% of their revenue, SeldonFrame only charges the $9/mo platform subscription).

---

## Open questions surfaced by this audit

1. **Webhook consolidation:** today's `/api/stripe/webhook` handles platform events. Connect events also arrive here (same signing secret). Phase 5.e must segment events by `account` field and route to workspace vs platform handlers. Decision: **keep single endpoint**, dispatch internally. Splitting endpoints doubles the Stripe dashboard config work for no benefit.

2. **Currency:** `payment_records.currency` defaults to `USD`. Invoices will inherit the connected account's default currency. Multi-currency in one workspace deferred.

3. **Test mode vs live mode:** the existing `getStripeClient` tries `STRIPE_TEST_SECRET_KEY` fallback. For workspace-connected accounts, we use whatever mode the SMB's Stripe is in — no env override needed. Dev workspaces connecting to Stripe's test OAuth sandbox works automatically.

4. **Connect app fees:** opt-out for v1 (0% platform fee). Add the knob in V1.1 if we ever want a cut.

5. **Refund source-of-truth:** if an SMB refunds via Stripe dashboard directly, our webhook receiver catches `charge.refunded` and updates `payment_records.status`. Confirmed in 5.e design.

---

## Decision request

**Approve Connect Standard as the Phase 5 topology.** Once approved, 5.b proceeds: schema migration + booking-checkout routing fix + invoice/subscription tables.

If Direct BYO is preferred instead, the audit above documents the tradeoff clearly; pivoting costs ~1 day of OAuth-teardown work plus `workspace_secrets` integration and loses the existing Connect scaffolding — but the decision is yours.

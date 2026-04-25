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

Machine-readable contract for Phase 7 agent synthesis. Migrated to v2
(Scope 3 Step 2b.2 block 4) — `produces` + `consumes` are JSON arrays
of typed objects. `verbs` + `compose_with` remain string arrays
(v1 shape intentionally preserved — they're human-authored hints, not
type-checked).

**Webhook-produced events:** many events in `produces` below are fired
by Stripe webhooks (payment_intent.succeeded → payment.completed,
invoice.payment_succeeded → invoice.paid, customer.subscription.trial_will_end
→ subscription.trial_will_end, etc.), not by any synchronous tool
call. That's why the Tools block's per-tool `emits` is a subset of the
block-level `produces`: `tool.emits` covers only events a tool fires
directly. The validator enforces `tool.emits ⊆ block.produces`, not
the reverse — webhook-only events live on the block, not on any tool.

**Stripe-complexity containment:** Per the 2b.2 Payments directive,
Stripe-specific type machinery stays in `payments.tools.ts`, NOT in
`lib/agents/types.ts`. If ConversationExit / Predicate / ExtractField
/ Step types would need to shift to accommodate Stripe semantics,
that's a stop-and-flag signal — the abstraction is wrong, not the
block.

produces: [{"event": "payment.completed"}, {"event": "payment.failed"}, {"event": "payment.refunded"}, {"event": "payment.disputed"}, {"event": "invoice.created"}, {"event": "invoice.sent"}, {"event": "invoice.paid"}, {"event": "invoice.past_due"}, {"event": "invoice.voided"}, {"event": "subscription.created"}, {"event": "subscription.updated"}, {"event": "subscription.renewed"}, {"event": "subscription.cancelled"}, {"event": "subscription.trial_will_end"}]
consumes: [{"kind": "soul_field", "soul_field": "workspace.soul.business_type", "type": "string"}, {"kind": "soul_field", "soul_field": "workspace.soul.default_currency", "type": "string"}, {"kind": "event", "event": "booking.created"}, {"kind": "event", "event": "form.submitted"}]
verbs: [invoice, bill, charge, collect, payment, subscribe, subscription, recurring, refund, cancel, dunning, past due, failed payment]
compose_with: [crm, caldiy-booking, email, sms, automation, brain-v2]

<!-- TOOLS:START -->
[
  {
    "name": "create_coupon",
    "description": "Create a Stripe coupon + matching per-contact redeemable promotion code on the workspace's connected Stripe account. Use for Win-Back / retention agents that need UNIQUE codes per recipient (shared codes are vulnerable to abuse + lose attribution signal). Default max_redemptions=1 + auto-generated code string. Requires the workspace to have completed Stripe Connect onboarding.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "percent_off": {
          "description": "Discount percentage (0 < n ≤ 100). Either percent_off or amount_off is required.",
          "type": "number",
          "exclusiveMinimum": 0,
          "maximum": 100
        },
        "amount_off": {
          "description": "Flat discount in the currency's major unit (e.g., 25.00 for $25 off). Either percent_off or amount_off is required.",
          "type": "number",
          "exclusiveMinimum": 0
        },
        "currency": {
          "description": "Only used with amount_off. 3-letter ISO code. Defaults to usd.",
          "type": "string",
          "minLength": 3,
          "maxLength": 3
        },
        "duration": {
          "description": "'once' (default) | 'forever' | 'repeating'. 'repeating' requires duration_in_months.",
          "type": "string",
          "enum": [
            "once",
            "forever",
            "repeating"
          ]
        },
        "duration_in_months": {
          "description": "Required when duration='repeating'.",
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        "name": {
          "description": "Optional display name for the coupon (≤60 chars).",
          "type": "string",
          "maxLength": 60
        },
        "code": {
          "description": "Optional fixed redeemable code string. If omitted, Stripe auto-generates one.",
          "type": "string"
        },
        "max_redemptions": {
          "description": "Max total redemptions. Default 1 — per-contact unique code.",
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        "expires_at": {
          "description": "Optional ISO timestamp. Code becomes invalid after this moment. Prefer expires_in_days for agent archetypes.",
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
        },
        "expires_in_days": {
          "description": "Relative expiry: code becomes invalid N days after this call fires (1–365). Preferred over expires_at for agent archetypes so the window stays meaningful no matter when the agent was last deployed.",
          "type": "integer",
          "minimum": 1,
          "maximum": 365
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "object",
          "properties": {
            "couponId": {
              "type": "string",
              "description": "Stripe coupon id (cpn_...)."
            },
            "promotionCodeId": {
              "type": "string",
              "description": "Stripe promotion code id (promo_...) — the redeemable wrapper around the coupon."
            },
            "code": {
              "type": "string",
              "description": "The redeemable code string the customer types at checkout."
            }
          },
          "required": [
            "couponId",
            "promotionCodeId",
            "code"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": []
  },
  {
    "name": "create_invoice",
    "description": "Draft a Stripe invoice on the workspace's connected Stripe account. Invoice is created but not sent — call send_invoice separately so agents can review before dispatch. Contact must have an email.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "contact_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "CRM contact to bill."
        },
        "items": {
          "minItems": 1,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "description": {
                "type": "string",
                "description": "Line item description."
              },
              "quantity": {
                "description": "Quantity. Default 1.",
                "type": "integer",
                "exclusiveMinimum": 0,
                "maximum": 9007199254740991
              },
              "unit_amount": {
                "type": "number",
                "minimum": 0,
                "description": "Unit amount in the workspace's currency's major unit (e.g., 200.00 for $200)."
              },
              "currency": {
                "description": "Optional per-line currency override.",
                "type": "string",
                "minLength": 3,
                "maxLength": 3
              }
            },
            "required": [
              "description",
              "unit_amount"
            ],
            "additionalProperties": false
          },
          "description": "Line items. At least one required."
        },
        "currency": {
          "description": "3-letter ISO currency code. Defaults to USD.",
          "type": "string",
          "minLength": 3,
          "maxLength": 3
        },
        "due_at": {
          "description": "ISO timestamp for invoice due date. Defaults to 30 days out.",
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "contact_id",
        "items"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "object",
          "properties": {
            "invoice": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "contactId": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "stripeInvoiceId": {
                  "type": "string"
                },
                "stripeAccountId": {
                  "type": "string"
                },
                "stripeCustomerId": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "number": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "draft",
                    "open",
                    "paid",
                    "past_due",
                    "voided",
                    "uncollectible"
                  ]
                },
                "currency": {
                  "type": "string"
                },
                "subtotal": {
                  "type": "number",
                  "minimum": 0
                },
                "tax": {
                  "type": "number",
                  "minimum": 0
                },
                "total": {
                  "type": "number",
                  "minimum": 0
                },
                "amountPaid": {
                  "type": "number",
                  "minimum": 0
                },
                "amountDue": {
                  "type": "number",
                  "minimum": 0
                },
                "dueAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "sentAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "paidAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "voidedAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "hostedInvoiceUrl": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uri"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                }
              },
              "required": [
                "id",
                "contactId",
                "stripeInvoiceId",
                "stripeAccountId",
                "stripeCustomerId",
                "number",
                "status",
                "currency",
                "subtotal",
                "tax",
                "total",
                "amountPaid",
                "amountDue",
                "dueAt",
                "sentAt",
                "paidAt",
                "voidedAt",
                "hostedInvoiceUrl",
                "createdAt"
              ],
              "additionalProperties": false
            },
            "items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string",
                    "format": "uuid",
                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                  },
                  "description": {
                    "type": "string"
                  },
                  "quantity": {
                    "type": "integer",
                    "exclusiveMinimum": 0,
                    "maximum": 9007199254740991
                  },
                  "unitAmount": {
                    "type": "number",
                    "minimum": 0
                  },
                  "amount": {
                    "type": "number",
                    "minimum": 0
                  },
                  "currency": {
                    "type": "string"
                  }
                },
                "required": [
                  "id",
                  "description",
                  "quantity",
                  "unitAmount",
                  "amount",
                  "currency"
                ],
                "additionalProperties": false
              }
            }
          },
          "required": [
            "invoice",
            "items"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": [
      "invoice.created"
    ]
  },
  {
    "name": "list_invoices",
    "description": "List workspace invoices (draft + sent + paid + past_due + voided), newest first.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "limit": {
          "description": "Max rows (default 50, max 200).",
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 200
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid",
                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
              },
              "contactId": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "uuid",
                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "stripeInvoiceId": {
                "type": "string"
              },
              "stripeAccountId": {
                "type": "string"
              },
              "stripeCustomerId": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "number": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "status": {
                "type": "string",
                "enum": [
                  "draft",
                  "open",
                  "paid",
                  "past_due",
                  "voided",
                  "uncollectible"
                ]
              },
              "currency": {
                "type": "string"
              },
              "subtotal": {
                "type": "number",
                "minimum": 0
              },
              "tax": {
                "type": "number",
                "minimum": 0
              },
              "total": {
                "type": "number",
                "minimum": 0
              },
              "amountPaid": {
                "type": "number",
                "minimum": 0
              },
              "amountDue": {
                "type": "number",
                "minimum": 0
              },
              "dueAt": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "sentAt": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "paidAt": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "voidedAt": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "hostedInvoiceUrl": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "uri"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "createdAt": {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
              }
            },
            "required": [
              "id",
              "contactId",
              "stripeInvoiceId",
              "stripeAccountId",
              "stripeCustomerId",
              "number",
              "status",
              "currency",
              "subtotal",
              "tax",
              "total",
              "amountPaid",
              "amountDue",
              "dueAt",
              "sentAt",
              "paidAt",
              "voidedAt",
              "hostedInvoiceUrl",
              "createdAt"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": []
  },
  {
    "name": "get_invoice",
    "description": "Fetch an invoice + its line items + hosted invoice URL (for payment).",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "invoice_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "Invoice ID returned from create_invoice or list_invoices."
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "invoice_id"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "object",
          "properties": {
            "invoice": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "contactId": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "stripeInvoiceId": {
                  "type": "string"
                },
                "stripeAccountId": {
                  "type": "string"
                },
                "stripeCustomerId": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "number": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "draft",
                    "open",
                    "paid",
                    "past_due",
                    "voided",
                    "uncollectible"
                  ]
                },
                "currency": {
                  "type": "string"
                },
                "subtotal": {
                  "type": "number",
                  "minimum": 0
                },
                "tax": {
                  "type": "number",
                  "minimum": 0
                },
                "total": {
                  "type": "number",
                  "minimum": 0
                },
                "amountPaid": {
                  "type": "number",
                  "minimum": 0
                },
                "amountDue": {
                  "type": "number",
                  "minimum": 0
                },
                "dueAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "sentAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "paidAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "voidedAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "hostedInvoiceUrl": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uri"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                }
              },
              "required": [
                "id",
                "contactId",
                "stripeInvoiceId",
                "stripeAccountId",
                "stripeCustomerId",
                "number",
                "status",
                "currency",
                "subtotal",
                "tax",
                "total",
                "amountPaid",
                "amountDue",
                "dueAt",
                "sentAt",
                "paidAt",
                "voidedAt",
                "hostedInvoiceUrl",
                "createdAt"
              ],
              "additionalProperties": false
            },
            "items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string",
                    "format": "uuid",
                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                  },
                  "description": {
                    "type": "string"
                  },
                  "quantity": {
                    "type": "integer",
                    "exclusiveMinimum": 0,
                    "maximum": 9007199254740991
                  },
                  "unitAmount": {
                    "type": "number",
                    "minimum": 0
                  },
                  "amount": {
                    "type": "number",
                    "minimum": 0
                  },
                  "currency": {
                    "type": "string"
                  }
                },
                "required": [
                  "id",
                  "description",
                  "quantity",
                  "unitAmount",
                  "amount",
                  "currency"
                ],
                "additionalProperties": false
              }
            }
          },
          "required": [
            "invoice",
            "items"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": []
  },
  {
    "name": "send_invoice",
    "description": "Dispatch a draft invoice to the contact via Stripe (Stripe emails the invoice + provides a hosted pay page).",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "invoice_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "Invoice to send."
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "invoice_id"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "object",
          "properties": {
            "invoice": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "contactId": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "stripeInvoiceId": {
                  "type": "string"
                },
                "stripeAccountId": {
                  "type": "string"
                },
                "stripeCustomerId": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "number": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "draft",
                    "open",
                    "paid",
                    "past_due",
                    "voided",
                    "uncollectible"
                  ]
                },
                "currency": {
                  "type": "string"
                },
                "subtotal": {
                  "type": "number",
                  "minimum": 0
                },
                "tax": {
                  "type": "number",
                  "minimum": 0
                },
                "total": {
                  "type": "number",
                  "minimum": 0
                },
                "amountPaid": {
                  "type": "number",
                  "minimum": 0
                },
                "amountDue": {
                  "type": "number",
                  "minimum": 0
                },
                "dueAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "sentAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "paidAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "voidedAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "hostedInvoiceUrl": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uri"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                }
              },
              "required": [
                "id",
                "contactId",
                "stripeInvoiceId",
                "stripeAccountId",
                "stripeCustomerId",
                "number",
                "status",
                "currency",
                "subtotal",
                "tax",
                "total",
                "amountPaid",
                "amountDue",
                "dueAt",
                "sentAt",
                "paidAt",
                "voidedAt",
                "hostedInvoiceUrl",
                "createdAt"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "invoice"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": [
      "invoice.sent"
    ]
  },
  {
    "name": "void_invoice",
    "description": "Void an invoice (undo a billing error). Only valid for draft / open invoices; paid invoices must be refunded instead.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "invoice_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "Invoice to void."
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "invoice_id"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "object",
          "properties": {
            "invoice": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "contactId": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "stripeInvoiceId": {
                  "type": "string"
                },
                "stripeAccountId": {
                  "type": "string"
                },
                "stripeCustomerId": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "number": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "draft",
                    "open",
                    "paid",
                    "past_due",
                    "voided",
                    "uncollectible"
                  ]
                },
                "currency": {
                  "type": "string"
                },
                "subtotal": {
                  "type": "number",
                  "minimum": 0
                },
                "tax": {
                  "type": "number",
                  "minimum": 0
                },
                "total": {
                  "type": "number",
                  "minimum": 0
                },
                "amountPaid": {
                  "type": "number",
                  "minimum": 0
                },
                "amountDue": {
                  "type": "number",
                  "minimum": 0
                },
                "dueAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "sentAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "paidAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "voidedAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "hostedInvoiceUrl": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uri"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                }
              },
              "required": [
                "id",
                "contactId",
                "stripeInvoiceId",
                "stripeAccountId",
                "stripeCustomerId",
                "number",
                "status",
                "currency",
                "subtotal",
                "tax",
                "total",
                "amountPaid",
                "amountDue",
                "dueAt",
                "sentAt",
                "paidAt",
                "voidedAt",
                "hostedInvoiceUrl",
                "createdAt"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "invoice"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": [
      "invoice.voided"
    ]
  },
  {
    "name": "create_subscription",
    "description": "Start a recurring subscription for a contact against a Stripe Price id. The Price must already exist in the workspace's Stripe dashboard — v1 does not create Prices through MCP.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "contact_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "CRM contact to subscribe."
        },
        "price_id": {
          "type": "string",
          "description": "Stripe Price id (e.g., 'price_1ABC...') from the workspace's Stripe dashboard."
        },
        "trial_days": {
          "description": "Optional free trial days before first charge.",
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "contact_id",
        "price_id"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "object",
          "properties": {
            "subscription": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "contactId": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "stripeSubscriptionId": {
                  "type": "string"
                },
                "stripeAccountId": {
                  "type": "string"
                },
                "stripeCustomerId": {
                  "type": "string"
                },
                "stripePriceId": {
                  "type": "string"
                },
                "productName": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "trialing",
                    "active",
                    "past_due",
                    "canceled",
                    "incomplete",
                    "incomplete_expired",
                    "unpaid"
                  ]
                },
                "amount": {
                  "type": "number",
                  "minimum": 0
                },
                "currency": {
                  "type": "string"
                },
                "interval": {
                  "type": "string",
                  "enum": [
                    "day",
                    "week",
                    "month",
                    "year"
                  ]
                },
                "intervalCount": {
                  "type": "integer",
                  "exclusiveMinimum": 0,
                  "maximum": 9007199254740991
                },
                "currentPeriodStart": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                },
                "currentPeriodEnd": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                },
                "cancelAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "canceledAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "trialEnd": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                }
              },
              "required": [
                "id",
                "contactId",
                "stripeSubscriptionId",
                "stripeAccountId",
                "stripeCustomerId",
                "stripePriceId",
                "productName",
                "status",
                "amount",
                "currency",
                "interval",
                "intervalCount",
                "currentPeriodStart",
                "currentPeriodEnd",
                "cancelAt",
                "canceledAt",
                "trialEnd",
                "createdAt"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "subscription"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": [
      "subscription.created"
    ]
  },
  {
    "name": "list_subscriptions",
    "description": "List workspace subscriptions (active + trialing + past_due + canceled), newest first.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "limit": {
          "description": "Max rows (default 50, max 200).",
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 200
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid",
                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
              },
              "contactId": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "uuid",
                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "stripeSubscriptionId": {
                "type": "string"
              },
              "stripeAccountId": {
                "type": "string"
              },
              "stripeCustomerId": {
                "type": "string"
              },
              "stripePriceId": {
                "type": "string"
              },
              "productName": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "status": {
                "type": "string",
                "enum": [
                  "trialing",
                  "active",
                  "past_due",
                  "canceled",
                  "incomplete",
                  "incomplete_expired",
                  "unpaid"
                ]
              },
              "amount": {
                "type": "number",
                "minimum": 0
              },
              "currency": {
                "type": "string"
              },
              "interval": {
                "type": "string",
                "enum": [
                  "day",
                  "week",
                  "month",
                  "year"
                ]
              },
              "intervalCount": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "maximum": 9007199254740991
              },
              "currentPeriodStart": {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
              },
              "currentPeriodEnd": {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
              },
              "cancelAt": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "canceledAt": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "trialEnd": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "createdAt": {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
              }
            },
            "required": [
              "id",
              "contactId",
              "stripeSubscriptionId",
              "stripeAccountId",
              "stripeCustomerId",
              "stripePriceId",
              "productName",
              "status",
              "amount",
              "currency",
              "interval",
              "intervalCount",
              "currentPeriodStart",
              "currentPeriodEnd",
              "cancelAt",
              "canceledAt",
              "trialEnd",
              "createdAt"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": []
  },
  {
    "name": "cancel_subscription",
    "description": "Cancel a subscription. Default: cancel at period end (contact keeps access until renewal date). Pass immediate=true for an instant termination + prorated refund.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "subscription_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "Subscription to cancel."
        },
        "immediate": {
          "description": "If true, terminate now. Default: cancel at period end.",
          "type": "boolean"
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "subscription_id"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "object",
          "properties": {
            "subscription": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "contactId": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "stripeSubscriptionId": {
                  "type": "string"
                },
                "stripeAccountId": {
                  "type": "string"
                },
                "stripeCustomerId": {
                  "type": "string"
                },
                "stripePriceId": {
                  "type": "string"
                },
                "productName": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "trialing",
                    "active",
                    "past_due",
                    "canceled",
                    "incomplete",
                    "incomplete_expired",
                    "unpaid"
                  ]
                },
                "amount": {
                  "type": "number",
                  "minimum": 0
                },
                "currency": {
                  "type": "string"
                },
                "interval": {
                  "type": "string",
                  "enum": [
                    "day",
                    "week",
                    "month",
                    "year"
                  ]
                },
                "intervalCount": {
                  "type": "integer",
                  "exclusiveMinimum": 0,
                  "maximum": 9007199254740991
                },
                "currentPeriodStart": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                },
                "currentPeriodEnd": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                },
                "cancelAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "canceledAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "trialEnd": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                }
              },
              "required": [
                "id",
                "contactId",
                "stripeSubscriptionId",
                "stripeAccountId",
                "stripeCustomerId",
                "stripePriceId",
                "productName",
                "status",
                "amount",
                "currency",
                "interval",
                "intervalCount",
                "currentPeriodStart",
                "currentPeriodEnd",
                "cancelAt",
                "canceledAt",
                "trialEnd",
                "createdAt"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "subscription"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": [
      "subscription.cancelled"
    ]
  },
  {
    "name": "list_payments",
    "description": "List recent payments (completed + failed + refunded + disputed) across the workspace, newest first.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "limit": {
          "description": "Max rows (default 50, max 200).",
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 200
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid",
                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
              },
              "contactId": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "uuid",
                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "stripePaymentIntentId": {
                "type": "string"
              },
              "stripeChargeId": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "stripeAccountId": {
                "type": "string"
              },
              "amount": {
                "type": "number",
                "minimum": 0
              },
              "currency": {
                "type": "string"
              },
              "status": {
                "type": "string",
                "enum": [
                  "pending",
                  "completed",
                  "failed",
                  "refunded",
                  "partially_refunded",
                  "disputed"
                ]
              },
              "sourceBlock": {
                "type": "string",
                "enum": [
                  "booking",
                  "landing",
                  "manual",
                  "subscription",
                  "invoice"
                ]
              },
              "refundedAmount": {
                "type": "number",
                "minimum": 0
              },
              "refundedAt": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "disputedAt": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "stripeDisputeId": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "createdAt": {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
              }
            },
            "required": [
              "id",
              "contactId",
              "stripePaymentIntentId",
              "stripeChargeId",
              "stripeAccountId",
              "amount",
              "currency",
              "status",
              "sourceBlock",
              "refundedAmount",
              "refundedAt",
              "disputedAt",
              "stripeDisputeId",
              "createdAt"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": []
  },
  {
    "name": "get_payment",
    "description": "Fetch a single payment record with status + refund/dispute state.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "payment_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "Payment ID from list_payments."
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "payment_id"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            },
            "contactId": {
              "anyOf": [
                {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                {
                  "type": "null"
                }
              ]
            },
            "stripePaymentIntentId": {
              "type": "string"
            },
            "stripeChargeId": {
              "anyOf": [
                {
                  "type": "string"
                },
                {
                  "type": "null"
                }
              ]
            },
            "stripeAccountId": {
              "type": "string"
            },
            "amount": {
              "type": "number",
              "minimum": 0
            },
            "currency": {
              "type": "string"
            },
            "status": {
              "type": "string",
              "enum": [
                "pending",
                "completed",
                "failed",
                "refunded",
                "partially_refunded",
                "disputed"
              ]
            },
            "sourceBlock": {
              "type": "string",
              "enum": [
                "booking",
                "landing",
                "manual",
                "subscription",
                "invoice"
              ]
            },
            "refundedAmount": {
              "type": "number",
              "minimum": 0
            },
            "refundedAt": {
              "anyOf": [
                {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                },
                {
                  "type": "null"
                }
              ]
            },
            "disputedAt": {
              "anyOf": [
                {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                },
                {
                  "type": "null"
                }
              ]
            },
            "stripeDisputeId": {
              "anyOf": [
                {
                  "type": "string"
                },
                {
                  "type": "null"
                }
              ]
            },
            "createdAt": {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
            }
          },
          "required": [
            "id",
            "contactId",
            "stripePaymentIntentId",
            "stripeChargeId",
            "stripeAccountId",
            "amount",
            "currency",
            "status",
            "sourceBlock",
            "refundedAmount",
            "refundedAt",
            "disputedAt",
            "stripeDisputeId",
            "createdAt"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": []
  },
  {
    "name": "refund_payment",
    "description": "Refund a payment. Omit amount to refund the full payment; pass amount for a partial refund. reason should be 'duplicate' | 'fraudulent' | 'requested_by_customer'.",
    "args": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "payment_id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
          "description": "Payment to refund."
        },
        "amount": {
          "description": "Optional partial-refund amount in the payment's currency. Omit to refund in full.",
          "type": "number",
          "exclusiveMinimum": 0
        },
        "reason": {
          "description": "Default: requested_by_customer.",
          "type": "string",
          "enum": [
            "duplicate",
            "fraudulent",
            "requested_by_customer"
          ]
        },
        "workspace_id": {
          "description": "Optional. Falls back to the active workspace.",
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "payment_id"
      ],
      "additionalProperties": false
    },
    "returns": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "data": {
          "type": "object",
          "properties": {
            "payment": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "contactId": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "stripePaymentIntentId": {
                  "type": "string"
                },
                "stripeChargeId": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "stripeAccountId": {
                  "type": "string"
                },
                "amount": {
                  "type": "number",
                  "minimum": 0
                },
                "currency": {
                  "type": "string"
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "pending",
                    "completed",
                    "failed",
                    "refunded",
                    "partially_refunded",
                    "disputed"
                  ]
                },
                "sourceBlock": {
                  "type": "string",
                  "enum": [
                    "booking",
                    "landing",
                    "manual",
                    "subscription",
                    "invoice"
                  ]
                },
                "refundedAmount": {
                  "type": "number",
                  "minimum": 0
                },
                "refundedAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "disputedAt": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "date-time",
                      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "stripeDisputeId": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$"
                }
              },
              "required": [
                "id",
                "contactId",
                "stripePaymentIntentId",
                "stripeChargeId",
                "stripeAccountId",
                "amount",
                "currency",
                "status",
                "sourceBlock",
                "refundedAmount",
                "refundedAt",
                "disputedAt",
                "stripeDisputeId",
                "createdAt"
              ],
              "additionalProperties": false
            },
            "refundedAmount": {
              "type": "number",
              "minimum": 0
            }
          },
          "required": [
            "payment",
            "refundedAmount"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "data"
      ],
      "additionalProperties": false
    },
    "emits": [
      "payment.refunded"
    ]
  }
]
<!-- TOOLS:END -->

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

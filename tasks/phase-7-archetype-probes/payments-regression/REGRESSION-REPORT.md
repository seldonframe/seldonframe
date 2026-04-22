# 2b.2 Payments block regression report — 9 live probes

**Date:** 2026-04-22
**Block migrated:** `payments` (block 4 of 6 in 2b.2, after Booking + Email + SMS)
**Probe model:** `claude-opus-4-7`
**Runs captured:** `speed-to-lead.run{1,2,3}.json` / `win-back.run{1,2,3}.json` / `review-requester.run{1,2,3}.json`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | Post-SMS baseline | Δ vs post-SMS | Determinism | Validator issues |
|---|---|---|---|---|---|---|---|---|
| **speed-to-lead** | PASS $0.0778 | PASS $0.0758 | PASS $0.0763 | **$0.0766** | $0.0757 | **+1.2%** | 3/3 identical `735f9299ff111080` (same as post-SMS) | 0 / 0 / 0 |
| **win-back** 🔑 | PASS $0.0841 | PASS $0.0845 | PASS $0.0844 | **$0.0843** | $0.0836 | **+0.8%** | 3/3 identical `72ea1438d6c4a691` (same as post-SMS) | 0 / 0 / 0 |
| **review-requester** | PASS $0.0700 | PASS $0.0699 | PASS $0.0701 | **$0.0700** | $0.0694 | **+0.9%** | 3/3 identical `4464ec782dfd7bad` (same as post-SMS) | 0 / 0 / 0 |

🔑 = archetype that exercises the validator's showcase test case
(Win-Back threads `{{coupon.code}}` through multiple steps — see
Gate-Coupon below).

All 9 validator checks run via `pnpm test:unit` under the
`2b.2 Payments regression — 9 live-probe outputs validate clean`
describe block in `packages/crm/tests/unit/validator.spec.ts`. Zero
audit-critical issues across the full set.

Hashes are computed by `scripts/phase-7-spike/structural-hash.mjs`
(new this migration): it canonicalizes the spec by stripping NL copy
(initial_message / body / subject / exit_when / arg values) and
hashing the structural skeleton (step ids + types + tool names +
captures + extract keys + next pointers + trigger shape + variable
keys + conversation channel + on_exit structure + wait seconds).
Running the same hash on `pr3-regression/`, `booking-regression/`,
`email-regression/`, `sms-regression/` produces identical values —
confirming 4 consecutive v2 migrations with zero structural shift.

## Red flags per 2b.2 directive + Payments-specific — all clear

| Red flag | Status |
|---|---|
| Cost regression >20% on any archetype | No — worst delta is +1.2% (speed-to-lead). |
| Determinism drops below 3/3 structurally identical | No — 3/3 identical within each archetype. |
| **Structural hash shifts vs post-SMS baseline** | **No — all 3 hashes match post-SMS exactly, AND match post-Email, post-Booking, PR 3. Four consecutive v2 migrations with zero shift.** |
| **Win-Back cost regression >20% (coupon capture threading)** | **No — Win-Back +0.8%.** The archetype that stresses the validator's showcase test case is the least-disturbed of the three. |
| **Win-Back determinism drop** | **No — 3/3 identical `72ea1438d6c4a691`.** |
| **Hash shift on Win-Back specifically** | **No.** create_coupon's return shape preserved `code: z.string()` at the top level of `data`; Win-Back's 6 `{{coupon.*}}` references (body, metadata.couponId, metadata.promotionCodeId, metadata.code, email body, sms body) all resolve exactly as before. |
| Validator false positive on known-good archetype | No — 0 critical issues across 9 runs. |
| Tool signature changes required | No — runtime `skills/mcp-server/src/tools.js` unchanged; `payments.tools.ts` is new Zod authoring of the 12 Payments tools. |
| **Stripe types require lib/agents/types.ts extension** | **No.** ConversationExit, Predicate, ExtractField, Step — all unchanged through 4 migrations. Stripe-complexity containment held: all Stripe-specific type machinery (InvoiceRecord, SubscriptionRecord, PaymentRecord, couponDuration, refundReason, sourceBlock, etc.) lives in `payments.tools.ts`, not in shared types. |

## Gate-by-gate analysis

### Gate 1: deterministic output across 3 runs each
**PASS.** Structural hashes match across runs per archetype AND match post-SMS, post-Email, post-Booking, PR 3 baselines.

### Gate 2: total cost per synthesis <$0.10 average
**PASS.** All three archetypes under $0.10, within ±1.2% of post-SMS baseline. Slight uptick consistent with the v2 Payments contract being the largest block (12 tools, 424 LOC of Zod → 12 JSON Schemas in BLOCK.md); still well under the <$0.10 ship bar with headroom.

### Gate 3: PR 2 validator flags zero false positives
**PASS.** All 9 filled specs pass validation with zero audit-critical issues.

### Gate 4: validator catches injected errors (sanity)
**PASS.** Inherited from PR 3 — 2 broken fixtures still surface expected issue codes.

### Gate 5: `pnpm emit:blocks:check` shows no drift
**PASS.** After Payments migration, all five v2 blocks (CRM, Booking, Email, SMS, Payments) round-trip cleanly.

### Gate-Coupon (Payments-specific)

The validator's namesake test case is "catches `{{coupon.couponCode}}`
typo when `create_coupon` returns `{data:{code,...}}`". This test
depends on `code` being a top-level field of `data` in the
create_coupon return shape. The 2b.1 validator.spec.ts integration
test used a stub that pinned this shape; the Payments migration
replaced the stub with the real Zod schema in `payments.tools.ts`.

**Stub vs real — zero drift:**

Stub shape (pre-migration):
```ts
z.object({ data: z.object({ couponId: z.string(), promotionCodeId: z.string(), code: z.string() }) })
```

Real shape (post-migration, `payments.tools.ts:206`):
```ts
z.object({
  data: z.object({
    couponId: z.string().describe("Stripe coupon id (cpn_...)."),
    promotionCodeId: z.string().describe("Stripe promotion code id ..."),
    code: z.string().describe("The redeemable code string ..."),
  }),
})
```

Same keys, same types, same nullability, same structural depth.
Only additions: `.describe()` hints on each field (pure metadata,
not shape-affecting). The validator's capture-shape walker unwraps
`data` and then checks each `{{coupon.<field>}}` reference against
the three keys — identical behavior before and after.

**Win-Back live output confirms the chain works end-to-end:**

`win-back.run1.json` threads the captured coupon into:
1. `log_winback_initiated.args.body`: `"Created unique coupon code {{coupon.code}}..."`
2. `log_winback_initiated.args.metadata.{couponId, promotionCodeId, code}`: all three fields
3. `send_winback_email.args.body`: `"...{{coupon.code}}..."`
4. `send_winback_sms.args.body`: `"...{{coupon.code}}..."`
5. `log_winback_followup_sent.args.body`: `"Delivered email + SMS with coupon {{coupon.code}}..."`
6. `log_winback_followup_sent.args.metadata.{couponId, code}`

6 `{{coupon.*}}` references, all resolve cleanly, all pass the
validator with zero issues. The return-shape preservation is
verified by real synthesis, not just unit test.

### Stripe-complexity containment

Per Max's Payments directive: "If shared types need extension, the
abstraction is wrong."

**Held.** `lib/agents/types.ts` unchanged through Payments migration.
All Stripe-specific machinery local to `payments.tools.ts`:

- 6 Stripe-specific enums (paymentStatus, invoiceStatus, subscriptionStatus, subscriptionInterval, refundReason, couponDuration)
- 4 Stripe-specific record shapes (InvoiceRecord, InvoiceItemRecord, SubscriptionRecord, PaymentRecord)
- 1 internal-specific enum (sourceBlock: booking|landing|manual|subscription|invoice)
- Webhook-driven event superset: block.produces ⊃ Σ tool.emits (handled by validator enforcing `emits ⊆ produces` one-way)

The shared Step / ConversationExit / Predicate / ExtractField types
absorbed zero Stripe-specific concerns. Proves the abstraction is
correctly placed — the hard part (complexity) stays inside the
block's tool definitions, not in the compositional core.

## Pattern confirmed for remaining 2b.2 blocks

Four consecutive v2 migrations with zero regression signals:

- **Booking (block 1/6):** cost ±0.4%, hashes unchanged
- **Email (block 2/6):** cost ±1.0%, hashes unchanged
- **SMS (block 3/6):** cost ±0.9%, hashes unchanged
- **Payments (block 4/6):** cost ±1.2%, hashes unchanged — despite
  being the largest + most complex block. No shared-type change. No
  validator false positive. No coupon-threading regression.

Remaining 2 blocks (Intake, Landing) are strictly smaller + simpler
than Payments. The v2 shape is now empirically proven Pareto-neutral
for Claude synthesis across every archetype gate.

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`
- Hash utility: `scripts/phase-7-spike/structural-hash.mjs` (new)

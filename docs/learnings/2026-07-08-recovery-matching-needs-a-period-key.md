# 2026-07-08 — Cross-record "recovery" matching needs a period key, not just an entity key

## The problem, in one line
In the retainer billing rail (packages/crm/src/lib/payments/retainer.ts), a successful month-2
Stripe invoice stamped `resolvedByLaterPayment` on a genuinely-unpaid month-1 failed row — the
sibling-recovery lookup matched on subscription id alone, so ANY later success silently killed the
dunning signal for ANY earlier uncollected failure.

## The approach
1. Name the two keys. The buggy predicate had only the ENTITY key (subscription id). Recovery
   semantics ("this success resolves that failure") also need a PERIOD key (which billing cycle the
   money was for). Stripe carries it on every invoice: `period_start` / `period_end` (unix seconds).
2. Thread the period through the existing layers instead of re-querying: the pure decision
   (`decideRetainerCycleFromInvoiceEvent`) extracts it from the event; the apply layer stamps it
   into `payment_records.metadata` at write time; the recovery check reads it back from the stored
   sibling row. No new Stripe calls, no schema migration — metadata jsonb.
3. Move the money-semantic OUT of the DB query and INTO the DI'd apply layer: the query dep now
   returns ALL outstanding failed candidates (a dumb fetch, newest first) and
   `applyRetainerInvoiceCycle` picks the first candidate passing the period predicate. This is what
   made the behavior unit-testable through the existing DI fakes AND made "pick the same-period
   sibling over the prior-period one" work when both are outstanding.
4. Get the boundary right: "strictly prior period" = `sibling.periodEnd <= paid.periodStart`, with
   `<=` not `<`, because contiguous months share the boundary instant (month 1's end IS month 2's
   start). An exact-equality match on period_start would have been wrong the other way — a
   replacement invoice issued days into the cycle can have a shifted start, so overlap-tolerant
   comparison, not equality.
5. TDD end-to-end: 8 new tests written first and watched fail (next-period paid must NOT stamp a
   prior-period failed row; same-period sibling still does; same-period picked over prior when both
   outstanding; legacy row without the stamp; degenerate invoice without periods; period fields on
   the decision; period stamp in metadata for both statuses).

## Judgment calls
- **Fail OPEN when period info is missing** (legacy rows written before the stamp existed, or a
  degenerate Stripe shape without `period_start`): resolve the sibling as before. Reasoning: the
  narrowing's failure mode (losing the "never collected" signal) is notify-only — status stays
  "failed", revenue rollup unaffected — while the fail-closed failure mode is dunning a client who
  ALREADY PAID, which violates never-lies outward. Also the legacy window predates launch, so it is
  effectively empty. Direction of fail-safe was chosen by comparing blast radii, not by reflex.
- **Did NOT touch the same-invoice-id recovery path** (the dominant case: Stripe re-fires
  `invoice.paid` for the same invoice id). It was already correctly narrow — the review directive
  explicitly fenced it off, and the diff honored the fence.
- **Did NOT stamp ALL matching siblings**, only the first same-or-newer candidate — preserving the
  old one-stamp semantics. Multiple simultaneous new-invoice-id failures for one cycle are rare
  (Stripe normally retries the same invoice); widening was Kitchen Sink territory.
- **Did NOT use the subscription's `latest_invoice`** (the review's alternate suggestion) — that
  would have added a Stripe API call to a deliberately DB-only, fail-soft webhook bookkeeping path.

## The reusable rule, one line
When a "later success resolves an earlier failure" match exists, the predicate needs BOTH an entity
key and a period/generation key — entity-only matching lets any later success erase any earlier
failure's signal; and when data for the comparison can be absent, pick the fail-direction by
comparing the two blast radii explicitly.

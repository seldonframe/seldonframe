# Follow-up: subscription observability polish

**Context:** Deferred from SLICE 1 PR 2 (C5) due to the 2,600 LOC
stop-and-reassess trigger firing mid-PR (2026-04-23). C5 shipped a
lean read-only list view per the mini-trigger discipline. The
richer operator surface defined in the SLICE 1 audit §7.1.1 is
captured here for a follow-up pickup between slices.

## Deferred scope

### Admin actions on dead-lettered deliveries
- **Retry button** — resets the delivery row: `status='pending'`,
  `attempt=1`, `nextAttemptAt=now()`, `claimedAt=null`,
  `lastError=null`. Audit §4.8 behavior.
- **Dismiss button** — logical-delete (add `dismissed_at` column OR
  reuse `status='dead'` with a separate `dismissed_at` timestamp;
  decide at implementation time). Audit §4.8 "archived for 30
  days, then hard-deleted" — pair with a retention cleanup cron.

### Filter controls
- **Status filter** — multi-select: delivered / failed / filtered /
  dead.
- **Date range filter** — last 1h / 24h / 7d / custom.
- **Subscription filter** — pick one subscription to scope the view.

### Per-subscription drawer
- Click a subscription row → side drawer opens with:
  - Full config: handler name, idempotency template, filter
    predicate (JSON), retry policy, active/dormant status
  - Full delivery history (paginated, newest first)
  - Time-series chart: deliveries per hour over last 7d
  - Delivery detail panel when clicking a row in history

### Other
- **CSV export** of the delivery history for a subscription (audit
  §7.4 deferred item that'd naturally land with this polish).

## Estimate

- 1 day wall-clock (roughly one full focus session)
- 300-500 LOC:
  - Admin endpoints: `/api/v1/subscriptions/[id]/retry-dead` +
    `/dismiss-dead` (~80 LOC)
  - Drawer client component with polling (~200 LOC)
  - Filter controls (~80 LOC)
  - Chart component (Recharts already in the dep tree) (~80 LOC)

## Priority

**Nice-to-have.** The lean C5 list view lets operators see:
- which subscriptions exist and their active/dormant state
- 24h + 7d delivery counts + success rate
- latest 5 failures per subscription with error previews

That covers the "is it working?" + "what's broken?" bar. The
deferred items are "can I fix it without SQL?" — useful, but the
platform is functional without them (SQL via Neon console + manual
DB update works for the "oh no we hit a dead-letter" case at v1
scale).

**Pickup window:** between SLICE 1 and SLICE 2, or opportunistically
if someone touches the `/agents/runs` page for another reason.

## Related discipline

- L-17 calibration: this follow-up is a classic "architectural
  work runs long" example — the core primitive shipped, the polish
  deferred.
- L-22: capture-explicitly-in-follow-up-ticket rather than
  TODO-in-code. This doc is the capture.

# workflow_event_log health check

**Purpose:** verify the SLICE 1-a event-log coverage guarantee
holds in production — every `emitSeldonEvent` call persists a row
to `workflow_event_log`.

**Context:** before SLICE 1-a (pre-2026-04-22), 0 of 68 emission
sites threaded `orgId` and the table received zero writes. Option 1
of G-1a-1 made `orgId` a required parameter; TypeScript enforces
coverage at compile time. This query is the runtime complement —
verifies log writes land after deploy.

## Post-deploy health-check

Run once after the SLICE 1-a deploy reaches production and once
weekly thereafter.

```sql
-- Row count by event type over the last 24 hours.
-- Expect non-zero counts for actively-used event types:
-- contact.created, booking.created, form.submitted, email.sent, etc.
SELECT
  event_type,
  COUNT(*) AS rows_24h
FROM workflow_event_log
WHERE emitted_at >= NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY rows_24h DESC;
```

**Expected behavior post-SLICE-1-a:** rows per event type scale
with workspace activity. If a row count is 0 for an event type
that's definitely being emitted (e.g., builders report bookings
created but `booking.created` shows 0), that's signal of a
regression — likely a new emission site added without threading
`orgId` (which TypeScript should have blocked — escalate to
investigation).

## Per-workspace coverage spot-check

Pick an active workspace and verify its recent activity landed:

```sql
SELECT
  event_type,
  emitted_at,
  payload->>'contactId' AS contact_id
FROM workflow_event_log
WHERE org_id = '<workspace-uuid>'
  AND emitted_at >= NOW() - INTERVAL '1 hour'
ORDER BY emitted_at DESC
LIMIT 20;
```

Cross-reference with the workspace's observed activity in the
admin UI or CRM. Events visible in the UI should appear in this
query.

## Retention-window check

SLICE 1 subscriptions depend on 90-day retention (aligned with
G-3 await_event timeout ceiling). Verify oldest rows haven't aged
out prematurely:

```sql
SELECT
  MIN(emitted_at) AS oldest_row,
  MAX(emitted_at) AS newest_row,
  COUNT(*) AS total_rows,
  NOW() - MIN(emitted_at) AS oldest_age
FROM workflow_event_log;
```

Expected: `oldest_age` ≤ 90 days (or shorter if table is recent).

## Future retention cleanup (not in SLICE 1-a scope)

A cleanup job that prunes rows older than 90 days is a post-
SLICE-1-a concern (will land alongside SLICE 1 PR 2's subscription
cron tick or as its own slice). Until then, the table grows
unbounded; run the retention-window check monthly and manually
delete old rows if storage becomes a concern.

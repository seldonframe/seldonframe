# n8n Templates + Submission Docs — Build Report (2026-07-13)

## Files created

- `docs/strategy/n8n-templates/speed-to-lead-sms.json`
- `docs/strategy/n8n-templates/lead-to-agent-reply.json`
- `docs/strategy/n8n-templates/sheets-row-to-email.json`
- `docs/strategy/n8n-templates/booking-intake-to-sf.json`
- `docs/strategy/n8n-templates/daily-conversation-digest.json`
- `docs/strategy/n8n-templates/README.md`
- `docs/strategy/n8n-templates/SUBMISSION.md`
- `reports/2026-07-13-n8n-templates-report.md` (this file)

## JSON validation

Ran `node -e "JSON.parse(...)"` against each of the 5 workflow JSON files plus
a structural check (has a trigger-type node, has an
`n8n-nodes-base.httpRequest` node pointed at an SF endpoint, has a non-empty
`connections` map). Result:

```
speed-to-lead-sms.json OK nodes=2 trigger=true http=true connKeys=1
lead-to-agent-reply.json OK nodes=3 trigger=true http=true connKeys=2
sheets-row-to-email.json OK nodes=3 trigger=true http=true connKeys=2
booking-intake-to-sf.json OK nodes=3 trigger=true http=true connKeys=2
daily-conversation-digest.json OK nodes=4 trigger=true http=true connKeys=3
```

5/5 parse OK, 5/5 have a trigger + SF httpRequest node + full connections map.

## Per-template notes

1. **speed-to-lead-sms.json** — Webhook → `POST /api/v1/sms` with
   `x-org-id`/`x-api-key` headers via `$env`. Straightforward, matches the
   spec's auth model exactly.
2. **lead-to-agent-reply.json** — Webhook → `POST /api/v1/public/agent/{slug}/turn`
   (no auth headers, per spec — anonymous, org resolved via slug) →
   `respondToWebhook`. The webhook's `responseMode` is set to `responseNode`
   so the Respond node actually fires the HTTP response back to the caller.
3. **sheets-row-to-email.json** — Schedule (15 min) → Google Sheets read →
   `POST /api/v1/emails`. Kept the Sheets node parameters minimal (documentId
   + sheetName via `$env`, resource `sheet`/operation `read`) since the
   full Sheets node parameter surface (filters, ranges, dedup markers) is
   large and instance-specific; documented in both the node's own `notes`
   field and the README that a Filter/marker-column step should be added by
   the installer to avoid re-sending the same rows every 15 minutes. This was
   the one template where "keep it minimal + documented" from the brief was
   explicitly invoked.
4. **booking-intake-to-sf.json** — Webhook → Set (field mapping) →
   `POST /api/v1/public/bookings` (no auth, org from host, per spec). I was
   **unsure of the exact accepted field set** for `/api/v1/public/bookings`
   beyond what's given in the task brief (no field list was provided) — I
   mapped a conservative, generic set (`name`, `email`, `phone`, `notes`,
   `requested_time`) and added an explicit in-file `notes` annotation plus a
   README callout telling the installer to confirm the exact booking field
   set against their own SF booking form before relying on additional
   fields. This is the one open unknown worth flagging back.
5. **daily-conversation-digest.json** — Schedule (daily 08:00, cron
   `0 8 * * *`) → `GET /api/v1/agents` → Code node formats a digest (defensive
   parsing: tries `.agents`, `.data`, or a raw array, and falls back to
   `n/a`/empty-state text if the shape doesn't match any of those, since the
   exact response shape of `GET /api/v1/agents` wasn't given in the spec) →
   HTTP POST to a Slack incoming-webhook URL via `$env.SF_SLACK_WEBHOOK_URL`
   (used generic HTTP over the native Slack node per the brief's "or a
   generic HTTP to a Slack webhook URL via $env" option, to avoid requiring a
   Slack OAuth credential in the template). README states the polling
   pattern honestly per the "no outbound webhooks" constraint.

## Uncertain items (flagging, not guessing silently)

- Exact JSON body field names for `GET /api/v1/agents`'s response (used for
  the digest's Code-node parsing) and the full accepted field list for
  `POST /api/v1/public/bookings` were not in the provided endpoint spec. Both
  are handled defensively (fallback parsing / conservative field set) and
  called out in-file and in the README rather than invented as fact.
- n8n's current verified-community-node requirements and creator-program
  terms (in SUBMISSION.md) are stated as "as of this writing" — these are
  the kind of program terms that change, and should be re-confirmed against
  n8n's live docs before actually starting the `n8n-nodes-seldonframe`
  build.

## Not done (correctly out of scope)

No `pnpm`/build/test commands were run — these are content artifacts (JSON +
Markdown) per the task. No live n8n instance was available in this
environment, so none of the templates were import-tested end-to-end; the
README and this report both state that plainly as an open pre-submission
step (never-lies).

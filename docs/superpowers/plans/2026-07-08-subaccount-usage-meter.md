# Per-Sub-Account Usage Meter — build plan (2026-07-08)

Spec: `docs/superpowers/specs/2026-07-08-subaccount-usage-meter-design.md` (read first).
Worktree: `.claude/worktrees/usage-meter`, branch `feature/usage-meter` (off main
@ 6eb789a0c — includes the shipped pricing ladder: subaccount-count.ts,
resolveRuntimeAiClient, the flags). TDD per task, commit-per-task, diff-only
edits. NO migration. NEVER edit `lib/build/wallet-store.ts` (read-only import),
the voice webhook, messaging/**, bookings/**, lib/sms/**, or the stripe
checkout/webhook files.

## Files touched (complete list — nothing outside it)

- `packages/crm/src/lib/billing/usage-rollup.ts` (new)
- `packages/crm/src/lib/billing/usage-cap.ts` (new)
- `packages/crm/src/lib/billing/subaccount-count.ts` (import/reuse only — extend ONLY if a shared org-set helper needs exporting)
- the agency client-cards surface (locate: the page/components fed by `fetchAgencyAttachedWorkspaceIds` / the deployments client cards under /studio/clients — grep first, name it in your report) + its data loader
- one cap-editor + usage-line component file (new, colocated with the client card, following the BookingPolicyEditor collapsible pattern)
- `packages/crm/src/lib/deployments/actions.ts` OR a new colocated action file for `setSubAccountUsageCapAction` (follow the existing org-scoped action pattern)
- `packages/crm/src/app/api/cron/usage-caps/route.ts` (new; CRON_SECRET fail-closed guard — copy the blob-GC cron shape) + the vercel.json/crons registration
- `packages/crm/src/lib/ai/client.ts` (the `capped` branch in resolveRuntimeAiClient)
- `packages/crm/src/lib/agents/runtime.ts` (the capped holding-reply fallback — smallest possible insertion)
- notification: reuse the existing ops-notification email rail (locate `sendNewLeadAlert` in ops-notifications; add a sibling `sendUsageCapAlert`)
- Tests (new): `tests/unit/billing/usage-rollup.spec.ts`, `tests/unit/billing/usage-cap.spec.ts`, `tests/unit/ai/resolve-runtime-client-capped.spec.ts` (+ extend the existing resolve-runtime-client spec if cleaner)

## Task 1 — the rollup

Test first (`usage-rollup.spec.ts`, DI fakes): `currentPeriodStartUtc(now)`
(calendar-month UTC boundaries incl. year rollover); `getAgencyUsageRollup`
maps a grouped result set to per-org `{conversations, tokensIn, tokensOut,
estCostCents}` + totals; empty sub-account set → empty rollup; the org set
comes from the SAME counted-sub-account rule as the cap (reuse the
subaccount-count helpers — owner-owned excluded; do NOT reimplement).
Implementation: ONE `GROUP BY org_id` select over `agentConversations`
(`orgId IN (...) AND startedAt >= periodStart`). Voice: read-only sum of
`wallet_transactions` rows for those orgs in-period where
`idempotency_key LIKE 'voice:%'` → "metered voice spend" in cents (if the
ledger rows carry seconds/duration metadata, also surface minutes; check,
don't assume — report what you found). Injectable db deps throughout.
Commit: `feat(billing): per-sub-account usage rollup`.

## Task 2 — the panel

Locate the agency client-cards surface (grep `fetchAgencyAttachedWorkspaceIds`
callers + the /studio/clients client-card composition). Add a server-loaded
usage line per client card — `"{N} conversations · {tokens} tokens · ~$X.XX
estimated"` (+ voice spend line when nonzero) — and a totals strip for the
book. Copy rule (spec D2): every cost figure is labeled **estimated** with the
"billed by your provider at their rates" phrasing. Extract the line formatting
into a pure `formatUsageLine()` in usage-rollup.ts and PIN the wording with a
unit test (including the word "estimated"). ONE grouped query for the whole
page — no N+1.
Commit: `feat(agency): usage panel on client sub-account cards`.

## Task 3 — caps + notify

Test first (`usage-cap.spec.ts`): `parseUsageCap(settings)` (tolerant of
absent/malformed → null); `evaluateUsageCap({cap, estCostCents, periodKey})` →
`{breached, shouldNotify}` with once-per-period idempotency via
`lastNotifiedPeriod`; authz: setter rejects a caller who is not the owner of
the sub-account's parentAgencyId agency.
Implementation: cap shape in `organizations.settings.usageCap`
`{ monthlyEstCostCentsCap, mode: "notify"|"pause", lastNotifiedPeriod?,
holdingReply? }` (jsonb — no migration); org-scoped
`setSubAccountUsageCapAction` (agency-owner guard via partner_agencies
ownerUserId/ownerWorkspaceId resolution — same lookup the key inheritance
uses); collapsible cap editor + breach banner on the client card; breach check
on dashboard load AND the new daily cron (`api/cron/usage-caps` — iterate
agencies with caps set, evaluate, `sendUsageCapAlert` once per period,
write back lastNotifiedPeriod; CRON_SECRET fail-closed; ?dryRun=1 supported).
Commit: `feat(billing): sub-account usage caps + once-per-period notify`.

## Task 4 — pause (flag `SF_USAGE_CAP_PAUSE`)

Test first (resolution matrix, DI): own-key sub-account NEVER paused;
inherited-key + cap.mode="pause" + breached + flag on → `capped`; flag off →
never; ANY error in the cap lookup → uncapped (fail-soft, never throw).
executeTurn capped path: agent sends ONE holding reply
(settings.usageCap.holdingReply ?? "Thanks for reaching out — we've noted your
message and will get back to you shortly.") + the turn persists normally +
log event `usage_capped` + fire the T3 notify (respecting once-per-period).
NEVER a silent drop. Voice untouched. Per-request memoize the cap check so a
conversation doesn't re-query per tool call.
Commit: `feat(ai): opt-in usage-cap pause for inherited-key sub-accounts (flagged)`.

## Verify

Named specs fail-0 → the wider billing + ai sweep (use the corrected wide glob
from the pricing-ladder report) → tsc ≤ baseline 23 with 0 in touched files →
use-server clean → `git diff --name-only origin/main..HEAD | grep -E
"wallet-store|voice/openai|messaging/|lib/sms/|bookings/|stripe"` EMPTY →
journal untouched. Write `.superpowers/sdd/usage-meter-report.md` (Files
changed first, verbatim tails, deviations, open risks).

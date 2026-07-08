# Per-Sub-Account Usage Meter — design spec (2026-07-08)

Feature: agencies see (and can cap) each client sub-account's AI usage — the
anti-bill-shock companion to agency-key inheritance, and the prerequisite for
hard launch-window enforcement (which stays OUT of this build).

## 0. Grounded seam map (verified scout recon, pricing-ladder worktree)

- **The data already exists — v1 is a ROLLUP, not new metering.**
  `agentConversations` (db/schema/agents.ts:258-303) carries per-org
  `tokensIn`, `tokensOut`, `llmCostCents`, indexed `(orgId, startedAt)`;
  runtime accumulates them per turn (runtime.ts:696-702). No new write path
  for chat/SMS/email usage.
- **Voice:** metered deployments already debit the wallet on call end
  (voice webhook :474-519 → `meterCallEnd`/`debitVoiceUsage`,
  wallet-store.ts:325-383, idempotency `voice:${callId}`). READ-ONLY reuse:
  voice minutes for the meter come from wallet ledger rows + conversation
  channelMeta where present; the ledger is NEVER touched by this build.
- **Counter/cap precedent:** lib/tier/limits.ts:100-215 —
  `maybeResetUsageCounters` / `assert*Limit` (throw `upgrade_required`) /
  `increment*Usage`; super-admin bypass at :141.
- **Sub-account set:** `fetchAgencyAttachedWorkspaceIds` (orgs.ts:307-334) +
  the pricing-ladder's owner-owned exclusion (subaccount-count.ts).
- **Dashboard:** `listManagedOrganizations` (orgs.ts:415-507) parallel-loads
  `contactCount` per org — the shape a usage panel copies, BUT the rollup
  must be ONE grouped query, not N+1.
- **Enforcement seam:** `resolveRuntimeAiClient` (lib/ai/client.ts, shipped
  flag-gated in the pricing ladder) — the exact place a "paused" resolution
  slots in for inherited-key sub-accounts.
- `seldonUsage` table exists with zero writers — NOT used by this build
  (rollup-first); candidate for a later per-event ledger if billing needs it.

## 1. Decisions

**D1 — Meter = computed rollup over existing data, calendar-month UTC.**
`getAgencyUsageRollup(userId, period)`: resolve the counted sub-account set
(same rule as the cap: parentAgencyId attached, archivedAt NULL, owner-owned
excluded) → ONE `GROUP BY org_id` query over agentConversations
(`startedAt >= periodStart`) returning per-org `{conversations, tokensIn,
tokensOut, estCostCents}` + voice minutes from wallet ledger rows
(`idempotency_key LIKE 'voice:%'`, org-scoped, read-only). No migration, no
counters, no resets — timestamps are the period boundary.

**D2 — Cost is labeled "estimated".** `llmCostCents` uses SF's internal price
table; under BYOK the real bill is the provider's. Copy everywhere:
"estimated AI cost — billed by your provider at their rates."

**D3 — Surface: the agency clients surface + totals.** Each client
sub-account card gets a usage line (`{conversations} convos ·
{tokens} tokens · ~${est}` this month + a voice-minutes line when nonzero);
a totals strip sums the book. Implementer locates the primary agency client
list (the surface fed by fetchAgencyAttachedWorkspaceIds / the deployments
client cards) and adds one server-loaded panel — smallest seam, no new page.

**D4 — Caps live in `organizations.settings.usageCap` (jsonb — no
migration):** `{ monthlyEstCostCentsCap: number, mode: "notify" | "pause",
lastNotifiedPeriod?: string }`, edited by the AGENCY from the client card
(org-scoped action: only the agency owner of the sub-account's
parentAgencyId may set it). Default: unset (no cap).

**D5 — Breach behavior:**
- `notify` (default when a cap is set): on breach, email the agency operator
  (reuse the ops-notifications email rail) once per period
  (`lastNotifiedPeriod` guard) + a banner on the client card.
- `pause` (opt-in per sub-account, flag `SF_USAGE_CAP_PAUSE`): for
  INHERITED-KEY sub-accounts only, `resolveRuntimeAiClient` returns a
  `capped` resolution → executeTurn takes a graceful fallback: the agent
  sends ONE configurable holding reply ("Thanks — we'll get back to you
  shortly") + takes a structured message, logs `usage_capped`, and notifies
  the agency. NEVER a silent drop (never-lies). Sub-accounts with their OWN
  key are never paused (their key, their bill). Voice is untouched in v1
  (separate runtime; metered voice already has wallet gating).
- Breach detection: computed on dashboard load + the existing daily cron
  pattern (one new cron step re-using the blob-GC cron shape) so notify fires
  without anyone visiting the dashboard.

**D6 — Explicitly OUT:** hard launch-window enforcement (separate flip
decision once this ships) · autopay console · seldonUsage event ledger ·
per-agent breakdowns · voice pause.

## 2. Slices (TDD, commit-per-task)

- **T1 rollup + panel:** `lib/billing/usage-rollup.ts` (pure period math +
  injectable query) + grouped SQL + voice-ledger read; usage panel + totals
  on the agency client surface. Tests: rollup with DI fixtures (period
  boundaries, empty set, owner-owned exclusion).
- **T2 caps + notify:** settings.usageCap schema-in-jsonb + org-scoped
  setter action (agency-owner guard) + cap editor on the client card +
  breach check (dashboard load + cron) + once-per-period email. Tests: pure
  breach predicate, notify idempotency, authz (non-owner rejected).
- **T3 pause (flag `SF_USAGE_CAP_PAUSE`):** `capped` branch in
  resolveRuntimeAiClient (inherited-mode only, fail-soft: any error →
  uncapped behavior) + executeTurn holding-reply fallback + `usage_capped`
  log. Tests: DI resolution matrix (own-key never paused; inherited+capped
  paused; flag-off never paused), fallback reply path.

## 3. Regression set (forbidden)

`lib/build/wallet-store.ts` (read-only import OK, zero edits) · voice webhook ·
`messaging/**` · `bookings/**` · `lib/sms/**` · checkout/webhook billing paths
from the pricing ladder. No migration (journal untouched).

## 4. Validation

verify-build six checks + the new spec files; live smoke = agency dashboard
renders the usage panel for a real attached workspace; vision-verify the
client card (grader brief MUST state screenshot coverage).

## 5. Human actions

None at merge (all dark/incremental); flip `SF_USAGE_CAP_PAUSE` whenever —
notify-mode works without it.

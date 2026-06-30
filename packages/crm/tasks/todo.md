# Event-agent: Send test + Activity view

## Part 1 — "Send test" (priority)

- [ ] `src/lib/agents/triggers/test-message.ts` (PURE, no "use server"):
      `composeTestEventAgentMessage({ skill, channel, businessName, contactName, reviewUrl, leadSummary })`
      → wraps composeReviewRequest/composeSpeedToLead, prefixes body with "[TEST] ",
      returns `{ ok:true, subject?, body }` or `{ ok:false, error }` when a review
      skill has no link. Tested in isolation.
- [ ] `src/lib/agents/triggers/actions.ts` ("use server", async-only exports):
      `sendTestEventAgentAction({ agentTemplateId, deploymentId?, toPhone?, toEmail? })`
      → assertWritable → getOrgId → getAgentTemplate (ownership) → resolveAgentTrigger
      → must be kind:"event" (else error) → resolve skill (skillForEvent) → resolve
      review link (deployment-wins via resolveReviewUrl + loadDeploymentCustomization…)
      → compose via the pure helper → send NOW via sendSmsFromApi / sendEmailFromApi
      (metadata.source = "agent:<skill>:test", userId:null) → BYPASS throttle/guardrails/
      verify → return `{ ok:true, to, preview }` | `{ ok:false, error }`.
      DI seam for the send + lookups so the guard logic is testable.
- [ ] UI: a "Send test" card in `editor-client.tsx`, OUTBOUND (kind==="event") only —
      phone input (default empty) + button → calls the action → inline sent/error.

## Part 2 — Event-agent activity view

- [ ] `src/lib/agents/triggers/activity.ts` (PURE):
      `summarizeEventAgentActivity({ sends, scheduled })` → merges
        • sends    (smsMessages/emails rows tagged metadata.source ~ "agent:%")
        • scheduled(event_agent_scheduled_sends rows: pending→scheduled, failed→blocked,
                    sent→sent, skipped→skipped)
      into one list of `{ when, skill, channel, contactLabel, outcome, detail }`,
      newest-first. Tested.
- [ ] `src/lib/agents/triggers/activity-store.ts` (DB-backed loaders, lazy import db):
      `loadEventAgentActivityForOrg(orgId, limit)` → query both tagged-send tables +
      scheduled-sends, join contact name, return the raw rows the pure summarizer folds.
- [ ] Page `src/app/(dashboard)/studio/agents/activity/page.tsx` (server, org-scoped,
      read-only) + add an "Activity" tab to StudioTabs.

## Tests
- [ ] `tests/unit/agents/triggers/test-message.spec.ts` — review w/ link → body has
      link + "[TEST] "; review w/o link → `ok:false`; speed-to-lead → ack text + "[TEST] ".
- [ ] `tests/unit/agents/triggers/sendTestEventAgentAction` guard via DI — missing
      review link surfaces the error; non-event template rejected; happy path sends once.
- [ ] `tests/unit/agents/triggers/activity.spec.ts` — folds sends+scheduled, maps
      outcomes, sorts newest-first.

## Verify (re-run, report counts)
- [x] `node --import tsx --test tests/unit/agents/**/*.spec.ts` → 769 pass / 0 fail
      (new specs: test-message 5, send-test-action 9, activity 8 = +22)
- [x] `pnpm typecheck` → 0 errors
- [x] `bash scripts/check-use-server.sh src` → clean
- [x] `pnpm build` → exit 0 (/studio/agents/activity compiled as ƒ route)

## Review
- Part 1: pure `composeTestEventAgentMessage` + DI'd `sendTestEventAgentAction`
  ("use server", async-only) + `SendTestCard` (editor, event-agents only).
  Bypasses throttle/guardrails/verify; keeps the review-link guard. Tag
  `agent:<skill>:test` (the live throttle probes `agent:<skill>` exactly → a test
  never trips it).
- Part 2: pure `summarizeEventAgentActivity` + `activity-store.ts` loaders +
  `/studio/agents/activity` page + Activity tab. Sources = tagged sends
  (smsMessages/emails) + event_agent_scheduled_sends (pending→scheduled,
  failed→blocked, sent→sent, skipped→skipped). Brain verify_blocked notes NOT
  queried (the scheduled-sends 'failed' rows already surface gate blocks for the
  delayed path; immediate-path blocks live only in Brain — noted as a follow-up).

---

# P0 — SeldonFrame for Builders: SKILL.md + MCP build/list tools (spec 1ff09dcb)

## Task-1 AUDIT (done) — HAVE vs GAP
- **MCP auth (the mechanism):** the SeldonFrame MCP server is an EXTERNAL package that calls this app's REST API under `src/app/api/v1/*`. Every data/build call is gated by `guardApiRequest` (`src/lib/api/guard.ts`), which accepts TWO modes: (1) **workspace bearer** `Authorization: Bearer wst_…` minted by `mintWorkspaceToken` (`src/lib/auth/workspace-token.ts`), SHA-256 hashed in `api_keys` (kind='workspace'); (2) legacy `x-org-id` + `x-api-key` (kind='user'). The bearer encodes the orgId → org-scoping is automatic. THIS is the "developer API key" for the IDE.
- **HAVE (build/list tools, via `/api/v1/agents` op-dispatch):** create / update_blueprint / publish / list / run_evals / get_metrics / tail / get_conversation / replay. Marketplace: `POST /api/v1/marketplace/listings` (create) + `…/[listingId]/publish`. Pricing columns on `marketplace_listings` (price_model/monthly_price_cents/per_call_price_cents/per_outcome_price_cents/outcome_type). `computeListingEarnings` + `normalizePricingForPersist` (pure, the exact projection set_usage_price needs).
- **GAP:** (a) no public SKILL.md route; (b) no user-facing key issue/reveal/revoke surface (mintWorkspaceToken is the primitive but no /build panel); (c) no `set_usage_price` write path; (d) no builder `list_my_listings` + earnings read endpoint.

## Plan
- [ ] T2: PURE `buildSkillMd()` + spec → route `app/SKILL.md/route.ts` (text/markdown) + `seldonframe.com/SKILL.md` covered (same host; env override). Commit.
- [ ] T3: developer-key issue/reveal-once/revoke — pure `formatDeveloperKeyName`/redaction helpers (TDD) + `POST/GET/DELETE /api/v1/build/keys` reusing mintWorkspaceToken + a `/build/keys` panel. Commit.
- [ ] T4: gap MCP tools as op-dispatch `POST /api/v1/build/listings` — `set_usage_price` (normalizePricingForPersist write, org-scoped, NO charge) + `list_my_listings` (computeListingEarnings read). Pure resolver TDD. Commit.
- [ ] T5: `/build` quickstart page + final gate (tests/tsc/check-use-server/pnpm build) + push.

## Money-safety
set_usage_price only WRITES the additive pricing columns (display/intent). No Stripe call, no charge, no settlement. Listing stays free; publish gate already blocks paid-without-Connect.

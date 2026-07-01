# Voice Deploy + Metered Billing — the 3 tiers on the prepaid wallet (Design)

**Date:** 2026-07-01
**Status:** Approved (brainstorm). Next: implementation plan.
**Related:** the 3-tier decision + COGS research (memory `voice-deploy-3tier-pricing`); the shipped prepaid wallet (`src/lib/build/wallet-store.ts`, `wallet-ledger.ts` — the ONE Stripe Checkout top-up, idempotent ledger, never-negative decrements); the deploy verb A–C (`runDeploy` orchestrator, `POST /api/v1/build/deploy`, `seldonframe deploy`, `deploy_agent`, `SF_DEPLOY_ENABLED`); telephony (`lib/telephony/` — `provisionVoiceNumber` state machine, `createTwilioTelephonyClient` DI, `resolveBuilderTelephony`); the voice webhook (`app/api/v1/voice/openai/webhook/route.ts` — drives the whole call in `after()`, resolves the deployment by dialed number, `resolveDeploymentRuntimeKey` ~:305-314). This supersedes the original deploy-spec Part D. Next roadmap item after this: trust/reputation.

## The one line
Give every builder a phone-answering agent on the tier that fits them — **Tier 0** instant SF number ($1.50/mo + $0.15/min), **Tier 1** BYO Twilio ($0.15/min), **Tier 2** BYO everything ($0) — with all metered money flowing over the **shipped prepaid wallet** so this feature adds **ZERO new Stripe calls**.

## MONEY-SAFETY (a new charge path — non-negotiable rules)
- **No new Stripe surface at all.** Money-in stays the ONE existing top-up Checkout. Minutes + rent are ledger debits on the shipped wallet (UNIQUE idempotency keys, guarded never-negative decrements).
- **Flag-gated:** new `SF_VOICE_MANAGED` (separate from `SF_DEPLOY_ENABLED`). Off ⇒ every new path inert; existing voice behavior byte-for-byte unchanged.
- **Inert without keys:** no `TWILIO_MASTER_ACCOUNT_SID`/`TWILIO_MASTER_AUTH_TOKEN` ⇒ no subaccount/provisioning path reachable. Max enters all keys in Vercel.
- **Idempotent metering:** a call debits at most once (`voice:<callId>`); a month's rent at most once (`rent:<deploymentId>:<YYYY-MM>`). Mirrors `debit:<runId>`.
- **Prepaid kills bad debt:** gate at call-accept, drain-and-suspend on shortfall — the wallet never goes negative; SF's max exposure is the tail of one call.
- **Tier 2 webhook deliveries verified per-org** against that org's stored `whsec_` (Standard Webhooks HMAC), and the resolved deployment must belong to that org.
- **Legacy untouched:** the workspace-fallback voice path (Max's own Seldon Studio numbers) is NEVER metered. Metering applies ONLY to deployment-resolved calls, only when the flag is on.

## Locked decisions
1. **Billing rail = the prepaid wallet** (Max chose A). No auto-recharge in v1 (fast-follow), no postpaid.
2. **Pricing:** $0.15/min (ceil to whole minutes) + $1.50/mo per SF-managed number. Env-overridable constants: `SF_VOICE_RATE_MICROS_PER_MIN` (default 150_000), `SF_NUMBER_RENT_MICROS` (default 1_500_000).
3. **Tier 0 architecture = one Twilio SUBACCOUNT per builder-org** (isolation; billing rollup to SF's master; suspend/reactivate = one API call; **trunking subdomain requires the SUBACCOUNT's own creds**, not master creds).
4. **Tier derivation, not declaration:** own OpenAI voice project connected → Tier 2; BYO Twilio only → Tier 1; neither → Tier 0. No tier column.
5. **Accept-key:** metered calls (platform webhook) force the platform `OPENAI_API_KEY`; Tier 2 calls (per-org webhook) accept strictly on the builder's stored voice key.
6. **Model stays `gpt-realtime-2`**; caching is the margin lever (Realtime's stateful sessions get cached-input rates on context automatically) — VERIFIED by a live-smoke on real usage metrics, `-mini` left as a later config knob.
7. **All three tiers in this spec;** the plan phases them (P1 rails → P2 Tier 1 → P3 Tier 0 → P4 Tier 2), each shippable + flag-gated.

## Schema (additive — NO migration)
- **Wallet kinds:** add `"voice_debit"` and `"number_rent"` to `WalletTransactionKind` (`db/schema/wallet.ts` — text column, same trick as `"payout"`). Idempotency keys: `voice:<callId>`, `rent:<deploymentId>:<YYYY-MM>` (UTC month).
- **`numberOrigin`:** add the value `"sf_managed"` (text column). `"provisioned"` keeps meaning "on the builder's BYO Twilio"; release-on-cancel extends to `sf_managed` (released via the subaccount client).
- **Org jsonb (`organizations.integrations`):**
  - `sfTelephony: { subaccountSid, authToken (encrypted "v1." scheme, same as BYO), trunkSid }` — the SF-managed Twilio subaccount.
  - `openaiVoice: { projectId, apiKey (encrypted), webhookSecret (encrypted whsec_) }` — Tier 2.
- **Deployment jsonb (`deployments.customization` or a sibling sparse field):** `delinquentSince?: ISO` marker for the rent-suspension lifecycle. No column.

## Component design

### 1. Wallet store additions (`src/lib/build/wallet-store.ts`)
- `debitVoiceUsage({ orgId, callId, amountMicros })` — mirrors `debitWalletForRun`: insert `voice_debit` row keyed `voice:<callId>` (duplicate ⇒ no-op), guarded decrement. On **insufficient**: do NOT delete-and-refuse (the minutes were already consumed) — instead call the drain path below and return `{ ok:true, drained:true, shortfallMicros }`.
- `drainWalletForVoice({ orgId, callId, amountMicros })` — the one genuinely new SQL shape: atomically decrement by `LEAST(balance, amount)` and record a `voice_debit` row for the amount actually drained (key still `voice:<callId>` — one row per call either way). Returns `{ drainedMicros, shortfallMicros }`. Never negative by construction.
- `debitNumberRent({ orgId, deploymentId, monthKey, amountMicros })` — insert `number_rent` row keyed `rent:<deploymentId>:<monthKey>`, guarded decrement; insufficient ⇒ refuse (delete row, return `insufficient`) — rent, unlike minutes, CAN be refused (we suspend instead).
- Pure helpers in a new `src/lib/telephony/voice-metering.ts` (TDD): `ceilMinutes(seconds)` (min 1 for an answered call), `voiceDebitMicros(seconds, rateMicros)`, `voiceDebitKey(callId)`, `rentMonthKey(date)`, `shouldAcceptMeteredCall(balanceMicros)` (≥ $1 = 1_000_000 micros), `isMeteredDeployment(...)`.

### 2. Metering in the voice webhook (platform route)
`app/api/v1/voice/openai/webhook/route.ts`:
- **Accept gate:** on the deployment path only (a `resolveDeploymentByNumber` hit), when `SF_VOICE_MANAGED` is on and the call is metered (arrived on THIS platform webhook — Tier 0/1 by definition): check `shouldAcceptMeteredCall(getWalletBalanceMicros(deployment.builderOrgId))`. Below the floor → do NOT accept (reject 603 / let missed-call handling fire) + surface a low-balance signal. Flag off, or the workspace-fallback path → behavior unchanged.
- **Debit at hang-up:** in the `after()` callback where `runVoiceCall` resolves, compute duration from the call's tracked start/end, then `debitVoiceUsage` with `voiceDebitMicros(...)`. Idempotent on the callId. `drained:true` ⇒ fire-and-forget `suspendBuilderSubaccount(orgId)` (Tier 0) / mark delinquent (Tier 1 has no subaccount to suspend — its gate simply refuses the next call). Metering failures are fail-soft logged — a metering bug must never crash a live call path.
- **Key forcing:** metered calls skip the builder-key attempt — `voiceApiKey = platform OPENAI_API_KEY` (also fixes the latent cross-project accept bug).

### 3. Tier-0 provisioning (`src/lib/telephony/sf-managed.ts`)
- `resolveMasterTwilio()` — env creds; null ⇒ whole module inert.
- `ensureBuilderSubaccount(orgId)` — idempotent: find by `FriendlyName = orgId` (list filter), else `POST /2010-04-01/Accounts`; persist `sfTelephony` (token encrypted). Returns `{ subaccountSid, authToken }`.
- `ensureSubaccountTrunk(subCreds)` — `ensureBuilderTrunk` logic **authenticated with the SUBACCOUNT creds** (the trunking-subdomain rule), origination = `OPENAI_SIP_ORIGINATION_URI` (SF's shared SIP). Idempotent (reuse a matching trunk).
- Then the existing `provisionVoiceNumber` state machine runs unchanged with `createTwilioTelephonyClient(subaccountCreds)` + the subaccount trunk; write `numberOrigin: "sf_managed"`. Debit the first month's rent (`rent:<depId>:<provision-month>`) BEFORE buying the number — insufficient ⇒ refuse provisioning (`insufficient_balance`), buy nothing.
- `suspendBuilderSubaccount(orgId)` / `reactivateBuilderSubaccount(orgId)` — `Status=suspended|active` via master creds. Reactivation happens automatically on the next successful top-up when a delinquency marker exists (hook the existing top-up credit path, fail-soft).

### 4. Rent cron (`app/api/cron/voice-rent/route.ts`)
Monthly (1st, UTC; secured the same way as the existing proposals TTL cron). For each active `sf_managed` deployment: skip the provision month (already charged); `debitNumberRent` for the current month; **insufficient ⇒ suspend the subaccount + stamp `delinquentSince`**; paid ⇒ clear the marker (+ reactivate if suspended). **30+ days delinquent ⇒ release the number + cancel the deployment** (reuse the cancel/release path — SF stops bleeding $1.15/mo on zombies; the ledger row trail explains everything). Idempotent per month key — safe to re-run.

### 5. Tier 2 (`app/api/v1/voice/openai/webhook/[orgId]/route.ts` + wizard step)
- **Per-org webhook route:** verify the delivery against THAT org's decrypted `whsec_` (same `verifyOpenAiWebhook` helper, parameterized secret); resolve the deployment by dialed number and **require `deployment.builderOrgId === orgId`** (reject otherwise — no cross-org spoofing); drive the call accepting **strictly on the org's stored voice key** (no platform fallback — cross-project would fail anyway, and silence here would be dishonest). Never metered.
- **Wizard "Connect your OpenAI voice project" step:** shows the 3 things to do in the OpenAI dashboard (copy `project_id` from Settings→General; register `https://app.seldonframe.com/api/v1/voice/openai/webhook/<orgId>` under Settings→Webhooks; copy the `whsec_`), collects `projectId` + `whsec_` + API key, stores all encrypted. Then `ensureBuilderTrunk` (their BYO Twilio creds — Tier 2 requires BYO Twilio) points their trunk at `sip:<their_project>@sip.api.openai.com;transport=tls`.

### 6. Deploy-verb integration (the payoff)
- `computeDeployReadiness` telephony requirement becomes satisfiable two ways: BYO Twilio connected, **or Tier 0 available** = `SF_VOICE_MANAGED` on + master creds present + wallet ≥ $5 (headroom for first rent + first calls). The unmet message offers both: *"Top up your wallet for an instant SF number, or connect your own Twilio."*
- `runDeploy`'s provision path: no BYO creds ⇒ take the SF-managed path (§3) instead of returning `needs_telephony`. `seldonframe deploy` on a voice agent with a funded wallet ⇒ **number + live in one call, nothing pasted.**
- Builder block / CLI `status`: surface wallet balance alongside voice deployments + a `low_balance`/`suspended` state so the IDE agent warns before an agent goes dark.

## Error handling
- Balance below the accept floor → the call is not accepted (missed-call text-back can still fire — the SMB never hears a dead line without follow-up); readiness + status show `low_balance`.
- Call outruns balance → drain + suspend/delinquent; never negative, never a dropped live call.
- Subaccount create/trunk/buy failures → the existing idempotent state machine semantics (resume, never re-buy); rent-before-buy means a failed provision costs nothing.
- Suspended subaccount → inbound calls stop at Twilio; the deployment shows `suspended: top up to reactivate`; top-up auto-reactivates.
- Tier 2 signature mismatch or org/deployment mismatch → 401/403, logged; nothing accepted.

## Testing
- **Pure (TDD):** `voice-metering.ts` — ceil/min-1 rounding, debit math at the env rate, key formats, the accept floor, month keys (UTC edges), metered-vs-not discrimination.
- **Wallet store:** drain semantics (partial drain records exactly the drained amount; duplicate callId ⇒ no-op; never negative), rent refuse-on-insufficient, idempotency (mirror the earning/payout dedupe tests).
- **Orchestration:** extend `deploy-orchestrator.spec.ts` — funded wallet + no BYO ⇒ SF-managed provision path reached; unfunded ⇒ `needs_connect` with both options; flag off ⇒ old behavior.
- **Cron:** pure planner test (which deployments get charged/suspended/released for a given month + ledger state).
- **Tier 2 route:** signature-verify + org-match rejection paths (fake secrets).
- **Live smokes (Max + me):** one real Tier-0 call end-to-end (subaccount → trunk → SF SIP → answer → wallet debited once); the **cached-input-rate verification** on real usage metrics (the margin make-or-break); Twilio subaccount trunk → shared OpenAI SIP connectivity.

## Out of scope (explicit)
- Auto-recharge (saved card, off-session PaymentIntents) — the natural fast-follow.
- Postpaid/invoiced billing; per-builder pricing overrides; international numbers; `-mini` switch (knob later).
- A2P/SMS registration on `sf_managed` numbers (voice-first; SMS compliance on SF-provided numbers is its own ops item).
- Trust/reputation (next spec).

## Open items (resolve in the plan / live checks)
- Confirm the repo's cron auth pattern (secret name + vercel.json schedule) and mirror it.
- Verify `verifyOpenAiWebhook` is cleanly parameterizable by secret (it verifies against the platform env today).
- The Tier-1 "suspend" analog: no subaccount to suspend — confirmed the accept-gate alone is the enforcement (documented, not a gap).
- Live checks listed under Testing (subaccount→shared-SIP connectivity; cached rates).

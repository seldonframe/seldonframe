# Agent Marketplace E2E — Pipeline Gap Analysis (voice HVAC receptionist)

**Date:** 2026-07-01
**Purpose:** Validate the full pipeline for the target test — *User A builds a voice HVAC receptionist that books into Google Calendar → publishes to marketplace → User B buys it → connects their Google Calendar + gets a phone number → a caller dials User B's number → the agent answers and books a job into User B's Google Calendar* — and enumerate the gaps that block it. Input for the "deploy verb" build.

**Headline:** the E2E is **~90% built** via the existing marketplace **Install** path + the buyer setup wizard. It is NOT a build-from-scratch. There are **2 real code blockers**, **1 config item**, and **1 exposure gap** (the "deploy verb" itself). Findings below are grounded in a multi-agent read of the live code (worktree `icp3-wedge`, current with `main`).

## The pipeline, stage by stage

| Stage | Current state | Status |
|---|---|---|
| **1. Build voice HVAC agent** (User A) | `agent_templates` row, `type: voice_receptionist`, full `AgentBlueprint` (voice, greeting, `customSkillMd`, faq, quoteRanges, capabilities, connectors, trigger). Built via Studio editor. | ✅ works (⚠️ `create_agent` MCP tool copy says voice is "queued" — stale gating) |
| **2. Publish to marketplace** | `publishAgentTemplateAction` copies the full blueprint (incl. voice) into `marketplaceListings.agentBlueprint`. Free = instant; paid = Stripe Connect. | ✅ works (⚠️ it's a Studio action, not an MCP tool; the `publish_agent` MCP tool is a *status* flip, not a marketplace listing — naming mismatch in builder-ladder) |
| **3. User B buys / installs** | `installAgentListingAction` → `provisionBuyerAgentFromListing`: clones blueprint into a **buyer-owned** `agent_templates` row + creates a **buyer-owned** `deployments` row (`builderOrgId = buyerOrgId`, `surface: phone`, `status: draft`) → redirects to `/agent/[deploymentId]/setup`. | ✅ works (⚠️ Rent-via-MCP shown for voice too, can't ring a phone → UX trap; install deployment-create is fail-soft → can strand buyer) |
| **4a. Connect Google Calendar** | Buyer wizard `connect_tool` step → `startCalendarConnect` → real Composio OAuth (`googlecalendar`) → callback verifies live connection + persists `deployment.calendarRef`. Composio key has a **platform fallback** (`resolveComposioKey`). | ⚠️ connects, but see **Blocker #1** |
| **4b. Get a phone number** | Buyer wizard `phone` step → "Forward my number" (`activateDeploymentAction`, no Twilio) or "Get a new number" (`provisionDeploymentNumberAction` → buys real Twilio # + attaches to SIP trunk → OpenAI gateway). | ⚠️ "Get a number" blocked, see **Blocker #2**; "Forward" works today |
| **4c. Go live** | `goLiveAction` flips `status: active`, gated on required steps. | ✅ works |
| **5. Inbound call → answer → book** | Call → OpenAI SIP webhook → `resolveDeploymentByNumber(dialedNumber)` → `loadDeploymentVoiceContext` (retargets ctx to buyer's org) → `runVoiceCall` with `VOICE_TOOLS` (incl. `book_appointment`) → tool runs against `ctx.booking` → `deploymentToBinding` → Composio → `GOOGLECALENDAR_CREATE_EVENT`. | ✅ wired end-to-end (the earlier Composio live-smoke is **closed** — commits `87b59377`/`b9240b7d` fixed the SDK exec + free/busy shape; only stale TODO comments remain) |
| **6. Deploy verb (agent-native)** | The whole install→setup flow is a **web wizard + Server Actions**. | ⚠️ **Exposure gap** — no MCP tool / CLI verb (the roadmap item) |

## The gaps, ranked

### Blocker #1 — `bookingMode` never flips to `api_mcp` → bookings go to SF-native, NOT Google Calendar (the one that breaks the exact test)
- `bookingMode` is set only at `createDeployment` and **defaults to `"native"`** (`store.ts:341`, schema default `deployments.ts:110`). Nothing in the marketplace/buyer/calendar-connect path sets it to `api_mcp` (verified: grep for `api_mcp|bookingMode` across `src` — the only *writers* are the create path's default and the passthrough input).
- Connecting a Google Calendar writes `calendarRef` (via `/api/deployments/[id]/calendar/callback`) but leaves `bookingMode = "native"`.
- At call time `deploymentToBinding` (`booking-binding.ts:33`) only returns `book_external` (Composio → Google Calendar) when `bookingMode ∈ {api_mcp, cal_com}`. With `"native"`, it returns `book_native` and **`calendarRef` is silently ignored** — the booking lands in SF's own store, never Google Calendar.
- **This is a real correctness bug** independent of the test: a buyer connects their calendar, and it does nothing at booking time.
- **Fix (small, surgical):** when a `googlecalendar`/`outlook` calendar is successfully connected (the callback that persists `calendarRef`), also set `bookingMode = "api_mcp"`. (Alternative: make `deploymentToBinding` treat a connected external `calendarRef` as `book_external` even under `"native"` — but flipping `bookingMode` on connect is cleaner and matches the "Connect calendar affordance shows only for api_mcp" intent in `store.ts:607`.) Guard: only flip for the calendar toolkits, and only forward when the connection verified.

### Blocker #2 — No platform Twilio pool → a pure buyer can't self-serve "Get a new number"
- `provisionDeploymentNumberAction` requires the **caller's own org** (= buyer's org for a bought agent) to have `integrations.twilio.{accountSid, authToken, voiceTrunkSid}` — **no platform fallback** (`resolveBuilderTelephony`, `config.ts:102-143`; contrast `resolveComposioKey` which *does* fall back to `process.env.COMPOSIO_API_KEY`). The only UI to set those is the agency `/settings/integrations`, which the `(buyer)` layout doesn't expose. Result: `{ error: "needs_telephony" }`.
- Also: even with creds, there is **no automated SIP-trunk provisioning** — `attachNumberToTrunk` only attaches to an *existing* trunk SID; nothing creates the trunk→OpenAI-SIP-URI mapping.
- **Works today for the test via the "Forward my existing number" path** (`activateDeploymentAction`, no Twilio needed — the buyer forwards a real phone), OR by setting Twilio creds on User B's org (Max controls both orgs).
- **Real fix (medium):** add a platform-Twilio-pool fallback to `resolveBuilderTelephony` + a shared platform trunk SID (mirror `resolveComposioKey`'s BYO-else-platform pattern), injecting a platform-master `TwilioTelephonyClient` into the existing idempotent `provisionVoiceNumber` state machine. **Cost note:** SF-provided numbers are a real COGS (contra the BYO-Twilio model) — likely a metered add-on, not free. The forward-number path avoids this entirely for v1.

### Config #3 — Platform Composio key + Google OAuth app (Max verifies)
- `resolveComposioKey` falls back to `process.env.COMPOSIO_API_KEY`, so a buyer *can* connect Google Calendar under the platform key — **if** that key is set in Vercel AND its Composio Google OAuth app is configured to authorize arbitrary end-user Google accounts (not just an internal one). **Max to confirm.**

### Exposure gap #4 — The "deploy verb" (the roadmap item)
- Everything a buyer needs — `resolveOrCreateBuyerDeployment` → `activateDeploymentAction`/`provisionDeploymentNumberAction` → `startCalendarConnect` → `goLiveAction` — is real and buyer-reachable, but **only via the `/agent/[deploymentId]/setup` browser wizard**. There is no `deploy_agent` MCP tool and no `seldonframe deploy` CLI verb, so an agent (Claude Code / the builder lens) cannot deploy programmatically.
- The agency `deployAgentTemplateToClientsAction` is the *wrong* shape to reuse (it writes `agents` rows into existing client orgs; no phone, no calendar, no `deployments` row).
- **Build (medium):** a `deploy_agent` MCP tool + `seldonframe deploy` CLI + a `/api/v1/build/deploy` route that composes the buyer seams. The **OAuth calendar hop has no pure-API form** — the verb must hand back the Composio `redirectUrl` (+ the `/agent/[id]/setup` URL) for the human to click; number provisioning + go-live are pure API.

### Minor / polish
- Gate/relabel **Rent-via-MCP for voice** agents (Install-only; rental can't ring a phone). Harden the install fail-soft (`deploymentId: null` strands the buyer).
- Stale docs: `create_agent` "voice queued" copy + "voice ships Q3 2026" comments — voice is fully built; misleads the next builder.
- Stale TODO comments in `composio-calendar-backend.ts` (the shape is confirmed; comments say "best-guess pending verification").

## Recommended sequence
1. **Blocker #1 fix** (`bookingMode → api_mcp` on calendar connect) — tiny, high-leverage, and a real bug fix. Makes "books into Google Calendar" actually work.
2. **The deploy verb** (`deploy_agent` MCP tool + `seldonframe deploy` CLI + `/api/v1/build/deploy`) — the roadmap item; composes the existing seams; hands back the OAuth + setup URLs for the human steps.
3. **Platform Twilio pool** (`resolveBuilderTelephony` fallback + shared trunk) — the real self-serve-number unlock; metered add-on (COGS). The test uses forward-number until then.
4. **Polish** — Rent-for-voice gate, install fail-soft, stale docs.

## The test is runnable NOW with two conditions
- Apply **Blocker #1 fix** (else the booking won't reach Google Calendar), and
- Use **"Forward my existing number"** for User B's phone (avoids Blocker #2), and
- Confirm **Config #3** (platform Composio key + Google OAuth app).

Then: User A builds the voice HVAC template → lists it → User B (second account) installs → connects their Google Calendar + forwards a real number → go live → call the number → book → verify the event appears in User B's Google Calendar.

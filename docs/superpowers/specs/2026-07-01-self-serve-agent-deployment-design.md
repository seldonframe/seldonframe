# Self-Serve Agent Deployment — the deploy verb + intuitive BYO connect (Design)

**Date:** 2026-07-01
**Status:** Approved (brainstorm). Next: implementation plan.
**Related:** the E2E gap analysis (`docs/superpowers/specs/2026-07-01-agent-marketplace-e2e-gap-analysis.md`); the builder-onboarding lens + builder-ladder (`src/lib/build/builder-ladder.ts`, the `builder` block on `get_workspace_state`); the buyer setup wizard (`/agent/[deploymentId]/setup`); the Studio agent builder (`/studio/agents`); the pluggable booking backend (`deploymentToBinding`, `resolveCalendarBackend`); the payout feature (just shipped). Roadmap: this is the **deploy verb** item; **trust/reputation** is the next fast-follow.

## The one line
Make deploying an agent to a real channel (a phone number + a connected Google Calendar) an **agent-native verb** — `deploy_agent` / `seldonframe deploy` — that detects what a human must connect, hands back the one link to connect it, and otherwise finishes the deploy. **BYO Twilio + BYOK throughout** (their infra, their keys); SF's job is to make it *orders of magnitude* more intuitive, not to resell infrastructure.

## The model (locked)
- Builders build agents in Claude Code / their IDE via the SF skill — the fast, agent-native path — or in the Studio builder (`/studio/agents`).
- The moment an agent needs something only a human can do in a browser — **OAuth consent** (Google Calendar) or **entering secrets** (their Twilio SID + auth token + a number) — the flow hands them a **scoped Wizard link** (`/agent/[deploymentId]/setup`, the *existing* buyer wizard), they connect exactly what that agent needs, once, then return to the IDE.
- Everything is **their** Twilio and **their** keys. No SF-provided number pool.
- The deploy verb's intelligence is **requirement detection**: given an agent, compute what's missing and return the one link that collects precisely that — instead of failing with `needs_telephony`.

## MONEY-SAFETY (by construction)
BYO Twilio → the builder pays Twilio directly; BYOK → the builder pays their LLM/Composio directly. **This feature introduces NO new SF charge path, no COGS, no metering.** SF's only money stays the existing marketplace 5%-on-sales. Guards: the deploy verb + auto-trunk are **flag-gated** and **inert without the builder's own creds** (no Twilio creds → the telephony requirement is simply reported unmet, nothing is provisioned); number/trunk provisioning is **idempotent**; release-on-cancel already exists. Max enters any platform-level config (the OpenAI SIP origination URI) himself, like the other keys.

## Part A — Booking fix (the real bug; do first)
**Problem:** connecting a Google/Outlook calendar persists `deployment.calendarRef` but leaves `deployment.bookingMode = "native"` (the schema default, `deployments.ts:110`). At call time `deploymentToBinding` (`lib/deployments/booking-binding.ts:33`) only routes to Google Calendar (`book_external`) when `bookingMode ∈ {api_mcp, cal_com}` — so with `"native"` the connected calendar is **silently ignored** and the booking goes to SF-native.

**Fix:** in the calendar OAuth-return callback that persists `calendarRef` (`app/api/deployments/[id]/calendar/callback/route.ts`, via `updateDeployment`), when the connection verifies for a calendar toolkit (`googlecalendar`/`outlook`), **also set `bookingMode: "api_mcp"`** in the same patch. Idempotent (already `api_mcp`/`cal_com` → leave as-is; never downgrade an `external_link`). Guard: only for the two calendar toolkits, only on a verified live connection. **No migration** — `bookingMode` already exists. Add a focused unit test on the pure "what patch should the callback write" decision (extract a tiny pure helper `calendarConnectPatch(current, toolkit, calendarRef)` so it's testable without the route).

## Part B — `computeDeployReadiness` (pure; reuse, do not reinvent)
The Studio builder and the buyer wizard already share one primitive model. Requirement detection is a thin **merge of existing, tested seams** — a new pure module `src/lib/deployments/deploy-readiness.ts`:

```ts
export type DeployRequirement =
  | { kind: "calendar_oauth"; toolkit: string; met: boolean }
  | { kind: "telephony"; met: boolean }
  | { kind: "business_info"; met: boolean }
  | { kind: "other_connector"; toolkit: string; met: boolean };
export type DeployReadiness = {
  ready: boolean;
  requirements: DeployRequirement[];
  missing: DeployRequirement[];          // requirements where met === false
  wizardPath: string;                    // buyerSetupPath(deploymentId) — where the human finishes
};
export function computeDeployReadiness(input: {
  templateType: AgentTemplateType;
  blueprint: AgentBlueprint;
  deploymentId: string;
  telephonyConnected: boolean;           // resolved from the org's integrations (impure caller supplies)
  connectorConnected: (binding: ConnectorBinding) => boolean; // isBindingConnectedForOrg, curried by caller
  progress?: OnboardingProgress;         // the deployment's onboarding progress (business_info etc.)
}): DeployReadiness;
```
Composition (all existing):
- **Steps / connectors:** `normalizeBlueprintForOnboarding(templateType, blueprint)` → `buildOnboardingSteps(...)` (`lib/marketplace/onboarding/steps.ts:98-145, 168-203`) — the *same ordered steps the buyer wizard trusts*, so IDE + wizard speak one language. `goLiveBlockers(steps, progress ?? emptyProgress())` (`lib/marketplace/buyer/buyer-onboarding.ts:138-151`, `lib/marketplace/onboarding/progress.ts:22`) → the "must connect: […]" list.
- **Telephony need:** `deploymentNeedsNumber(blueprint.trigger, surfaceForType(templateType))` (`lib/deployments/margin.ts:180-188`, composing `resolveAgentTrigger` + `agentNeedsNumber`, `lib/agents/triggers/agent-trigger.ts:90-98, 132-139`).
- **Connector OAuth-connectedness:** `computeToolConnectionStatuses(blueprint.connectors ?? [], connectorConnected)` (`lib/agents/mcp/tool-connection.ts:82-113`), backed by `isBindingConnectedForOrg(orgId, binding)` (`lib/agents/mcp/binding-connection.ts:33-66`) — which bound `composio` toolkit (e.g. `googlecalendar`) is OAuth-connected vs. not.
- **Merge** telephony (from `margin.ts`) + connector-connectedness (from `steps.ts`/`tool-connection.ts`) into the single `DeployReadiness` — this merge is the ONLY net-new logic, because today those two live in separate subsystems and nothing unifies them at build time.

Pure + fully unit-tested (voice-with-unconnected-calendar → `missing:[calendar_oauth, telephony]`; chat-only → `ready:true`; voice-with-everything-connected → `ready:true`; malformed blueprint tolerated).

## Part C — The deploy verb (surface: route + CLI + MCP tool)
1. **`POST /api/v1/build/deploy`** (`src/app/api/v1/build/deploy/route.ts`) — `guardApiRequest` (`wst_` bearer). Body: `{ source: { templateId } | { listingSlug }, phone?: { mode: "forward"; number } | { mode: "provision"; areaCode }, customization? }`. Flow:
   - Resolve/create the deployment (idempotent — re-deploy resumes, never spawns duplicates): a marketplace `listingSlug` → `resolveOrCreateBuyerDeployment` (`lib/marketplace/buyer/buyer-deployment.ts:121-144`, idempotent on `sourceListingId`); a self-built `templateId` → **resolve-or-create** a buyer-owned deployment **idempotent on `(builderOrgId, templateId)`** (resume the existing draft/live row for that template; mirror `resolveOrCreateBuyerDeployment`'s pattern), `surface` from the template type.
   - `computeDeployReadiness(...)` with the real telephony/connector resolvers.
   - **If `!ready`:** return `{ ok: true, status: "needs_connect", deploymentId, requirements, missing, wizardUrl }` (the `wizardUrl` = absolute `buyerSetupPath(deploymentId)`). No provisioning attempted.
   - **If `ready`:** apply `phone` (forward → `activateDeploymentAction`; provision → `provisionDeploymentNumberAction`), then `goLiveAction` (gated by `goLiveBlockers`), and return `{ ok: true, status: "live", deploymentId, phoneNumber }`.
   - Money-safe: **flag-gated behind a deploy feature gate** (for rollout control — deploy touches no charge path, so this is NOT the billing flag); every provisioning call inherits the existing inert-without-creds behavior.
2. **`seldonframe deploy`** (`packages/cli/src/commands/deploy.ts`) — `--template <id>` | `--listing <slug>`, `--forward <e164>` | `--area <areaCode>`. POSTs the route; renders honestly: `needs_connect` → prints the `wizardUrl` + the human-readable missing list ("Connect these once, then re-run: Google Calendar, Twilio number"); `live` → "✓ deployed — <number> is answering." Mirrors the existing CLI command structure (`api-client.ts` + `commands/*` + `cli.ts` + `help.ts`), TDD like the payout command.
3. **`deploy_agent` MCP tool** (`skills/mcp-server/src/tools.js`, beside `publish_agent`/`list_agents`) — thin wrapper over `POST /api/v1/build/deploy`; its description tells the agent to relay the returned `wizardUrl` to the human when `status === "needs_connect"`, then call again. **Republishing `@seldonframe/mcp` is Max's action** (like `npm publish`), so the tool definition lands in-repo but goes live on his publish.
4. **Builder-block surface** — extend the `builder` block on `get_workspace_state` (or the CLI `status`) to include per-agent `deploy_readiness` (from `computeDeployReadiness`), so the IDE agent proactively says "to go live, connect: Google Calendar + Twilio" without a failed deploy first. Additive, fail-soft (matches the existing builder-block pattern).

## Part D — BYO-Twilio auto-trunk (the "paste two keys" magic)
Today `resolveBuilderTelephony(orgId)` (`lib/telephony/config.ts:102-143`) requires the org's `integrations.twilio.{accountSid, authToken, voiceTrunkSid}` — and a builder hand-creating an Elastic SIP Trunk pointed at the OpenAI gateway is the opposite of intuitive. Automate it:

- **Net-new `ensureBuilderTrunk`** on the Twilio client (`lib/telephony/twilio-client.ts`) + a small orchestration in the Wizard's connect-Twilio step: given `{ accountSid, authToken }`, (1) validate the creds (a cheap authed GET), (2) **list existing Elastic SIP Trunks** (Trunking API `GET /v1/Trunks`) and find one whose Origination URI is the OpenAI SIP gateway; (3) if none, **create the trunk** (`POST /v1/Trunks`) + set its **Origination URI** to the OpenAI SIP gateway (`POST /v1/Trunks/{sid}/OriginationUrls`); (4) return the `trunkSid`. Idempotent (reuses an existing matching trunk; never creates duplicates). Store `accountSid`/`authToken` (encrypted, as today) + the resolved `voiceTrunkSid` in the org's `integrations.twilio`.
- After this, the existing idempotent `provisionVoiceNumber` state machine (`lib/telephony/provision-voice-number.ts`) buys + attaches numbers on the builder's account with zero further setup.
- The Wizard connect-Twilio step is a new step-kind in the setup wizard (paste SID + token → `ensureBuilderTrunk` runs → success), OR a field-set on the existing `phone` step. The buyer/builder is authed as their own org.
- **The OpenAI SIP origination URI is a platform config value** (`OPENAI_SIP_ORIGINATION_URI`) — the *same* address the current working platform trunk already uses. Max provides/confirms it (see Open Items). Voice LLM still runs on the builder's OpenAI key at accept time (`resolveDeploymentRuntimeKey`, fail-soft to platform) → LLM cost stays BYOK; only the shared SIP gateway is platform-level.

## Data flow (the E2E, self-serve)
Build agent (IDE or Studio) → `seldonframe deploy --listing hvac-receptionist --forward +1602…` → route resolves a buyer-owned deployment → `computeDeployReadiness` → `needs_connect` with `wizardUrl` + `[calendar_oauth:googlecalendar, telephony]` → human opens the wizard, pastes Twilio SID+token (`ensureBuilderTrunk` auto-creates the trunk on their account) + picks/forwards a number, clicks "Connect Google Calendar" (Composio OAuth → callback persists `calendarRef` **and flips `bookingMode:api_mcp`**) → agent re-runs `deploy` → `ready` → `goLive` → `live`. Caller dials the number → `resolveDeploymentByNumber` → voice runtime → `book_appointment` → `deploymentToBinding` (now `api_mcp`) → Composio → the caller's booking lands in the builder's Google Calendar.

## Error handling
- No Twilio creds yet → `telephony` requirement `met:false`, deploy returns `needs_connect` (never a 500). Invalid Twilio creds in the wizard → a clear "couldn't validate your Twilio keys" error, nothing stored.
- `ensureBuilderTrunk` create fails → surface it; do not store a half-trunk; the builder retries (idempotent).
- Calendar connect fails/canceled → `calendar_oauth` stays unmet; booking fail-softs to native (existing behavior) until connected.
- Number provisioning: existing errors (`no_numbers_available`, `phone_in_use`, `needs_telephony`) map to buyer-facing copy (existing).
- Deploy on an already-live deployment → idempotent no-op returning `live`.

## Testing
- **`computeDeployReadiness` (pure):** the requirement matrix (voice+unconnected-calendar, chat-only, all-connected, malformed) — assert `ready`/`missing` exactly.
- **`calendarConnectPatch` (pure):** native→api_mcp on calendar connect; api_mcp→api_mcp (no-op); external_link untouched; non-calendar toolkit → no bookingMode change.
- **`ensureBuilderTrunk` idempotency:** fake Twilio client — existing matching trunk → reused (no create); none → one create + one origination-URL set; returns the SID. No real Twilio in tests.
- **Route:** `needs_connect` shape when unmet; `live` shape when met (injected deps, no real Twilio/Composio); flag-off → inert; bad bearer → 401.
- **CLI `deploy`:** renders `needs_connect` (prints wizardUrl + missing) and `live` branches (fake fetch).

## Out of scope (explicit)
- **Platform Twilio pool / SF-provided numbers** — dropped (BYO Twilio).
- **Metering / any charge path** — none (BYO everything).
- **Gating Rent-via-MCP for voice** — dropped; rent and deploy are distinct valid modes. (Optional: clearer copy on what each mode gives — not built here.)
- **Trust/reputation** — the next spec.
- Non-Google calendars beyond what Composio's `outlook` toolkit already handles; SMS/email deploy surfaces beyond what the readiness model already tolerates.

## Open items (resolve in the plan / a live check)
- **Confirm the `OPENAI_SIP_ORIGINATION_URI`** value + that the OpenAI Realtime SIP gateway + webhook are platform-level (one shared SIP address, SF's `/api/v1/voice/openai/webhook`) so a builder's trunk can point at it. Read it from the current working platform trunk. If OpenAI SIP is per-project (requiring each builder to configure their own OpenAI project SIP + webhook), that is a larger telephony change — flag before building Part D and confirm with a live check on the existing working number.
- The exact wizard surface for connect-Twilio (new step-kind vs. fields on the `phone` step) — pick in the plan; both reuse `ensureBuilderTrunk`.
- Whether the deploy verb should also expose a `get_deployment` / status read (likely yes, thin) so the agent can poll readiness after the human connects — decide in the plan.

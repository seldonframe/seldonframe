# Telephony — Voice-Number Auto-Provisioning (Phase 2.2 v1) — Design

**Date:** 2026-06-21
**Branch:** `feature/telephony-provisioning` (off `origin/main` @ `e1d4a938`, which contains the merged ICP-3 wedge)
**Status:** Design approved by Max 2026-06-21 — ready for implementation plan.

---

## Goal

When a builder activates a deployment, SeldonFrame **provisions a dedicated phone number automatically** and wires it to the voice receptionist — no manual Twilio steps. One inbound call to that number answers as the deployment's agent and books. This removes the only manual friction left in the deploy loop (today the builder must buy + configure a Twilio number by hand and paste it in).

**Scope of THIS build (v1):** voice only, single Twilio account, no billing enforcement. Decided with Max:
- **Voice-only** — voice + inbound SMS need zero A2P and are the actual wedge. Outbound SMS / A2P is a separate later phase.
- **Single Twilio account** — provision on the existing platform account (the one hosting the live 839 line + trunk). Per-builder subaccounts are a fast-follow.
- **SIP Trunk → OpenAI** — the live 839 line routes via a Twilio Elastic SIP Trunk whose origination points at OpenAI Realtime SIP. We replicate this by attaching each new number to that same trunk.

---

## Context — what already exists (do NOT rebuild)

On `origin/main` (merged ICP-3 wedge):
- **`deployments` table** (`packages/crm/src/db/schema/deployments.ts`): `builderOrgId`, `agentTemplateId`, `clientName`, `clientContact`, `surface`, `phoneNumber` (nullable E.164), `calendarRef`, `priceCents`, `stripeSubscriptionId/CustomerId`, `status` (`draft|active|paused|canceled`), and a **partial unique index** `deployments_phone_number_uniq` on `phone_number WHERE NOT NULL`.
- **Activate flow** (`lib/deployments/actions.ts`): `activateDeploymentAction({ deploymentId, phoneNumber })` validates E.164 (`isE164`), maps Postgres `23505` → `phone_in_use`, flips status to `active`. `pauseDeploymentAction` preserves `phoneNumber`. This is the **paste-a-number-you-own** path — it does NOT call Twilio.
- **Deployment voice resolution** (`lib/agents/voice/resolve-deployment-by-number.ts`): `resolveDeploymentByNumber(dialedNumber)` → matches the dialed `To` E.164 against `active` deployments; `loadDeploymentVoiceContext` builds the template persona + builder-org booking context. **This is already what answers the call** — the provisioning work just makes a number reach it.
- **Per-workspace Twilio integration** (`organizations.integrations.twilio`, encrypted via `lib/encryption.ts` `encryptValue`/`decryptValue`) and the SMS provider (`lib/sms/providers/twilio.ts`) — the existing pattern for talking to Twilio's REST API. We reuse the HTTP/auth shape but at **platform** scope (see Config).

There is **no** existing concept of a platform Twilio account, subaccounts, number provisioning, or trunk management — that is the greenfield this spec adds.

---

## Key research findings that shaped this design

Verified against Twilio + OpenAI primary docs (2026-06-21). The load-bearing ones:

1. **A2P 10DLC governs US *outbound SMS* only.** Voice and inbound SMS need **no registration** — a freshly provisioned number answers calls instantly. (This is why voice-only v1 is small and ships now.)
2. **A2P registration is per-account and per *sending business*** — a single shared SeldonFrame brand cannot legally front SMS for many distinct SMBs, and there is no clean migration from shared→per-client. The compliant model is per-client ISV sub-brands. **Out of scope for v1; documented in the deferred section so we build it right later.**
3. **Elastic SIP Trunk attach = the voice provisioning primitive.** `POST https://trunking.twilio.com/v1/Trunks/{TrunkSid}/PhoneNumbers` with `PhoneNumberSid` attaches an owned number to a trunk. Once attached, the number's `trunk_sid` is set and **inbound routing uses the trunk's origination URIs — the number's own `VoiceUrl`/`VoiceApplicationSid` are ignored** (precedence: `trunk_sid` > `voice_application_sid` > `voice_url`). So we leave `VoiceUrl` unset at purchase.
4. **One trunk fans many numbers into one OpenAI project.** Twilio publishes no max-numbers-per-trunk (MUST-VERIFY for high N), and origination is uncapped. OpenAI disambiguates per call.
5. **OpenAI Realtime SIP disambiguates by the dialed number.** On an inbound SIP call OpenAI fires a `realtime.call.incoming` webhook containing `data.sip_headers[]` including the **`To`** header (the dialed E.164 in the URI user part) and a `call_id`. The app parses `To`, resolves the deployment, and accepts via `POST https://api.openai.com/v1/realtime/calls/{call_id}/accept` with per-call `instructions`. **This is the existing 839 mechanism — already wired.**
6. **Usage attribution is per-account, not per-number.** `Usage/Records` can't break down by number; per-deployment cost (for future billing) must be reconstructed from the Call resource. Irrelevant to v1 (no billing) — noted for Phase 3.

Full research (subaccounts, Messaging Services, A2P ISV, usage/billing) is preserved in the conversation and summarized in the deferred section.

---

## Architecture

```
Platform Twilio account (single, v1 = the account hosting the live 839 line)
└── 1 Elastic SIP Trunk (TWILIO_VOICE_TRUNK_SID)
       │  origination ──► sip:proj_XXX@sip.api.openai.com;transport=tls
       ├── +1 839…  → deployment: Bella Hair Studio
       ├── +1 512…  → deployment: Pine Dental
       └── +1 737…  → deployment: Reyes Contracting

Inbound call to +1 512…
   → Twilio trunk → OpenAI Realtime SIP
   → OpenAI fires `realtime.call.incoming` (sip_headers carry To = +1512…)
   → [EXISTING] resolveDeploymentByNumber("+1512…") → Pine Dental deployment
   → [EXISTING] loadDeploymentVoiceContext → template persona + builder-org booking
   → OpenAI session accepted with that persona → answers + books
```

The **only new runtime path** is provisioning (buy + attach). The inbound/answer/book path is unchanged and already merged.

---

## Configuration & secrets

Platform-level Twilio credentials live in **environment variables** (Max sets them in Vercel; Claude never handles the raw values):

| Env var | Meaning |
|---|---|
| `TWILIO_PLATFORM_ACCOUNT_SID` | The platform Twilio account SID (v1: the FixlyAI account hosting the 839 line). |
| `TWILIO_PLATFORM_AUTH_TOKEN` | Auth token for that account. |
| `TWILIO_VOICE_TRUNK_SID` | The Elastic SIP Trunk (`TK…`) whose origination points at OpenAI Realtime SIP. |

A small accessor (e.g. `lib/telephony/config.ts`) reads + validates these and exposes a typed `getPlatformTelephonyConfig()` that **throws a clear, actionable error** if any is missing (mirrors the `configured:false` discipline — never silently proceed). Provisioning UI/actions surface "telephony not configured" rather than a raw crash when env is absent (e.g., local dev without creds).

> Rationale: provisioning numbers for builders is a **platform** operation, not a per-workspace one, so it must not read `organizations.integrations.twilio`. In v1 the platform account *is* Max's account; when per-builder subaccounts land (fast-follow), this accessor grows a `subaccountSid` parameter.

---

## Data model change

One additive column on `deployments`:

- **`phone_number_sid`** (`text`, nullable) — the Twilio `PN…` SID of the provisioned number. Needed to attach to the trunk, detach, and release. Distinct from `phone_number` (the human E.164).

Optional (decide in plan): **`number_origin`** (`text` enum `provisioned | byo`, nullable) to distinguish numbers SeldonFrame bought (and must release on cancel) from builder-owned numbers pasted via the legacy path (must NOT release). If omitted, infer from `phone_number_sid` presence (provisioned ⇔ has a SID).

Additive Drizzle migration + journal entry, following the loud-fail migration guard (#95). No backfill needed (existing deployments have null `phone_number_sid`).

---

## The provisioning service

New module `packages/crm/src/lib/telephony/`:

### `twilio-platform.ts` — thin REST client (DI-friendly)
A small interface wrapping the three REST endpoints, constructed from `getPlatformTelephonyConfig()`. Defined as a TypeScript interface so tests inject a fake:

```ts
export interface TwilioTelephonyClient {
  // GET /2010-04-01/Accounts/{Acct}/AvailablePhoneNumbers/US/Local.json?AreaCode&VoiceEnabled=true
  searchLocalVoiceNumbers(input: { areaCode: string; limit?: number }): Promise<AvailableNumber[]>;
  // POST /2010-04-01/Accounts/{Acct}/IncomingPhoneNumbers.json  (PhoneNumber, FriendlyName; NO VoiceUrl)
  buyNumber(input: { phoneNumber: string; friendlyName: string }): Promise<{ sid: string; phoneNumber: string }>;
  // POST https://trunking.twilio.com/v1/Trunks/{TrunkSid}/PhoneNumbers  (PhoneNumberSid)
  attachNumberToTrunk(input: { phoneNumberSid: string }): Promise<void>;
  // DELETE /2010-04-01/Accounts/{Acct}/IncomingPhoneNumbers/{Sid}.json
  releaseNumber(input: { phoneNumberSid: string }): Promise<void>;
}
```

A `createTwilioTelephonyClient(config)` builds the real one (Basic auth = `accountSid:authToken`, base64). Releasing a number on Twilio also detaches it from the trunk automatically; explicit trunk-detach is not required for release.

### `provision-voice-number.ts` — orchestration with an idempotent state machine

`provisionVoiceNumber(deps, { deploymentId, areaCode })`:

State derived from the deployment row, so retries are safe and never double-buy or orphan a paid number:

```
state(deployment):
  has phone_number + phone_number_sid + status active   → ALREADY_DONE  (no-op, return current number)
  has phone_number_sid, not attached/active             → PURCHASED     (resume at attach)
  none                                                  → NONE          (start at search/buy)
```

Sequence:
1. **NONE → search** the area code for a voice-capable local number; if none, return a typed `no_numbers_available` error.
2. **buy** it (`FriendlyName = "<clientName> (<deploymentId>)"`). **Immediately persist** `phone_number` + `phone_number_sid` on the deployment (still `draft`) — this is the durability point: a crash after buy leaves a recoverable PURCHASED state, not a leaked number.
3. **PURCHASED → attach** the `PN…` to the trunk. On success, flip deployment `status = active`.
4. Return `{ phoneNumber }`.

Error handling — map Twilio failures to typed, user-facing errors (never leak raw Twilio errors to the UI):
- search empty → `no_numbers_available` ("No numbers free in that area code — try another.")
- buy declined / insufficient Twilio balance → `provisioning_unavailable` (alert Max; the platform account funds it).
- attach failure → leave row in PURCHASED, return `attach_failed` with a retry affordance (re-running `provisionVoiceNumber` resumes at attach).
- The partial-unique index still guards `phone_number` (defense in depth; the provisioned number is globally new so collisions shouldn't occur, but the BYO path can still hit `phone_in_use`).

### Reconciliation (lightweight, optional in v1)
A `releaseOrphans` helper that finds deployments with a `phone_number_sid` but `status in (draft)` older than N minutes and either resumes attach or releases — guards against rare crash-after-buy. Can be a manual script in v1; cron later.

---

## Server actions

In `lib/deployments/actions.ts` (org-guarded, same pattern as existing actions):

- **`provisionDeploymentNumberAction({ deploymentId, areaCode })`** — the new **primary** activate path. Calls `provisionVoiceNumber`. Returns `{ phoneNumber }` or a typed error. Org-guards that the deployment belongs to the caller's builder org.
- **Keep `activateDeploymentAction({ deploymentId, phoneNumber })`** — the existing **secondary** "use a number I already own" path (paste an E.164 you've configured against the trunk yourself). Unchanged.
- **Extend cancel** — when a deployment with a provisioned number (`phone_number_sid` present, `number_origin = provisioned`) is canceled, **release the number** (`releaseNumber`) and null `phone_number`/`phone_number_sid` so we stop paying and free it. **Pause keeps** the number (matches existing `pauseDeploymentAction` preserving `phoneNumber`).

---

## UI

In the Deploy/Clients activate surface (`/studio/agents/[id]/deploy` review step and/or `/studio/clients` `ActivateForm`):

- Primary affordance: **"Get a number"** → an **area-code input** (default to the client's area code if derivable from `clientContact`, else a sensible default) → on submit, calls `provisionDeploymentNumberAction` → shows a spinner ("Provisioning…") → on success shows the **live E.164** and flips the deployment card to **Active**.
- Secondary/advanced (collapsed): **"Use a number I already own"** → the existing paste field → `activateDeploymentAction`.
- Error states: `no_numbers_available` ("Try a different area code"), `provisioning_unavailable` (contact-support tone), `attach_failed` (retry button).

No new design system needed — reuse the existing Studio components + `StudioTabs`.

---

## Number lifecycle summary

| Event | Twilio action | DB |
|---|---|---|
| Activate (provision) | search → buy → attach to trunk | set `phone_number`, `phone_number_sid`, `number_origin=provisioned`, `status=active` |
| Activate (BYO) | none (builder pre-configured) | set `phone_number`, `status=active` (no SID) |
| Pause | none (keep number) | `status=paused`, keep number fields |
| Cancel | release provisioned number (auto-detaches from trunk) | `status=canceled`, null `phone_number`/`phone_number_sid` |

---

## Out of scope for v1 (deferred — captured so we build it right)

- **Per-builder subaccounts + passthrough wallet (Phase 3 / billing).** Research-backed plan: one Twilio subaccount per builder; meter cost via `Usage/Records?...&Category` summed by `totalprice` per subaccount; hold a wallet in our DB; `Status=suspended` the subaccount at zero. Provision numbers *directly in the subaccount* (moving numbers re-triggers A2P + breaks STOP lists). v1 absorbs the ~$1.15/mo + voice minutes on the single platform account.
- **Outbound SMS + per-client ISV A2P 10DLC.** Compliant model = SeldonFrame as ISV Primary profile + per-client Secondary Customer Profile → Brand → Campaign → Messaging Service, driven by a self-serve client intake portal. 10–15 day campaign approval + per-number registration + fees. Its own spec later.
- **Per-deployment usage/cost attribution** (reconstruct from the Call resource).
- **Number pool pre-warming** (only relevant once outbound-SMS A2P registration latency matters).

---

## MUST-VERIFY (non-blocking; confirm during implementation / live test)

1. **OpenAI webhook `To` user part.** Capture one real inbound call to a newly provisioned number and confirm the dialed E.164 arrives in `realtime.call.incoming` `sip_headers[].name=="To"` exactly as `resolveDeploymentByNumber` expects (normalization parity). This is the single most important live check.
2. **Max numbers per trunk.** Twilio publishes none; fine for the wedge — confirm headroom with the Twilio rep before high N.
3. **REST parameter casing** — raw REST is PascalCase (`AreaCode`, `PhoneNumber`); if using the `twilio` helper lib it's camelCase. Match the chosen client path.
4. **Buy → attach latency / availability** in the chosen area code (search may return empty for scarce area codes — the `no_numbers_available` path must be graceful).
5. **Release auto-detach** — confirm `DELETE IncomingPhoneNumbers/{Sid}` cleanly removes it from the trunk (expected) vs requiring an explicit trunk-detach first.

---

## Testing strategy

- **TDD pure logic** against a fake `TwilioTelephonyClient`:
  - the provisioning **state machine** (NONE / PURCHASED / ALREADY_DONE transitions; idempotent re-run resumes at attach; never double-buys);
  - **area-code validation** (3-digit NANP) and `FriendlyName` composition;
  - **Twilio-error → typed-user-error** mapping;
  - **lifecycle**: cancel releases a provisioned number but not a BYO number; pause keeps it.
- **No live calls in unit tests** (matches the existing voice harness — unit tests assert wiring only).
- **Live verification (Max):** set the 3 env vars → provision a real number via the UI for a test deployment → place a real inbound call → confirm it answers as the template + books → confirm the 839 line still works → cancel and confirm the number is released. Watch the existing `voice_call_deployment_resolved` log.
- Full-branch `tsc` via the local binary: `packages/crm/node_modules/.bin/tsc -p packages/crm/tsconfig.json --noEmit` (npx fetches the wrong tsc). Run `check-use-server`.

---

## Risks & mitigations

- **Orphaned paid numbers** (crash between buy and attach) → persist `phone_number_sid` immediately after buy; idempotent resume; optional `releaseOrphans` reconciliation.
- **Env not configured in an environment** → `getPlatformTelephonyConfig()` throws actionable error; UI shows "telephony not configured" rather than crashing.
- **Releasing a BYO number by mistake** → `number_origin`/SID-presence guard ensures only provisioned numbers are released on cancel.
- **OpenAI `To` mismatch** → MUST-VERIFY #1 before relying on it at scale (the 839 line already proves the mechanism).
```
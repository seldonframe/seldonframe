# Multi-Surface Runtime — Inbound SMS + Email through the Agent Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Route inbound SMS + email through the agent loop (`executeTurn`) instead of the tool-less `conversation/runtime.ts`, so an agent can book/qualify/escalate over text + email — multi-surface, via one channel-adapter seam. Reuses everything shipped (tools, validators, the bridge's client-org scoping).

**Architecture:** A `ChannelAdapter` (parse inbound + send reply) feeds a single `runChannelTurn` orchestrator: resolve the target agent → get-or-create an `agentConversations` thread → `executeTurn` → adapter sends the reply. The deterministic message-triggers path (missed-call-text-back etc.) is untouched — only the LLM-reply path moves to the agent loop, guarded so unbound workspaces are unchanged.

**Tech Stack:** Next.js 16 / React 19, Drizzle/Neon, `node:test` + `tsx`. Conventions: tests `cd packages/crm && node --import tsx --test <files>`; tsc `packages/crm/node_modules/.bin/tsc -p packages/crm/tsconfig.json --noEmit` (0 NEW errors; ~10 `.next/types` React-19 baseline); `bash scripts/check-use-server.sh src`; `node scripts/check-migrations-journaled.mjs`; DI network/DB in unit tests; TDD; commit per task.

## Locked decisions (from the seam recon)
- **`executeTurn(input:{conversationId, userMessage, blueprintOverride?})`** (`lib/agents/runtime.ts:73`) builds its own `ToolExecuteContext` from the loaded agent→org→conversation. Returns `{ok:true, assistantMessage,…} | {ok:false, reason, fallbackMessage}`.
- **Agent resolution (unified resolver):** for an inbound number/address, FIRST `resolveDeploymentByNumber(toNumber)` (`lib/agents/voice/resolve-deployment-by-number.ts`) → if matched, the **client workspace's default agent** (`agents` where `orgId = deployment.clientOrgId, slug = "default"`) → writes land in the client org automatically (the bridge already created that workspace + agent). ELSE `resolveOrgByFromNumber(toNumber)` (the workspace) → that workspace's `slug="default"` agent. No agent-model unification needed.
- **Conversation scoping:** `agentConversations` (agent-scoped), `channelMeta = {channel, fromHandle, contactId}`; get-or-create the active thread for (agentId, contact/handle).
- **Reply-sending stays the caller's job:** `executeTurn` returns text; the adapter sends via `sendSmsFromApi` / `sendEmailFromApi` (preserves suppression + audit). 
- **SMS swap point:** `app/api/webhooks/twilio/sms/route.ts:426` (`handleIncomingTurn` → `runChannelTurn`). Keep the trigger dispatch at `:365` and the `conversationOwnsReply` guard.
- **Inbound email is NET-NEW** (today `webhooks/resend/route.ts` is outbound-status only). Needs a new inbound route + to-address→org resolution. Resend Inbound (MX + webhook) is an **operator config step**, not code — flag it.
- **Fallback:** no default agent for the resolved org → log + fall back to today's behavior (or skip), so nothing regresses.

## Scope
v1 = SMS reroute + inbound email, workspace **and** deployment-number resolution (deployment SMS → client workspace's default agent → client org). **Deferred:** native social DM (IG/WA/Messenger via a thin provider) + the Studio multi-surface builder UI (#3) + Postiz/MCP (#2). Setting the SMS webhook on provisioned deployment numbers is included (Task 4).

---

## Task 1: Channel-adapter seam + unified resolver + orchestrator (TDD)

**Files:** Create `packages/crm/src/lib/agents/channels/channel-adapter.ts`, `packages/crm/src/lib/agents/channels/run-channel-turn.ts`; Test `packages/crm/tests/unit/agents/channels/run-channel-turn.spec.ts`.

- [ ] **Step 1: Recon + types.** Read `runtime.ts` `executeTurn`, the `agents`/`agentConversations` schema, `resolve-deployment-by-number.ts`, and `twilio/sms/route.ts`'s `resolveOrgByFromNumber`. Define:
```typescript
export type InboundMessage = { channel: "sms" | "email"; fromHandle: string; toHandle: string; text: string; contactId?: string | null; metadata?: Record<string, unknown> };
export type ChannelAdapter = { sendReply(target: { fromHandle: string; toHandle: string; orgId: string; contactId?: string | null }, text: string): Promise<void> };
export type ResolvedAgent = { agentId: string; orgId: string } | null;
```

- [ ] **Step 2: Failing tests** for the pure resolver + orchestrator (DI everything):
```
// resolveInboundAgent: deployment-number match → client workspace default agent (orgId = clientOrgId)
// resolveInboundAgent: no deployment, workspace number match → workspace default agent
// resolveInboundAgent: neither → null
// runChannelTurn: resolves agent → get-or-create conversation → executeTurn → adapter.sendReply called with assistantMessage
// runChannelTurn: executeTurn {ok:false} → no reply sent, returns handled:false (soft)
// runChannelTurn: resolver null → returns {handled:false, reason:"no_agent"}, executeTurn NOT called
```

- [ ] **Step 3: Implement** `resolveInboundAgent(deps, toHandle)` (DI: `resolveDeploymentByNumber`, `loadDefaultAgent(orgId)`, `resolveOrgByFromNumber`) + `runChannelTurn(deps, inbound, adapter)` (DI: `resolveInboundAgent`, `getOrCreateConversation`, `executeTurn`). Orchestrator: resolve → if null return `{handled:false, reason:"no_agent"}` → get-or-create conversation (channelMeta) → `executeTurn({conversationId, userMessage: inbound.text})` → on `ok` call `adapter.sendReply({...}, assistantMessage)` → return `{handled:true, conversationId}`. Soft-fail throughout (catch → `{handled:false, reason}`).

- [ ] **Step 4: Run → pass.** **Step 5: Commit** `feat(agents): channel-adapter seam + unified inbound resolver + runChannelTurn`.

---

## Task 2: Surface types (+ sms, + email)

**Files:** Modify `packages/crm/src/lib/agent-templates/store.ts` (`AgentSurface`, `capabilitiesForSurface`); `packages/crm/src/db/schema/deployments.ts` (`DeploymentSurface`).

- [ ] **Step 1:** `AgentSurface = "voice" | "chat" | "sms" | "email"`; extend `capabilitiesForSurface` so `sms`/`email` map to the chat capability set (book/reschedule/cancel/find/escalate/take-message/faq — no voice-only read-back). `DeploymentSurface = "phone" | "embed" | "link" | "sms" | "email"`. `agents.channel` already has `sms`/`email` (no change). Update any exhaustive `switch`/spec that enumerates surfaces (grep for `AgentSurface`/`surfaceForType` usages + the nav/store specs).

- [ ] **Step 2:** Run the affected unit specs (agent-templates store) → green. **Step 3: Commit** `feat(agents): sms + email surfaces in the type unions`.

---

## Task 3: SMS reroute — swap the LLM-reply path to the agent loop

**Files:** Modify `packages/crm/src/app/api/webhooks/twilio/sms/route.ts`; Create `TwilioSmsAdapter` in `channel-adapter.ts`; Test the route handler's reroute (or the adapter + a route-level integration where the repo pattern allows).

- [ ] **Step 1:** `TwilioSmsAdapter.sendReply` wraps `sendSmsFromApi({orgId, userId:null, contactId, toNumber: target.fromHandle, body})`.

- [ ] **Step 2:** In `route.ts`, at the **Path B** block (~:405-453, guarded by `!conversationOwnsReply` + `shouldAutoReplyForIntent`): replace the `handleIncomingTurn` call (~:426) with:
```
const res = await runChannelTurn(realDeps, { channel:"sms", fromHandle: fromNumber, toHandle: toNumber, text: inboundBody, contactId }, TwilioSmsAdapter);
if (!res.handled) { /* log res.reason; existing fall-through (no reply) */ }
```
Leave **Path A** (`dispatchTwilioInboundForMessageTriggers`, ~:365), the `conversationOwnsReply` early-return, org resolution, and contact upsert UNCHANGED. The intent-gate (`classifyInboundIntent`/`shouldAutoReplyForIntent`) stays in front of the reroute.

- [ ] **Step 3: Tests (bug-catch):** inbound SMS with a default agent → `runChannelTurn` invoked + `sendSmsFromApi` called with the agent's reply (DI'd); the trigger-dispatch path still fires; `conversationOwnsReply=true` still early-returns; no-default-agent → no reply + logged (no throw). Confirm `handleIncomingTurn` is no longer on the auto-reply path.

- [ ] **Step 4: Commit** `feat(sms): inbound SMS replies run through the agent loop (tools), triggers untouched`.

---

## Task 4: Set the SMS webhook on provisioned deployment numbers

**Files:** Modify `packages/crm/src/lib/telephony/provision-voice-number.ts` (+ `twilio-client.ts`) — recon first.

- [ ] **Step 1: Recon:** confirm where a provisioned number's webhooks are set. Today voice attaches to the SIP trunk; SMS inbound needs the number's **SMS URL** (or a Messaging Service) pointed at `/api/webhooks/twilio/sms`. Find the `IncomingPhoneNumbers` update call.

- [ ] **Step 2:** When provisioning (or in a follow-up step), set the number's `smsUrl = <APP_URL>/api/webhooks/twilio/sms` (POST). Idempotent + soft-fail (don't break voice provisioning). So a deployment number answers **calls + texts**, both → the client org.

- [ ] **Step 3: Test** the client method sets `smsUrl` (DI'd Twilio client). **Step 4: Commit** `feat(telephony): point provisioned numbers' SMS webhook at SeldonFrame (multi-surface number)`.

---

## Task 5: Inbound email (net-new) on the same seam

**Files:** Create `packages/crm/src/app/api/webhooks/email/inbound/route.ts`; `ResendEmailAdapter` in `channel-adapter.ts`; helper `resolveOrgByInboundAddress(toAddress)`; Test the resolver + adapter wiring.

- [ ] **Step 1: Recon:** Resend Inbound payload shape (or whichever inbound provider) + how a workspace's inbound address maps to an org (custom domain on `organizations`, or `<slug>@inbound.seldonframe…`). Confirm against `webhooks/resend/route.ts` + the domain model.

- [ ] **Step 2:** `resolveOrgByInboundAddress(toAddress)` → orgId (by custom domain / slug). `ResendEmailAdapter.sendReply` wraps `sendEmailFromApi({orgId, toEmail: target.fromHandle, subject: "Re: …", body, ...})`.

- [ ] **Step 3:** The inbound route: verify the provider signature → parse `{from, to, subject, text}` → `runChannelTurn(realDeps, { channel:"email", fromHandle: from, toHandle: to, text, contactId? }, ResendEmailAdapter)`. Soft-fail; 200 always (so the provider doesn't retry-storm).

- [ ] **Step 4: Tests:** address→org resolution; the route invokes `runChannelTurn` + sends the reply (DI'd); unknown address → 200, no send. **Step 5: Commit** `feat(email): inbound email replies run through the agent loop`.
  - **Flag in the report:** enabling inbound email requires an operator config step (Resend Inbound MX + webhook URL) — code-ready, ops-pending.

---

## Task 6: Verify
- [ ] Suites: `cd packages/crm && node --import tsx --test tests/unit/agents/**/*.spec.ts tests/unit/agent-templates/*.spec.ts` + any touched → green.
- [ ] `tsc` 0 new; `check-use-server` clean; migrations-journaled (only if a schema column was added — likely none) 0 orphans.
- [ ] **Report:** the regression statement (voice + web-chat `executeTurn` paths unchanged; SMS trigger-dispatch + `conversationOwnsReply` untouched; `handleIncomingTurn` off the auto-reply path but still importable for any other caller), the new-test count, and the honest gap — unit-verified; live gate = text a workspace number → agent replies with tools; text a deployment number → client-org agent replies; (email) after Resend-inbound config, email a workspace address → agent replies.

## Self-Review
- Spec coverage: channel-adapter seam (T1) ✓; SMS reroute keeping triggers (T3) ✓; deployment-SMS → client org via the bridge's default agent (T1 resolver) ✓; multi-surface number (T4) ✓; inbound email (T5) ✓; surfaces (T2) ✓.
- Deferred (noted): native social DM via thin provider; Studio multi-surface builder UI (#3); MCP/Postiz (#2).
- Type consistency: `InboundMessage`/`ChannelAdapter`/`runChannelTurn` defined once (T1) + reused (T3, T5); `AgentSurface` extended once (T2).

# 2026-07-07 — MCP: deploy a real agent from one sentence

## Objective
`use seldonframe mcp to create a google review requester for a dentist` (via
Claude Code / any MCP client) produces a **deployed, event-firing agent** — a
`booking.completed`-triggered review-requester that can send a real test message
today — NOT static message templates + a brain doc. Generalizes to any agent the
generator can classify (speed-to-lead, receptionist, etc.).

## Root cause (recon, 2026-07-07)
- **The generator exists and works.** `runGenerateAgentDraft(deps, {sentence,
  reviewUrl?})` (`lib/agents/generate/run-generate.ts:251`) → LLM author
  (`author-llm.ts`) with a deterministic `parseAgentIntent` fallback
  (`parse-intent.ts:193`; it has a literal `review-requester` regex at :57-58 →
  `trigger:{kind:"event",event:"booking.completed",channel}` at :142) →
  `assembleAgentBundle` → a full `AgentBundle` (trigger + skill + guardrails +
  verify rubric + tool bindings) persisted as an **`agent_templates`** row via
  `createAgentTemplate`/`updateAgentTemplate`.
- **The MCP can't reach it.** `generateAgentDraftAction` is a `"use server"`
  action used ONLY by Studio dashboard React components. There is **no
  `/api/v1/**` route** that calls the generator, and the MCP server only speaks
  HTTP to `/api/v1/*`. (Grep: zero `generateAgentDraftAction`/`runGenerateAgentDraft`
  refs under `skills/mcp-server/` or `app/api/**`.)
- **MCP `create_agent` is the wrong entity.** It writes the `agents` table
  (web-chat widget only, archetype enum `["website-chatbot","voice-receptionist",
  "sms-followup-bot"]`, **no trigger concept**) — a different table from the
  `agent_templates` rows the generator writes and `deploy_agent` consumes. No MCP
  verb bridges sentence → `agent_templates` row.
- **`deploy_agent` works** (`POST /build/deploy` → `runDeploy`, returns
  `live|needs_connect|disabled`, binds phone/activates trigger) — but requires a
  `template_id` that nothing in the MCP can produce.
- **Send gap:** `lib/sms/api.ts` is strictly BYO-Twilio (no managed fallback →
  422 on a fresh workspace); `lib/emails/api.ts` HAS a platform `RESEND_API_KEY`
  fallback (works day-one). The `review-requester` starter defaults `channel:"sms"`.

## The fix (reuse the generator; add the missing wire)

### P1 — expose the generator over HTTP (the one missing wire)
New route **`POST /api/v1/agents/generate`** (`app/api/v1/agents/generate/route.ts`):
- Auth: same bearer/org-scope as sibling `/api/v1/agents` routes (resolve orgId
  from the authed session/key, never `body.orgId`).
- Body: `{ description: string, review_url?: string }`.
- Wires deps and calls `runGenerateAgentDraft(deps, { sentence: description,
  reviewUrl: review_url })` — deps = `{ create: createAgentTemplate/updateAgentTemplate,
  aiClient: getAIClient({orgId}) (BYOK→platform, like customizeLandingR1), db }`.
  The deterministic `parseAgentIntent` fallback means it still classifies
  "review requester" even without a strong LLM key.
- Returns `{ ok:true, template_id, name, trigger, channel, warnings }` (or
  `{ ok:false, error }`). Fail-soft: never 500 on a classify miss — return a
  `warnings`/`error` the caller can relay.

### P1 — the MCP verb (the first-class path)
New MCP tool **`generate_agent`** (`skills/mcp-server/src/tools.js`) → `POST
/api/v1/agents/generate`. Description makes it THE way to build an agent from a
sentence: "Build a working AI agent from a plain-English description (e.g. 'a
Google review requester for a dentist', 'a speed-to-lead texter', 'an after-hours
receptionist'). Returns a template_id — then call **deploy_agent** to make it
live and firing. USE THIS (not create_agent) for any agent that DOES something on
an event/schedule; create_agent is only for a website chat widget."
- Also **update `create_agent`'s description** to disambiguate ("website chat
  widget only — for an agent that acts on bookings/leads/schedule, use
  generate_agent").
- The end-to-end MCP flow becomes: `generate_agent(description)` → `deploy_agent(
  template_id)` → live + `booking.completed`-wired. Optionally add a `deploy:true`
  convenience later; keep two-step for now so deploy's `needs_connect` wizard flow
  is preserved.

### P2 — day-one delivery (so the demo ends on a real send, not a 422)
Make a freshly-generated event-outbound agent DELIVER without BYO Twilio:
- In the generate pipeline (or the deploy path), when the classified channel is
  `sms` and the workspace has no live Twilio (`twilio.configured===false`) but
  email IS available (managed `RESEND_API_KEY`), **default/emit the agent with an
  email channel** (or email-primary + SMS-when-connected), so `runEventAgent`'s
  `sendEmail` path (managed fallback) delivers a real test today. Surface "connect
  Twilio to also text customers" as an optional upgrade in the tool's return, not
  a blocker. (Full managed-SMS is a separate, larger telephony/billing build —
  out of scope here.)
- Confirm `emails/api.ts`'s `RESEND_API_KEY` + `resolveDefaultFromEmail()`
  fallback actually sends from a fresh workspace before relying on it.

## Constraints / invariants
- **Reuse the generator** — do NOT rebuild parse-intent/agent-bundle; only add the
  HTTP route + MCP tool + the channel-default tweak. (§Reuse-don't-rebuild.)
- Additive: new route + new MCP tool + a small generate-pipeline channel default.
  No migration (agent_templates already exists). Org-scope every query.
- The generator uses an LLM — wire `getAIClient` with the deterministic
  parse-intent fallback so it works even on a weak/absent key.
- `skills/mcp-server` version bump rides the last wave (one `npm publish`).

## Validation (stop condition)
- `/verify-build` (unit for the route's dep-wiring + the channel-default predicate;
  tsc; use-server; no migration; regression grep leaves `lib/agents/generate/*`
  core untouched).
- **The real MCP smoke** (the whole point): call `generate_agent("a google review
  requester for a dentist")` → assert it returns a `template_id` with
  `trigger.event === "booking.completed"` and skill `review-requester`; call
  `deploy_agent(template_id)` → assert `live` (or `needs_connect` only for a
  genuine OAuth/phone requirement); trigger a `booking.completed` (or the deploy's
  test hook) → assert a real message is composed + a test **email** is sent
  (managed Resend), not a 422.
- Independent **opus** review (new HTTP surface + auth + it's the product's front
  door). Then merge gate.

## What this fixes (the before/after)
- **Before:** "create a review requester" → `create_contact` + `send_sms`(422) +
  `write_brain_note` = a doc.
- **After:** "create a review requester" → `generate_agent` (classifies →
  `agent_templates` row with `booking.completed` trigger + review skill +
  guardrails) → `deploy_agent` (live, trigger active) → fires after every booking,
  sends a real message (email day-one; SMS when Twilio connected). A live worker,
  not a doc.

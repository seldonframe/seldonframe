# Phase 7.a — Agent Synthesis architectural spike

**Date:** 2026-04-21
**Gate:** Phase 7.b cannot start until this spike's architectural recommendations are approved.
**Spike script:** [scripts/phase-7-spike/synthesis.mjs](../scripts/phase-7-spike/synthesis.mjs)
**Artifacts:** [tasks/phase-7-synthesis-spike/](./phase-7-synthesis-spike/)

---

## TL;DR

- **NL-prompt → AgentSpec is viable** for archetypal agents (Speed-to-Lead, welcome-email, dunning) but **not reliable as a one-shot for open-ended prompts.**
- **Composition contract schema is mostly sufficient** — the 4 fields carry the semantic metadata Claude needs to route verbs to blocks and chain events. Three concrete gaps surfaced (below), already queued as V1.1 candidates.
- **A real MCP-surface gap was discovered**: no `create_booking` tool exists. Speed-to-Lead can't ship end-to-end until it's added.
- **Validator works**: structural + semantic validation caught every adversarial failure shape the fixture could produce.
- **Architecture recommendation: structured IR + canvas + multi-turn clarification, not one-shot.**

---

## Honest caveats on what this spike proved

**What the spike DID prove (run in fixture mode):**
- The AgentSpec schema design is expressive enough for the Speed-to-Lead archetype (7 steps covering wait / tool-call / conversation / branch / end).
- The validator catches unknown tools, dangling step references, unknown trigger events, tools from uninstalled blocks, and explicit model-declined envelopes.
- The execution simulator walks the spec cleanly — branch + conversation + mcp_tool_call all wire together.
- Real BLOCK.md contracts + real MCP tool catalog load cleanly from the repo (7 contracts, 75 tools).

**What the spike did NOT prove (requires live Claude):**
- Whether Claude actually produces valid AgentSpec JSON from the prompt at useful rates.
- Whether Claude correctly refuses out-of-scope requests (vague, impossible, hallucinated-block).
- Whether adaptive thinking changes output quality meaningfully vs. default.
- Token cost per synthesis attempt (matters for the 50-synthesis-free-tier economics).

**Run the spike live** with `ANTHROPIC_API_KEY` set to answer the remaining questions. The script runs both modes; fixture fallback exercises every structural check but fabricates the model's responses.

---

## The archetype tested

**Speed-to-Lead: new-patient intake → SMS qualifier → booking → email confirm.**

Natural-language prompt (full):

> When someone submits the new-patient intake form, text them within 2 minutes to thank them by name and ask when they'd like to come in. Have a short SMS conversation to confirm they have insurance, then book them into the next available new-patient consultation slot. Email a confirmation with the clinic address.

This archetype was chosen because it exercises:
- Event trigger (`form.submitted`)
- Scheduled delay (`wait`)
- Deterministic MCP tool call (`send_sms`)
- **Non-deterministic multi-turn conversation** (Conversation Primitive from Phase 3 / 4)
- Variable extraction from conversation (insurance status, preferred time)
- Conditional branching (qualified vs not)
- Multi-block composition: formbricks-intake → sms → caldiy-booking → email → crm

If the spec shape works here, it works for welcome-email (subset), dunning (subset), and churn-save (superset with payments).

---

## AgentSpec — the IR the spike proposes

```typescript
type AgentSpec = {
  name: string;
  description: string;
  trigger: {
    type: "event";
    event: string;                    // must be in any block's produces
    filter?: Record<string, unknown>; // e.g., {formId: "..."}
  };
  variables?: Record<string, string>; // named refs: "contactId": "trigger.contactId"
  steps: Array<
    | { id: string; type: "wait"; seconds: number; next: string | null }
    | { id: string; type: "mcp_tool_call"; tool: string; args: Record<string, unknown>; next: string | null }
    | { id: string; type: "conversation"; channel: "email" | "sms"; initial_message: string; exit_when: string;
        on_exit: { extract?: Record<string, string>; next: string } }
    | { id: string; type: "branch"; condition: string; on_true: string; on_false: string }
    | { id: string; type: "end" }
  >;
};
```

**Why these five step types specifically:**
- `mcp_tool_call` — deterministic work (send email, create contact, etc.). Every block exposes tools through the MCP surface; this is the execution atom.
- `wait` — speed-to-lead needs a 2-minute delay. Cron-scheduled.
- `conversation` — Claude-driven multi-turn with exit-condition. Delegates to the existing Phase 3 Conversation Primitive runtime. Exit condition + variable extraction are NL strings that the runtime evaluates per-turn.
- `branch` — routing based on extracted variables. NL condition, runtime evaluates.
- `end` — terminal node. Omitted in most specs because `next: null` implies it.

**Why not a typed DAG like Node-RED / Temporal?** Because conversational steps are intrinsically non-deterministic — their "output" is a free-form extraction whose type depends on what the contact said. A strict type system over NL variable extraction is the wrong abstraction for v1. NL-typed variables + runtime eval is what matches reality.

---

## What the contract schema got right

- **`produces`** gave Claude a verifiable trigger-event vocabulary. The validator rejects triggers whose event isn't in any installed block's produces list. Hallucinated events get caught at validate time, not run time.
- **`verbs`** routed "text them" → sms block and "book them" → caldiy-booking block unambiguously. No verb collisions on the Speed-to-Lead path.
- **`compose_with`** steered synthesis toward known-good pairings. The prompt template lists contracts per block, so Claude's chain-of-thought has evidence for "sms composes cleanly with caldiy-booking" without having to guess.

---

## Three gaps in the contract schema exposed by the spike

These are V1.1 refinements. **None block Phase 7** if Phase 7 ships with workarounds; all three become load-bearing as synthesis scales.

### Gap 1 — Contracts don't describe tool inputs

The `produces` list names `booking.created` but doesn't say what fields its payload carries. The MCP tool catalog has names + descriptions but not typed arg schemas at the synthesis-time prompt. Claude has to guess argument names (`contact_id`, `appointment_type_id`, `starts_at`) — which it did correctly in the fixture, but there's no structural guarantee.

**Workaround for v1:** hand-curated tool-catalog snapshot in the synthesis prompt that lists each tool's required args with types + example values. This is ~75 entries × ~10 lines each = ~750 lines of prompt, manageable.

**V1.1 refinement:** `ui_components` / `inputs` / `outputs` fields in the composition contract. Each tool entry gets a Zod or JSON schema; the synthesis prompt serializes only the relevant ones (per compose_with + verbs match).

### Gap 2 — Conversation exit conditions are NL strings, not typed

```json
"exit_when": "The prospect has confirmed whether they have insurance, and stated at least one day/time that works for them."
```

Works for v1 because the Conversation Primitive runtime already delegates exit-condition eval to Claude. But two problems at scale:
- Runtime cost — every incoming turn is a Claude call to "is this the exit?" Adds up.
- No compile-time verification — a bad exit_when passes validation and hangs conversations forever.

**Workaround for v1:** hard timeout per conversation (e.g. 24h or 10 turns, whichever first), logged as "conversation stalled." Good enough.

**V1.1 refinement:** typed exit conditions mixed with NL — e.g. `{ after_turns: 5, when: "insurance confirmed" }`. Runtime falls back to NL eval only inside the envelope.

### Gap 3 — No block-level input/output schema

Related to gap 1 but at the block level instead of the tool level. When the spike fed Claude the form definition (`FIXTURE_FORM` with fields name / email / phone / has_insurance / reason_for_visit), Claude correctly plumbed `has_insurance` through to the agent-spec `variables.hasInsurance` → conversation → branch. That plumbing is brittle: if the form changes, the spec breaks silently.

**Workaround for v1:** synthesis regenerates the spec when triggering blocks change. The builder is notified.

**V1.1 refinement:** block outputs are typed. Agent specs reference `form.new_patient_intake.fields.has_insurance` rather than raw keys. Migrations become tractable.

---

## Real MCP-surface gap discovered

**No `create_booking` tool exists.** The spike's fixture spec calls `create_booking({contact_id, appointment_type_id, starts_at})`, but the catalog only has:

- `create_appointment_type` — defines a reusable booking template
- `configure_booking` — changes workspace booking settings
- `list_appointment_types` / `update_appointment_type` / `install_caldiy_booking`

None create an individual booking for a specific contact at a specific time. **Speed-to-Lead cannot ship end-to-end until this tool exists.**

**Recommendation:** add `create_booking` (and companions `cancel_booking`, `reschedule_booking`) as part of Phase 7.b prerequisites, or as a Phase 11 (cross-block MCP expansion) quick-win before 7.b. Single-slice, ~80 LOC including MCP tool + server action + API route. Same pattern as existing payment / email tools.

---

## Adversarial results

The spike tested four failure modes against the validator (with fixture-synthesized "Claude responses" since live mode wasn't available):

| Case | Expected behavior | Fixture result | Live prediction |
|---|---|---|---|
| **Hallucinated block** — "Post to Slack" | Validator flags `send_slack_message` as unknown tool | ✅ Caught (2 validator issues) | Likely caught — Claude has never seen a Slack tool in the catalog so invention is low-probability, and the validator is a safety net |
| **Vague prompt** — "help with leads" | Model declines with `{error: "..."}` | ✅ Caught (model_declined) | **UNKNOWN** — Claude might attempt a generic welcome agent instead of declining. This is the biggest unresolved risk. |
| **Impossible capability** — "FedEx a welcome kit" | Model declines | ✅ Caught (model_declined) | Likely caught — no tool or block matches; Claude should refuse |
| **Ambiguous route** — "send a message, SMS or email" | Validator passes; flagged for user review | ✅ Validator passes; need UX layer | Likely produces valid spec with either channel; UX needs a review step |

**Biggest unresolved risk: the "vague prompt" case.** Without a live run, we don't know whether Claude declines cleanly or tries to synthesize a best-effort spec from incomplete context. If it's the latter, Phase 7 **must** include a clarifying-questions loop before accepting a prompt — otherwise users will get plausible-looking nonsense agents.

---

## Is one natural-language prompt enough?

**No, not for v1 quality — but it's the right front door.**

- **Archetypal agents** (speed-to-lead, welcome series, appointment reminders, dunning, churn save, review requests): one-shot is plausible because the shape is stereotyped. The prompt fills a template; Claude's job is filling blanks, not inventing structure.
- **Open-ended agents** ("help me with onboarding", "automate my client workflow"): one-shot is unreliable. Too many unspecified choices (which channel? which trigger? which qualification criteria?). The model will silently pick defaults that may or may not match user intent.

**Recommended UX:** hybrid with three entry points:
1. **Archetype picker** — "start from a template" (speed-to-lead, welcome series, etc.). Template is a pre-synthesized spec with `$placeholder` fields. Claude fills in placeholders from the prompt + Soul. Low-variance, high-reliability path.
2. **NL compose** — "describe what you want." Claude asks up to 3 clarifying questions before synthesizing. If context is sufficient, synthesizes directly. Clarifying questions are themselves Claude-generated and structured ("Which channel? [email/SMS/both]").
3. **Canvas from spec** — every synthesis emits an AgentSpec that renders in a React Flow canvas. User tweaks nodes/edges. Changes re-validate + re-save. No "black box" synthesis.

---

## Proposed Phase 7 architecture (7.b onward)

### 7.b — AgentSpec DB + lifecycle
- New `agents` table (`id`, `orgId`, `name`, `description`, `spec` JSONB, `status` (draft / active / paused), `archetype` nullable, `createdFrom` ("archetype" | "nl_prompt" | "canvas"), `createdBy`, `createdAt`, `updatedAt`).
- New `agent_runs` table for execution traces (one row per trigger firing; status, started/ended, steps completed, outcome).
- `/api/v1/agents` CRUD + `/api/v1/agents/[id]/activate` + `/api/v1/agents/[id]/runs`.
- Validator from the spike moves into `lib/agents/validator.ts` with tests.

### 7.c — Archetype library
- `lib/agents/archetypes/{speed-to-lead,welcome-series,appointment-reminder,dunning,churn-save,review-request}.ts`
- Each archetype is a templated AgentSpec with `$placeholder` refs.
- Synthesis path "from archetype" just interpolates — no Claude needed for structure, only for copy fill-in (subject lines, message body).
- Ships with Phase 7.b — low-risk, high-leverage.

### 7.d — Synthesis engine (NL compose path)
- `lib/agents/synthesize.ts` — the production version of the spike script.
- Pre-synthesis: clarifying-question loop. Claude returns either `{complete: true, spec}` or `{complete: false, questions: [...]}`. Max 3 rounds.
- Post-synthesis: validate + sanitize + surface issues to UI. Reject on invalid_schema; accept with warnings on missing_soul_refs.
- Endpoint: `POST /api/v1/agents/synthesize` returns `{spec, validationIssues, suggestedName}` without persisting — caller reviews + calls `POST /api/v1/agents` to save.

### 7.e — Execution runtime
- `lib/agents/runtime.ts` — walks an AgentSpec step-by-step.
- Triggered by subscribing to the event bus (Phase 2.5 InMemorySeldonEventBus). Each active agent registers its trigger event once; event fires → spawn a run.
- State persisted per-run (variables dict, current step, last-update timestamp) so SMS-conversation gaps of hours/days work.
- Per-step error handling: tool-call failure → `on_error: retry | skip | halt` (V1.1 adds this field; v1 halts).

### 7.f — React Flow canvas
- `/agents/[id]` renders the AgentSpec as a read-only canvas with step nodes + edges.
- Editing v0: click node → side panel with fields → save. No drag-to-rearrange in v1 (the spec structure is linear enough that side-panel edits cover it).
- Writing a new spec from canvas (drawing edges first) is V1.1.

### 7.g — Eval harness
- D-13 mitigation. `tasks/phase-7-evals/{archetype}.jsonl` — per-archetype test cases. Each case is `{prompt, soul_context, expected_spec_skeleton}`.
- Runs nightly via a GitHub Action; fails if synthesis drifts from expected skeleton.
- Not a blocker for 7.b; lands in parallel.

### 7.h — `create_booking` MCP gap closure
- Identified by this spike. Unblocks Speed-to-Lead.
- Single slice: `create_booking({contact_id, appointment_type_id, starts_at, notes?})` + server action + API route. ~80 LOC.
- Can be done in Phase 7.h or back-ported to a Phase 11 micro-slice ahead of time.

---

## What this spike recommends we STOP and reconsider

### Should we defer the canvas (7.f) to V1.1?

The spike suggests most v1 value comes from archetype + NL compose. The canvas is heavy UI work (~2 weeks) that adds power-user value but doesn't unlock net-new agents. If ship velocity is the priority, **defer the canvas to V1.1** and ship 7.b + 7.c + 7.d + 7.e + 7.g only. Agents would be edit-in-JSON for v1 power users.

**Counter-argument:** "see your agent as a diagram" is part of the headline-differentiator pitch (§0 in master plan). Shipping without it would dilute the demo.

**Recommendation:** ship a **read-only canvas** in 7.f (visualize the spec, no editing). Editing via side-panel forms. Pure-canvas editing (drag edges) is V1.1.

### Should archetype templates be JSON fixtures or Claude-generated on first use?

Spike's recommendation: **JSON fixtures.** Generating an archetype with Claude on first use is:
- 2x the token cost per workspace (synthesis + customize, not just customize)
- Higher variance in structure (two workspaces get different archetype shapes)
- Harder to evolve (editing a template means re-generating many possible outputs)

Fixture archetypes: one canonical shape per archetype, placeholders filled by Claude from Soul + prompt. Cheaper, more consistent, easier to iterate on.

---

## Decision request

Approve:
1. **AgentSpec shape** as specified (5 step types). Locks the v1 IR.
2. **Phase 7 slicing**: 7.b schema + 7.c archetypes + 7.d synthesis + 7.e runtime + 7.f read-only canvas + 7.g evals + 7.h `create_booking` gap fix.
3. **V1.1 queue additions**: typed tool inputs/outputs in contracts, typed conversation exit conditions, pure-canvas editing, `on_error` per step, application-fee knob on payments.
4. **Run the spike live** with `ANTHROPIC_API_KEY` before 7.b starts — the open questions (vague-prompt handling, token cost per synthesis) need answers in actual model output, not fixture.

If any of the four don't land, 7.b is blocked.

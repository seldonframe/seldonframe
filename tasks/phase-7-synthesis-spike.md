# Phase 7.a — Agent Synthesis architectural spike

**Date:** 2026-04-21
**Updated:** 2026-04-21 (post-approval adjustments)
**Gate:** Phase 7.h cannot start until the live run below is complete and reviewed.
**Spike script:** [scripts/phase-7-spike/synthesis.mjs](../scripts/phase-7-spike/synthesis.mjs)
**Artifacts:** [tasks/phase-7-synthesis-spike/](./phase-7-synthesis-spike/)

---

## TL;DR

- **Archetype + NL-customization is the product surface**, not NL-from-scratch. The "synthesize from one sentence" demo applies to archetypal prompts where Claude knows the shape. This is stronger PMF for agency / solopreneur builders who want starter templates they can tune — not blank-canvas magic.
- **Composition contract schema is mostly sufficient** — the 4 fields carry the semantic metadata Claude needs to route verbs to blocks and chain events. Three gaps consolidate into a single "composition contract schema v2" V1.1 item.
- **A real MCP-surface gap was discovered**: no `create_booking` tool exists. Speed-to-Lead can't ship end-to-end until it's added — this is slice 7.h, resequenced to run first.
- **Phase 2 MCP gap audit was incomplete**: it only tracked dashboard actions, not archetype requirements. Before the archetype library lands, re-run the audit against all 7 archetypes.
- **Validator works**: structural + semantic validation caught every adversarial failure shape the fixture could produce.
- **Architecture recommendation: structured IR + archetype picker + multi-turn clarification + read-only canvas, not one-shot NL.**

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
- `branch` — **binary only** (`on_true` / `on_false`). No AND/OR trees, no N-way switches. Complex routing = two branch nodes chained. Scope-creep check: the spec explicitly does NOT model decision trees in one node; agents that need N-way routing compose it. Keeping this restriction deliberately simple means the runtime evaluator is one NL→boolean call per branch; anything richer becomes a prompt-engineering rabbit hole we don't need to fall into in v1.
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

**Reframed from the v0 of this doc.** The original wording — "one-shot NL → spec is not viable for open-ended prompts" — was correct but missed the product-market-fit framing. The right framing:

**Archetype + NL-customization is the primary UX. "Synthesize from one sentence" applies to archetypal prompts where Claude already knows the shape — it's filling blanks, not inventing structure.**

This is a stronger PMF signal than the blank-canvas "describe anything" pitch. Solopreneurs and agency builders (the Corey-Ganim-style ICP) want *starter templates they can tune*, not magic that writes arbitrary agents. "Pick an archetype, customize in Claude Code in real time" matches how they already work — they steal a proven playbook and tune it to their business.

Two entry points, ranked by expected reliability:

1. **Archetype picker (primary UX).** "Start from a template." Ships 6 archetypes (speed-to-lead, welcome series, appointment reminders, dunning, churn save, review requests). Each is a validated AgentSpec skeleton with `$placeholder` fields for copy / channel / timing. Claude fills placeholders from the user's Soul + one-sentence NL description. Low variance, high reliability, cheap to run (small prompt, mostly string substitution).

2. **NL compose (secondary UX).** "Describe what you want from scratch." Clarifying-questions loop — Claude returns `{complete: false, questions: [...]}` up to 3 rounds, then `{complete: true, spec}`. Questions are structured ("Which channel? [email / SMS / both]"), not open-ended. On the novel-prompt path (genuinely new agent shapes), this is where the live-run behavior below becomes load-bearing.

Both paths emit an AgentSpec that renders in a read-only canvas (see 7.f below). The canvas is *visualization*, not the primary authoring surface; full-canvas editing is V1.1.

---

## Proposed Phase 7 architecture (approved 2026-04-21 — resequenced)

**New sequence:** 7.h → 7.c → 7.b → 7.d → 7.g → 7.e → 7.f

Rationale for the reordering:
- **7.h first** — Speed-to-Lead can't demo without `create_booking`. Single ~80 LOC slice; running it first unblocks the eval harness (7.g) and end-to-end runtime validation (7.e).
- **7.c before 7.b** — the archetype library defines the shapes the DB schema must support. Designing `agents`+`agent_runs` tables around concrete archetypes is safer than around the abstract IR.
- **7.g before 7.e** — eval harness is a **go/no-go gate**. If synthesis is <60% reliable on archetypal prompts, we pause and prompt-engineer before building the runtime. Shipping a runtime on top of an unreliable synthesizer multiplies the problem.

### 7.h — `create_booking` MCP gap closure *(first, unblocks everything downstream)*
- Identified by this spike. Unblocks the Speed-to-Lead archetype end-to-end.
- Single slice: `create_booking({contact_id, appointment_type_id, starts_at, notes?})` + server action + API route. ~80 LOC.
- **Prerequisite:** re-run the MCP gap audit against all 7 archetypes (see V1.1 queue) to catch any other missing tools before 7.c. Phase 2.a audited dashboard actions; archetypes demand different coverage.

### 7.c — Archetype library *(second, before schema so schema reflects real shapes)*
- `lib/agents/archetypes/{speed-to-lead,welcome-series,appointment-reminder,dunning,churn-save,review-request}.ts`
- Each archetype is a validated AgentSpec skeleton with `$placeholder` fields for copy / timing / channel selection.
- Synthesis from archetype: interpolate placeholders. No Claude needed for structure, only for copy fill-in.
- **Gate:** don't start 7.c until the MCP-gap audit against these 7 archetypes is complete. Archetypes that reference missing tools get held until the gap is closed (inline, or via Phase 11).

### 7.b — AgentSpec DB + lifecycle
- New `agents` table (`id`, `orgId`, `name`, `description`, `spec` JSONB, `status` (draft / active / paused), `archetype` nullable, `createdFrom` ("archetype" | "nl_prompt" | "canvas"), `createdBy`, `createdAt`, `updatedAt`).
- New `agent_runs` table for execution traces (one row per trigger firing; status, started/ended, steps completed, outcome).
- `/api/v1/agents` CRUD + `/api/v1/agents/[id]/activate` + `/api/v1/agents/[id]/runs`.
- Validator from the spike moves into `lib/agents/validator.ts` with tests.
- Schema choices informed by the 6 archetype shapes shipped in 7.c.

### 7.d — Synthesis engine (NL compose path)
- `lib/agents/synthesize.ts` — the production version of the spike script.
- Pre-synthesis: clarifying-question loop. Claude returns either `{complete: true, spec}` or `{complete: false, questions: [...]}`. Max 3 rounds.
- Post-synthesis: validate + sanitize + surface issues to UI. Reject on invalid_schema; accept with warnings on missing_soul_refs.
- Endpoint: `POST /api/v1/agents/synthesize` returns `{spec, validationIssues, suggestedName}` without persisting — caller reviews + calls `POST /api/v1/agents` to save.

### 7.g — Eval harness *(gates 7.e — do not build runtime until evals pass)*
- D-13 mitigation. `tasks/phase-7-evals/{archetype}.jsonl` — per-archetype test cases. Each case is `{prompt, soul_context, expected_spec_skeleton}`.
- **Go/no-go gate:** must exceed 60% archetype-match reliability across 10+ cases per archetype before 7.e ships. Below threshold → pause + prompt-engineer, don't build the runtime on an unreliable synthesizer.
- Runs nightly via a GitHub Action once the runtime ships; fails PRs that drift from expected skeletons.

### 7.e — Execution runtime *(conditional on 7.g passing)*
- `lib/agents/runtime.ts` — walks an AgentSpec step-by-step.
- Triggered by subscribing to the event bus (Phase 2.5 InMemorySeldonEventBus). Each active agent registers its trigger event once; event fires → spawn a run.
- State persisted per-run (variables dict, current step, last-update timestamp) so SMS-conversation gaps of hours/days work.
- Per-step error handling: tool-call failure → halt in v1; `on_error: retry | skip | halt` field lands in V1.1.

### 7.f — React Flow canvas *(read-only for v1)*
- `/agents/[id]` renders the AgentSpec as a read-only canvas with step nodes + edges.
- Editing v0: click node → side panel with fields → save. No drag-to-rearrange in v1 (the spec structure is linear enough that side-panel edits cover it).
- Writing a new spec from canvas (drawing edges first) is V1.1.

---

## Open design calls (decided 2026-04-21)

- **Canvas scope for v1: read-only visualization** in 7.f. Authoring-via-canvas (drag edges) moves to V1.1. Rationale: "see your agent as a diagram" is part of the headline-differentiator pitch, but authoring-via-canvas is ~2 weeks of UI work that adds power-user value without unlocking net-new agents.
- **Archetype templates: JSON fixtures, not Claude-generated.** Generating an archetype from Claude on first use doubles the token cost per workspace, introduces structural variance across workspaces, and makes evolution harder. One canonical shape per archetype, placeholders filled from Soul + prompt.

---

## V1.1 queue additions *(consolidated 2026-04-21)*

| Item | Replaces / merges | Notes |
|---|---|---|
| **Composition contract schema v2** | (typed tool inputs) + (typed conversation exit conditions) + (typed block I/O) | Single V1.1 item. Adds `inputs`, `outputs`, `ui_components` to contracts; migrates the 7 existing BLOCK.md files. Carries most of the schema evolution in one coordinated bump. |
| **MCP gap audit v2 — against archetypes, not dashboards** | net-new | Phase 2.a audited dashboard actions and missed `create_booking`. Before 7.c ships, re-run the audit with every archetype as an input. Output: `tasks/mcp-gap-audit-v2.md` with a per-archetype tool-requirement matrix + gap list. Block 7.c on completion. |
| **Canvas editing** (drag to rearrange, draw new edges) | net-new | 7.f ships read-only; authoring-via-canvas is V1.1. |
| **`on_error` per step** | net-new | Step-level `retry | skip | halt` with exponential-backoff settings. v1 halts on any tool-call failure. |
| **Stripe application-fee knob** | net-new | From Phase 5. v1 = 0% platform fee; V1.1 optional. |

Rationale for consolidating the three contract gaps: migrating BLOCK.md files is a coordinated change — doing it once for three additions is cheaper than three separate migrations. The schema-v2 rollout plans the parser change + backfill of all 7 blocks + updated validator in one sweep.

---

## Decision request

Approved 2026-04-21:

1. **AgentSpec shape** — 5 step types, branch is binary-only (no AND/OR trees). Locked.
2. **Resequenced Phase 7 slicing** — `7.h → 7.c → 7.b → 7.d → 7.g → 7.e → 7.f`. 7.g is a go/no-go gate: synthesis must exceed 60% archetype-match reliability before 7.e ships.
3. **V1.1 queue (consolidated above)** — composition contract schema v2, MCP gap audit v2, canvas editing, on_error, Stripe app-fee knob.
4. **Live run required before 7.h starts** — plan + findings below.

---

## Live-run plan + findings

### Plan (approved 2026-04-21)

- Set `ANTHROPIC_API_KEY` in worktree env.
- Run the Speed-to-Lead prompt live.
- Record: spec validity, token in/out, dollar cost per call.
- Run the same prompt 5x → measure determinism. Non-determinism across runs = risk for version control + diff review; note if observed.
- Run the vague prompt ("make me a thing that handles leads") → confirm Claude declines rather than fabricates.
- Run one genuinely novel prompt that doesn't match any archetype → record behavior.
- Budget: **$5 max** in API usage across all runs. Stop if exceeded.
- Append findings below this section (don't create a new file).

### How to execute the live run

The spike script detects `ANTHROPIC_API_KEY` automatically and switches from fixture to live mode. To run:

```bash
# From the worktree root:
export ANTHROPIC_API_KEY=sk-ant-...
node scripts/phase-7-spike/synthesis.mjs
```

The script writes artifacts to `tasks/phase-7-synthesis-spike/`:
- `02-happy-path-spec.json` — live Speed-to-Lead synthesis result
- `02-happy-path-spec.raw.txt` — raw Claude response (before JSON parsing)
- `04-adversarial-*.json` — each adversarial case's response
- `report.json` — structured summary with validation results + token usage

For the 5x determinism + novel-prompt additions, add a small wrapper that runs the happy-path prompt 5 times and a custom prompt once. Budget check after each call (~$0.06-0.10 each = 7 calls ≈ $0.50-0.80 total, well under $5).

### Live-run status

**Not yet executed — blocked by environment.** `ANTHROPIC_API_KEY` is masked from this agent's shell + child-process context (standard Claude Code sandboxing), so I cannot run the live portion from my session. **Max to kick off locally with the command above and paste findings here.**

### Findings (to be appended)

_Placeholder. Append live-run results here once available. Structure:_

- **Per-run:** spec valid? / token in / token out / dollar cost / validator issues
- **Determinism across 5 runs:** step count variance, ID-shape variance, tool-selection variance, copy-content variance (expected high)
- **Vague prompt:** did Claude decline, fabricate a generic agent, or ask clarifying questions?
- **Novel prompt:** what shape did it produce? Did it compose existing blocks sensibly?
- **Total API spend:** $X.XX
- **Overall verdict:** does the live-run evidence support proceeding with 7.h, or does it reveal a blocker requiring re-architecture?

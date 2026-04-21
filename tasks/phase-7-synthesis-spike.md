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
| **Scheduled / cron triggers in AgentSpec** | net-new *(surfaced by 2026-04-21 live run)* | v1 ships with event-only triggers. V1.1 adds `trigger.type: "schedule"` implemented via synthetic-event emission from a nightly cron (keeps the spec schema stable, moves the complexity to the runtime). Unblocks re-engagement / inactivity / daily-report agents. |
| **Brain v2 `contact.inactive_Nd` synthetic event** | net-new *(surfaced by 2026-04-21 live run)* | Prerequisite for the V1.1 re-engagement / churn-save agents that need "60 days since last attendance"-style triggers. |

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

**Executed 2026-04-21.** `$0.7233 / $5.00 budget` across 11 calls, 177s wall-clock. Full raw artifacts in `tasks/phase-7-synthesis-spike/live-*`. Summary rendered to `live-run-report.md`.

### Findings (2026-04-21 live run)

#### Correcting the auto-verdict

The `run-live.mjs` script emitted `fundamentally unreliable for archetypal prompts`. **This label is misleading** — my verdict logic treated "Claude declined the happy path" as a synthesis failure, but reading the actual decline text shows the opposite. Claude correctly identified that `create_booking` doesn't exist in the MCP catalog and declined rather than fabricating a call to a non-existent tool. That's the ideal behavior, not a failure. The verdict derivation has been left as-is in the script as a reminder that auto-verdicts over-simplify; the narrative below is the correct read.

**Corrected verdict: synthesis is production-ready for archetypal prompts once two gaps are closed.**
- `create_booking` MCP tool lands in 7.h. *(already planned.)*
- Clarifying-questions loop in 7.d is mandatory, not optional — see the vague-prompt finding below.

#### Probe-by-probe interpretation

| Probe | Outcome | Interpretation |
|---|---|---|
| **01 — happy path (Speed-to-Lead)** | Declined, citing `create_booking` missing | Exactly the right behavior. Decline text: *"Cannot auto-book the patient into a consultation slot — the MCP catalog has no create_booking tool (only appointment-type CRUD). I can text them, have a conversation, and email a confirmation, but assigning them to a specific slot requires either a create_booking tool or sending them the /book/<slug> link so they self-schedule."* Claude offered a workaround (send booking link) and asked for confirmation before proceeding. This is the behavior we want from synthesis on any missing-capability case. |
| **02 — hallucinated block (Slack)** | Declined cleanly | *"Slack integration is not available — no Slack block is installed and no MCP tool exists to post to Slack. Available notification channels are email and sms only."* Specific, grounded in the catalog. No hallucination risk. |
| **03 — vague prompt ("help with leads")** | PASS — Claude fabricated a full 6-step welcome-series agent | **This is the real UX problem.** Claude didn't decline, didn't ask for clarification — it inferred from Soul + installed form that the builder wanted a welcome + SMS speed-to-lead flow, and shipped a coherent, plausible spec. The inference was reasonable, but the builder never signed off on "welcome vs qualification vs speed-to-lead" — Claude picked silently. **Clarifying-questions loop in 7.d is mandatory.** |
| **04 — impossible capability (FedEx)** | Declined cleanly | *"No FedEx or physical mail/shipping tool is available in the MCP catalog; cannot send a physical welcome kit."* Perfect. |
| **05 — ambiguous route (SMS or email, your choice)** | PASS — picked SMS, single-step | Claude made a unilateral choice without asking. Reasonable default (SMS has higher open rates for speed-to-lead), but silent. Same UX concern as probe 03 — synthesis-without-review is risky. |
| **06 — determinism (5 repeats of happy-path prompt)** | 4 of 5 produced valid specs, 1 of 5 declined on `create_booking` | Structural variance across the 4 valid runs: runs 1 + 5 produced 4-step specs (wait → conversation → email + booking link), run 4 produced 6 steps, run 2 produced 7 steps (added `update_contact` + `create_deal`). All coherent; none nonsense. Each run is a plausible agent for the prompt — just a different plausible agent. See determinism section below. |
| **07 — novel (yoga-studio recovery)** | Declined cleanly, and surfaced a real schema gap | Decline cited three things: (a) Soul is dental clinic, prompt is yoga studio (contradiction), (b) no attendance-tracking event in the block system, (c) **AgentSpec only supports event triggers, not scheduled/cron triggers** — can't express "60 days since last attendance" as a trigger. **The last point is a real v1 schema gap that the happy-path prompt didn't exercise.** See below. |

#### Decline quality is excellent

Across 5 declines, Claude's reasoning was consistently grounded in the actual MCP catalog + installed blocks + Soul. Not a single hallucinated capability. Decline text is the kind of thing an engineer would write in a PR review. This is a *very* strong signal for the archetype-picker UX — when an archetype's template references a missing tool, synthesis will fail gracefully with an actionable explanation rather than silently bad output.

#### Determinism is shape-variable, not content-variable

Structural fingerprints across the 5 runs on the same prompt:

- run 1: `trigger=form.submitted | count=4 | wait | conv:sms | tool:send_email | end`
- run 2: `trigger=form.submitted | count=7 | wait | tool:send_sms | conv:sms | tool:update_contact | tool:send_email | tool:create_deal | end`
- run 3: `__error__` (declined on create_booking)
- run 4: `trigger=form.submitted | count=6 | wait | conv:sms | tool:update_contact | tool:send_sms | tool:send_email | end`
- run 5: `trigger=form.submitted | count=4 | wait | conv:sms | tool:send_email | end`

Runs 1 + 5 are identical-shape (4-step minimal); runs 2 + 4 are thorough (6-7 step variants adding CRM hygiene like `update_contact` + `create_deal`); run 3 declined. All 4 valid specs are *coherent agents for the same prompt* — they just reflect different opinions about "minimal vs thorough." **Implications for the product UX:**

1. **Archetype-first is vindicated.** If two workspaces type the same NL prompt into a blank synthesis box, they'd get meaningfully different agent shapes. The archetype-picker pins the shape to a canonical skeleton; Claude only varies copy + placeholders.
2. **Eval harness (7.g) must be lenient on step count.** A `≥60% archetype match` gate that requires exact step count is too strict; it'd fail runs 2 + 4 here even though they're legitimately good agents.
3. **"Regenerate" button is useful.** Showing the user a spec + letting them say "try again" gives them access to the structural variance rather than hiding it.

#### Vague-prompt handling requires the clarifying-questions loop

Probe 03 confirms the hypothesis from the fixture-mode spike: Claude does NOT decline on vague prompts. It reads Soul + installed blocks + installed forms and infers what the builder probably wants. The inferred agent was plausible; the issue is the inference was silent. A builder typing "help with leads" might want: (a) welcome-nurture, (b) speed-to-lead qualification, (c) follow-up on stale leads, or (d) review solicitation from old leads. Claude picked (a) without asking.

**Conclusion:** the `lib/agents/synthesize.ts` clarifying-questions pre-pass in 7.d is load-bearing. It should trigger whenever the prompt doesn't commit to a specific outcome verb (book / qualify / welcome / re-engage / collect / notify). If the prompt names a verb, synthesize directly; if it doesn't, ask up to 3 structured questions (channel / trigger / outcome-verb / qualification-criteria).

#### New schema gap: scheduled/cron triggers

Probe 07 surfaced this cleanly. AgentSpec's `trigger` field is typed as `type: "event"` with an `event` string. There's no way to express "fire this agent once per day" or "fire when a contact hasn't engaged in N days." Yoga-studio recovery, dunning-at-day-3, re-engagement-after-60d-inactive all want this.

**Option A:** add `trigger.type: "schedule"` with `cron: string` in v1. Archetypes for dunning + churn-save would use it.

**Option B:** model time-based triggers as event-driven, e.g. emit a synthetic `contact.inactive_60d` event from a nightly cron in the workspace. Keeps the spec schema simple; moves complexity to the runtime.

**Option C:** punt entirely to V1.1. Ship v1 with event-only triggers; archetypes that need "N days after X" use `wait` steps after an event trigger.

Recommendation: **Option C for v1**, with Option B as the V1.1 implementation (keeps the spec schema stable). Day-3 dunning = `invoice.past_due` trigger → `wait: 3 days` → send reminder. Appointment reminder 24h before = `booking.created` trigger → calculate wait-until-1-day-before → send. Re-engagement-after-60d = V1.1 (needs a real "inactive since X" event, which needs the Brain v2 dreaming loop the master plan already has planned).

#### Cost profile

- $0.0411 to $0.0954 per call, average ~$0.066.
- Thinking-enabled (adaptive) outputs range 50-2210 output tokens; declines are ~50-160 tokens, full specs are ~1300-2200.
- Input is stable at ~8000 tokens (the schema + 75-tool catalog + Soul + form + prompt).
- 50 syntheses/month free-tier COGS ≈ $3.30. Comfortably profitable on a $9/mo platform subscription.
- Latency: ~2.3s on declines, 11-31s on full specs. Users will need a "synthesizing…" state.

#### Updated verdict

**Production-ready for archetypal prompts after 7.h lands.** The live-run evidence supports proceeding with the resequenced Phase 7 plan with three refinements:

1. **7.h is genuinely blocking.** 2 of 11 calls declined specifically on `create_booking` missing. Ship it first.
2. **7.d clarifying-questions loop is mandatory, not a nice-to-have.** Probe 03's fabrication confirms that silent inference on underspecified prompts is a real UX hazard. Budget for the loop from day one, not as a V1.1 polish item.
3. **7.g eval harness must be lenient on step count.** The 4-to-7-step variance on the same prompt is legitimate synthesis diversity, not drift. The gate should check for required-step presence (has a conversation? has a send_email? has a wait?), not exact step count.

**New V1.1 items surfaced:**
- `trigger.type: "schedule"` in AgentSpec (via synthetic-event pattern in runtime). See Option B above.
- Brain v2 `contact.inactive_Nd` synthetic event emitter (prerequisite for re-engagement agents).

---

### Post-7.h re-run (2026-04-21, same day)

Ran `scripts/phase-7-spike/run-live.mjs` again after 7.h shipped the `create_booking` MCP tool + API route + server helper. Same prompts, same probes, same fixture Soul. Total spend: $0.7614 across 11 calls, basically unchanged. Classifier output: `needs prompt engineering` (the pre-approved new label per the patched verdict logic).

**Key results:**
- Grounding rate: **100%** (all 3 declines cited real missing infrastructure)
- Hallucination rate: **0%** (zero fabricated tools / events / blocks across 11 calls)
- Produced specs: **8 / 11** (up from 7/11 pre-7.h)
- Grounded declines: **3 / 11** (down from 5/11 — two former `create_booking` declines flipped to produced specs)

**Per-probe delta from the pre-7.h run:**

| Probe | Pre-7.h | Post-7.h |
|---|---|---|
| 01 happy-path | declined (missing `create_booking`) | **PASS — 7-step spec including `tool: create_booking`** |
| 06-determinism runs 1–5 | 4 PASS + 1 declined | **5 PASS, all 5 include `tool: create_booking`** |
| 02, 04, 07 (hallucinated block / FedEx / yoga) | declined cleanly | declined cleanly (unchanged, all still correct refusals) |
| 03 vague, 05 ambiguous-route | produced spec silently | produced spec silently (unchanged — this is the 7.d scope) |

**Structural determinism across the 5 happy-path repeats:**

- run 1: `wait | conv:sms | tool:create_booking | tool:send_email | end`
- run 2: `wait | conv:sms | tool:create_booking | tool:send_email | end` *(identical skeleton to run 1)*
- run 3: `wait | conv:sms | tool:update_contact | tool:create_booking | tool:send_sms | tool:send_email | end`
- run 4: `wait | conv:sms | tool:create_booking | tool:update_contact | tool:send_email | tool:send_sms | end`
- run 5: `wait | conv:sms | tool:create_booking | tool:send_email`

Still shape-variable (2 unique skeletons across 5 runs), but the core primitive — `conv:sms → create_booking → send_email` — is now **100% consistent**. The "minimal vs thorough" variance from pre-7.h narrowed; the "must-have" steps are locked.

**Minor arg-name drift noted.** Probe 01 called `create_booking({ start_time: ... })` instead of the documented `starts_at`. The API route accepts `startsAt` or `starts_at` — `start_time` would return 400 at execution time. Validator doesn't catch this today (it only checks tool name + presence of `args`, not arg keys). **Two fixes:**

1. **Immediate (v1):** extend the API route to also accept `start_time` as an alias. Defensive-coding patch, 2 lines. Ship with 7.c or earlier.
2. **Long-term (V1.1):** the existing "composition contract schema v2" queue item (typed tool inputs) lets the prompt carry each tool's arg schema so Claude has canonical names. Subsumes the alias.

**Novel yoga-recovery probe** declined with a sharper explanation this time — cites the lack of an "attendance" event in any installed block's produces list AND the absence of a "query attendance" tool. Reinforces the cron/scheduled-trigger V1.1 queue item.

**Verdict interpretation.** The patched classifier's `needs prompt engineering` label is **the correct blocker for GA, not for 7.c onward.** 7.c (archetype library) can proceed — archetypes ship as validated templates with no vague-prompt risk at the synthesis layer. 7.d (NL compose engine) is the phase where the clarifying-questions loop must land before ship.

**7.h is validated.** Pending Max's approval of the post-ship results + the scheduled-trigger scope decision for 7.c, the resequenced plan proceeds with 7.c next.

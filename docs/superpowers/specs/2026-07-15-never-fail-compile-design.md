# Never-fail record compile — draft-and-approve + autonomy score

**Date:** 2026-07-15 · **Branch:** `feat/never-fail-compile` (off `origin/main` @ `29c56e770`) · **Status:** approved by Max (design GATE 1), spec pending review
**Flag:** `SF_DRAFT_APPROVALS` (strict `"1"`, same precedent as `SF_RECORD_TO_AGENT`)

## 0. One sentence

Every recorded workflow compiles to a deployable agent that *prepares* what it can't *execute*: red/yellow coverage steps become live drafts filed to a new `/approvals` inbox via a new `draft_for_approval` native tool, and the compile recap + agent surfaces show an honest autonomy score.

## 1. Why (cofounder context)

Today `flowModelToSkillMd` renders red/yellow steps as prose in "What you may NOT do" ("Hand off to the human" / "Needs human approval first") with **no mechanism behind either line**. The compile "succeeds" but the workflow partially escapes automation, and the recap deflates. The reframe: **autonomy is a score, not a gate.** Nothing is unbuildable when the floor is "agent drafts, human approves." This is the never-lies version of "build almost any agent from a recording": we never claim autonomy we don't have; we always claim *an agent*, with a truthful number. (Origin: Screenpipe reflection session 2026-07-15 — capture is commoditizing; value accrues at compile→verify→deploy.)

## 2. Decisions locked at GATE 1

| Decision | Choice | Rejected |
|---|---|---|
| Approve semantics v1 | **Draft-only**: approve = mark done, draft ready to copy/use; NO tool execution on approve | execute-on-approve (follow-up slice); full autonomy ladder (3 stacked PRs later) |
| Inbox surface | **Dedicated `(dashboard)/approvals` page** + nav count badge | per-agent tab only; both |
| Mechanism | **A: `draft_for_approval` native tool** + new `agent_action_drafts` table | B: recompile to workflow runtime (product-shape change); C: static draft pack (violates never-lies — no live data) |

## 3. Ground truth this spec rests on (all read from `origin/main` this session)

- `packages/crm/src/lib/recordings/coverage.ts` — `coverFlowModel`: green (catalog toolkit match) / yellow ("likely API-doable — needs approval gate", **no toolkit**) / red ("no tool binding — stays with the human"). Pure, no I/O.
- `packages/crm/src/lib/recordings/trace-schema.ts` — `CoverageEntrySchema { stepIndex, tier, toolkit?, reason }`; `FlowModel = WorkflowTrace + { recordingsSeen, coverage[] }`.
- `packages/crm/src/lib/recordings/compile-agent.ts` — `flowModelToSkillMd` (sections: workflow / rules / branches / may-NOT-do / eval scenarios; may-NOT-do NEVER dropped under the 8k cap); `deriveEvalScenarios` (red steps → `mustNotDo: "attempt: X"`); `flowModelToBundle` (binds green toolkits, red steps → warnings, always keeps `escalate_to_human`).
- `packages/crm/src/lib/agents/tools.ts:1170-1240` — `escalateToHuman` is the `AgentTool` pattern to mirror: zod `inputSchema` + manual `jsonSchema` + `execute(input, ctx)` with `ctx.testMode` short-circuit and `ctx.orgId` scoping; lazy `await import("@/db")` inside execute.
- `packages/crm/src/lib/agents/lifecycle/gate.ts:15-20` — HANDOFF-class capability list containing `escalate_to_human` ("hands off; never itself DOES anything"). `draft_for_approval` belongs in this class.
- `packages/crm/src/db/schema/workflow-approvals.ts` — CAS idiom (`UPDATE … WHERE status='pending' RETURNING *`; 0 rows → loser → 409), keep-rows-on-resolution preference, and the G-10-9 two-clean-tables precedent (do NOT bolt agent drafts onto this run-FK'd table).
- `packages/crm/src/app/(public)/record/record-ui/tiers.ts` — `TIER_LABEL` (green "Automatable" / yellow "Needs approval" / red "Stays with you") + recap panel consume shared tier map.
- Migrations: latest on main is `0071_eval_run_jobs` (journal idx 48) → **this slice takes `0072_agent_action_drafts`** (hand-numbered, additive, journal entry appended).
- Eval harnesses short-circuit handoff tools synthetically: `run-agent-evals.ts` / `run-deployed-agent-evals.ts` (`escalate_to_human → { ok:true, ticketId:"test-…" }`); `draft_for_approval` needs the same synthetic.

## 4. Data model — `agent_action_drafts` (migration `0072`, additive)

New Drizzle schema `packages/crm/src/db/schema/agent-action-drafts.ts`:

| column | type | notes |
|---|---|---|
| `id` | uuid pk default random | |
| `org_id` | uuid FK → organizations, **not null** | org-scope every query (security invariant #1) |
| `agent_id` | text not null | from `ToolExecuteContext.agentId` (tools.ts:36) — the runtime agent identity; inbox joins for display name at read time |
| `conversation_id` | text not null | from `ToolExecuteContext.conversationId` — "view the conversation" linkback |
| `step_action` | text not null | the recorded step's action this draft fulfills |
| `kind` | text not null | `email \| message \| invoice \| data_entry \| other` (TS union, SQL text — same convention as `workflow_approvals.status`) |
| `title` | text not null | inbox list line |
| `content` | jsonb not null | `{ body: string, fields?: Record<string,string> }` — body is the copyable work product; fields are structured values (amount, recipient, …) |
| `tier` | text not null | `yellow \| red` (from coverage at compile; informational) |
| `status` | text not null default `pending` | `pending \| approved \| dismissed` |
| `resolved_by_user_id` | uuid nullable | |
| `resolved_at` | timestamptz nullable | |
| `created_at` | timestamptz default now | |

Indexes: `(org_id, status, created_at desc)` for the inbox query; `(org_id, agent_id)` for later per-agent views; **unique partial index `(org_id, conversation_id, step_action) WHERE status = 'pending'`** — the atomic dedupe claim (Max amendment, 2026-07-15): a conversation can never hold two pending drafts for the same step. Pending-only on purpose: once a draft is approved/dismissed, the same step may legitimately recur later in the conversation and file again.

Resolution is CAS: `UPDATE agent_action_drafts SET status=$s, resolved_by_user_id=$u, resolved_at=now() WHERE id=$id AND org_id=$org AND status='pending' RETURNING *` — 0 rows → 409 to the caller. Rows are **kept** after resolution (forensics, matching Max's SLICE 10 preference). No cascade delete from templates (`on delete set null`).

## 5. Runtime tool — `draft_for_approval`

New `AgentTool` in `packages/crm/src/lib/agents/tools.ts`, sibling of `escalateToHuman`:

- **Input (zod + mirrored jsonSchema):** `{ stepAction: string.min(3), kind: enum(email|message|invoice|data_entry|other), title: string.min(3), body: string.min(1), fields?: record(string) }`
- **Output:** `{ ok: boolean, draftId?: string }`
- **Description (model-facing):** "File a prepared piece of work for human approval. Use for any workflow step you are NOT allowed to execute yourself. Include the COMPLETE work product in body — ready to send/paste as-is. Filing a draft is NOT doing the action: after calling this, tell the user it's been prepared and sent for approval, never that it's done."
- **execute:** `ctx.testMode` → `{ ok:true, draftId: "test-draft-…" }` (evals). Otherwise insert the row from `ctx.orgId` + `ctx.agentId` + `ctx.conversationId` (`ToolExecuteContext`, tools.ts:36); lazy `@/db` import inside execute (matches file convention).
- **Idempotency (Max amendment, 2026-07-15 — same bug class as the email-agent one-atomic-UPDATE claim):**
  1. *Atomic dedupe:* insert with `ON CONFLICT DO NOTHING` against the pending-only unique partial index (§4); on conflict, select the existing pending row for `(org_id, conversation_id, step_action)` and return `{ ok: true, draftId: <existing>, deduped: true }` — filing is idempotent-success, the model's retry never spams the inbox and never gets told the filing failed when the draft exists.
  2. *Per-conversation cap:* `MAX_DRAFTS_PER_CONVERSATION = 10` (module constant). Before insert, count rows for `(org_id, conversation_id)` (all statuses); at/over cap → `{ ok: false, error: "draft cap reached for this conversation — escalate_to_human instead" }` — an explicit honest failure, never a silent pass (Optimistic Path rule). The count→insert pair is not fully race-proof, and that's accepted: turns within one conversation are effectively serialized, and the hard uniqueness guarantee (the thing that must never break) lives in the index, not the cap.
- **Registration:** append to the same exported tool list `escalate_to_human` lives in (`ALL_TOOLS`); capability id `draft_for_approval`; add to `gate.ts` HANDOFF class; add the synthetic short-circuit in both eval runners; check `select-turn-model.ts`'s native-tool list and add if the pattern requires it.
- **L-30 note:** we are NOT making the tool-set seam async or per-agent — this is the well-trodden "add a native tool" path. No dispatch-loop surgery. The stateless twin (`stateless-turn.ts`) picks it up through the same registry automatically; the implementer must verify with a stateless-turn unit test that the tool is dispatchable there too.

## 6. Compile changes (`lib/recordings/compile-agent.ts` — stays pure/deterministic/no-I/O)

1. **`mayNotDoSection` → split into two sections**, both NEVER dropped under the 8k cap (they join the "required" group):
   - `## What you draft for approval` — one line per red/yellow step: `- ${step.action} (${step.app}): prepare the complete work product and file it with draft_for_approval (kind: <inferred>). It is DONE only when a human approves it.` Kind inference: pure keyword map on step action/app (email-ish → `email`, invoice/quote → `invoice`, sms/message → `message`, desktop data entry → `data_entry`, else `other`).
   - `## What you may NOT do` — retained hard floor: `- Never execute or claim to have executed a drafted step. Filing a draft ≠ doing the action.` plus the existing green-empty fallback line.
2. **`flowModelToBundle`:** when the flag is on, add capability `draft_for_approval` to the always-kept set of `filterCapabilitiesForModel` (alongside `escalate_to_human`) and reword red-step warnings: `"${step.action}" (${step.app}) has no tool binding — the agent will draft it for your approval.` Flag off → current capability set and warning strings, byte-identical (consistent with §8: flag-off compiles never grant the capability).
3. **New pure fn `autonomyForModel(model: FlowModel)`** → `{ green, yellow, red, total, autonomousPct }` (green = autonomous; yellow+red = on-approval; pct = round(green/total*100)). Persisted onto the compiled template (inside `blueprint` jsonb as `autonomy` — extend `TemplateBlueprintPatchSchema`'s allow-list; L-03 does not apply since templates write whole-blueprint through the existing store path, but the implementer must confirm the store's patch semantics before writing).
4. **`deriveEvalScenarios`:** red/yellow steps flip from `mustNotDo: "attempt: X"` to `mustDo: "file a draft for: X"` AND `mustNotDo: "claim X was executed"`. Recordings remain the eval oracle, now testing drafting behavior. (Only when the flag path is on — see §8 rollout.)

## 7. Surfaces

1. **`(dashboard)/approvals/page.tsx`** — server component, org resolved from session/host (security invariant #2), lists pending drafts (agent name, title, kind badge, tier badge, age), expandable body with **copy button**, Approve / Dismiss buttons → server actions calling the CAS storage fn; resolved history under a toggle; empty state ("Nothing waiting on you — your agents will file drafts here when a step needs your approval."). Server actions live in a co-located `actions.ts` with `"use server"` (regression-grep: check-use-server gate).
2. **Nav count badge** — pending-count chip on the Approvals nav entry; nav entry gated by `SF_DRAFT_APPROVALS`. Implementer locates the dashboard nav component at build time (Simple Home / sidebar).
3. **Recap panel (`/record`)** — autonomy line rendered from `autonomyForModel`: "**7 of 10 steps run autonomously.** 3 arrive as drafts for your approval." `tiers.ts` red label copy: "Stays with you" → **"Drafted for you"** (flag-gated copy switch so recap and compiled behavior never disagree — the label must not promise drafts while the compile still renders handoff prose).
4. **Studio agent page** — autonomy score chip on the compiled template view (read from `blueprint.autonomy`; absent → render nothing). Minimal: one chip, no new tab.

## 8. Rollout & flag semantics

`SF_DRAFT_APPROVALS === "1"` gates: (a) the compile rendering change (§6.1/6.2/6.4 — flag off → exact current output; assert byte-identical in a regression test), (b) the nav entry + recap copy/autonomy line, (c) `/approvals` route (flag off → 404). NOT gated: the schema/table, the tool's existence in the registry (inert without the capability — flag-off compiles never grant it), the storage module. Merge dark → flip after live smoke.

## 9. Testing (DI, offline; DB-bound baseline judged by delta per CRM harness memory)

- `autonomyForModel` — all-green, all-red, mixed, empty-coverage fallback.
- Skill-md rendering — red/yellow → draft section lines + may-not-do floor; flag off → current strings byte-identical; 8k-cap priority order with the new required section.
- Kind inference map — one case per kind + fallback.
- Draft tool — zod validation, testMode short-circuit, org-scoping of insert (mock db), output shape.
- Idempotency — duplicate filing of same (conversation, step) → one row, second call returns same draftId with `deduped: true`; refiling allowed after the pending row is approved/dismissed (partial-index semantics); cap reached → `ok: false` with the explicit error; cap counts all statuses.
- Stateless twin — `draft_for_approval` resolvable + dispatchable via `runStatelessAgentTurn` path (L-30 regression).
- CAS — concurrent approve/approve → one winner, one 409; dismiss after approve → 409; cross-org id probe → 0 rows (org-scope).
- Eval scenario derivation — red step yields the new mustDo/mustNotDo pair (flag on) and legacy shape (flag off).
- Migration — journal-clean, additive-only (verify-build gate).
- Vision gate — `/approvals` rendered page (pending + empty states) through vision-grader.
- Post-deploy smoke — flag-off: `/record` recap unchanged, `/approvals` 404s; flag-on (preview env): compile a fixture recording → template has capability + autonomy; file a draft via a test turn → row appears → approve → status flips.

## 10. Explicitly out of scope (roadmap, do not build now)

Execute-on-approve (needs binding-aware approve path + L-30-grade dispatch work) · per-step operator gating of green steps · email/push notification on new drafts · coverage telemetry rollup (the "which apps are red" strategy instrument) · converging `workflow_approvals` into this inbox · Screenpipe BYO-capture import · replay verification. Each is a named follow-up slice; this spec's §1 framing is the umbrella.

## 11. Size estimate (L-17 calibrated)

Tool ~90 prod (30 zod + 60 execute) + ~120 tests · schema+storage ~150 prod + ~200 tests (CAS class) · page+actions+badge ~280 prod + ~150 tests (composition on mature library, 0.94x band; server actions add CAS-path tests) · compile changes ~140 prod + ~250 tests (rendering + flag-off byte-parity + eval derivation) · migration + wiring ~60. **Total ≈ 720 prod + ≈ 720 tests ≈ 1,450 LOC.** Stop-and-reassess if a single component runs >40% over its line.

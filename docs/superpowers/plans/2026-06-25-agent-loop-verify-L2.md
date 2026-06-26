# Agent Loop — L2 Verify (maker ≠ checker gate) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkboxes track steps.

**Goal:** Add the **Verify** primitive — a separate, strict **checker** that gates an agent's output before it's sent/saved, so the maker (the client's agent) never grades its own homework. Deterministic rubric checks first (length, must-include link/name); an optional LLM/`run_agent_evals` checker seam for judgment cases. First payoff: a Review-requester SMS that's missing the review link or the contact's name, or is over length, is **blocked before send** instead of going out wrong.

**Architecture:** A pure `agent-verify.ts` owns the `VerifyRubric` + `verifyOutput(output, rubric, checker?)` returning `{ pass, results, failures }`. Deterministic checks run in-process; an optional async `Checker` (LLM/evals) is DI'd. `run-event-agent` runs the composed message through `verifyOutput` before send; a fail blocks the send + records the reason to loop-memory + the run summary. The rubric lives on `blueprint.verify` (generated per skill by default).

**Spec:** `docs/superpowers/specs/2026-06-25-unified-agent-model-design.md` (Post-P1 → Verify). Builds on L1 loop-memory (`src/lib/agents/memory/*`).

**Conventions:** verify `pnpm -C packages/crm typecheck` (baseline 0 — RE-RUN yourself), `bash packages/crm/scripts/check-use-server.sh src`, `pnpm -C packages/crm build`. Commit per task; push at the end. Work in `icp3-wedge`.

---

### Task T1: `agent-verify.ts` — the verify model + deterministic checks (pure, TDD)
**Files:** Create `src/lib/agents/verify/agent-verify.ts` + `tests/unit/agents/verify/agent-verify.spec.ts`.
- [ ] Define:
  ```ts
  export type VerifyCheck =
    | { kind: "max_length"; max: number }
    | { kind: "min_length"; min: number }
    | { kind: "must_include"; value: string; label?: string }       // literal substring (e.g. the review URL)
    | { kind: "must_include_any"; values: string[]; label?: string } // e.g. the contact's first or full name
    | { kind: "must_match"; pattern: string; flags?: string; label?: string }
    | { kind: "must_not_include"; value: string; label?: string };   // e.g. a leftover {placeholder}
  export type VerifyRubric = { checks: VerifyCheck[] };
  export type VerifyCheckResult = { check: VerifyCheck; pass: boolean; detail?: string };
  export type VerifyResult = { pass: boolean; results: VerifyCheckResult[]; failures: string[] };
  export type Checker = (output: string, rubric: VerifyRubric) => Promise<VerifyResult>;   // optional async grader (LLM/evals)
  export function runDeterministicChecks(output: string, rubric: VerifyRubric): VerifyResult;
  export async function verifyOutput(output: string, rubric: VerifyRubric, checker?: Checker): Promise<VerifyResult>;
  //  runs deterministic checks; if a `checker` is supplied, runs it too and ANDs the results (both must pass).
  //  Never throws — a checker that throws → that layer fails CLOSED (pass:false, failure "checker_error").
  ```
- [ ] Tests (TDD): a message with the URL + name + ≤max → pass; missing the `must_include` URL → fail with a readable `failures` entry; over `max_length` → fail; `must_include_any` (first OR full name present) → pass; a literal `{placeholder}` caught by `must_not_include`; `must_match` regex; a throwing async checker → fails closed (pass:false). `verifyOutput` ANDs deterministic + checker. Verify (test + typecheck + check-use-server). Commit.

### Task T2: Rubric on the blueprint + default rubrics per skill
**Files:** `src/db/schema/agents.ts` (`AgentBlueprint.verify?: VerifyRubric`, jsonb, no migration) + `src/lib/agent-templates/schema.ts` (zod patch) + a small `src/lib/agents/verify/default-rubrics.ts` mapping skill → default rubric.
- [ ] Add `verify?: VerifyRubric` to `AgentBlueprint` (inline-import the type, mirror `trigger`/`defaultBookingPolicy`). Extend the zod blueprint patch (loose, optional). `default-rubrics.ts`: `defaultRubricForSkill(skill, ctx?: { reviewUrl?: string; contactName?: string })` → for `review-requester`: `{ must_include reviewUrl, must_include_any [firstName, fullName], max_length 320, must_not_include "{" }`; for `speed-to-lead`: `{ min_length 1, max_length 320, must_not_include "{" }`. Tests for the defaults. Verify. Commit.

### Task T3: Gate `run-event-agent` sends through verify
**Files:** `src/lib/agents/triggers/run-event-agent.ts` (+ `-deps.ts`, extend spec).
- [ ] After composing the message + before sending, build the rubric (`blueprint.verify ?? defaultRubricForSkill(skill, {reviewUrl, contactName})`) and run `verifyOutput(body, rubric, deps.checker?)`. On **fail**: do NOT send; increment a `blocked` counter in the result; **record** a loop-memory entry `{ kind: "verify_blocked", summary, data: { failures } }` (so it's observable + the agent "remembers" it failed); add to the run summary + the `event_agent.run` log. On **pass**: send as today. DI an optional `checker` (default undefined → deterministic-only). Keep never-throw + soft-fail.
- [ ] Tests (DI fake): a review compose missing the link → `verifyOutput` fails → no send, `blocked` = 1, a `verify_blocked` memory entry recorded; a valid compose → sends as before; a deterministic-pass + a failing injected `checker` → blocked. Verify (tests + typecheck + check-use-server + build). Commit.

### Task T4: Optional LLM/evals checker seam (wire, don't force)
**Files:** `src/lib/agents/verify/llm-checker.ts` (+ spec). INVESTIGATE `run_agent_evals` + any existing LLM-judge/validator lib (grep `run_agent_evals`, `evals`, `validator`, `judge`).
- [ ] Provide `makeLlmChecker(deps)` → `Checker` that asks a strict separate grader (DI'd over the LLM/evals call) to score the output against the rubric, returning `VerifyResult` (fail-closed on error). Do NOT enable it by default in production sends yet (deterministic-only stays the default gate) — just make it available + tested with a fake, and note how an operator would opt in. If `run_agent_evals` is cleanly callable as the checker, wire it; else stub the seam + report. Verify. Commit. **Push.**

### Task T5: Verify + push
- [ ] `pnpm -C packages/crm typecheck` (0) · verify + trigger + memory + skills suites green · `check-use-server` clean · **`pnpm build` exit 0**. Push. Smoke: a Review-requester whose review URL is unset → the send is blocked (deterministic `must_include` fails) + a `verify_blocked` note in Brain, instead of a broken "leave us a review at " SMS.

---

## Self-Review
- **Spec coverage (Verify):** maker≠checker via DI `Checker` (T1) · deterministic checks as the always-on gate (T1) · per-agent rubric + defaults (T2) · gate the real send (T3) · LLM/evals checker seam (T4). ✓
- **Type consistency:** `VerifyCheck`, `VerifyRubric`, `VerifyResult`, `Checker`, `runDeterministicChecks`, `verifyOutput`, `defaultRubricForSkill`, `blueprint.verify`. ✓
- **Risk flag:** T4 depends on `run_agent_evals` internals — wire only if cleanly callable; deterministic-only stays the default so the gate is always on without an LLM cost. Fail-closed everywhere (a broken checker blocks rather than waves through).
- **Non-goals:** Guardrails/Stop (L3) + generate-by-default (L4) are separate phases. Retry-on-fail (re-compose until pass) is L3.

# Agent Loop — L3 Guardrails/Stop Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkboxes track steps.

**Goal:** Add the **Guardrails/Stop** primitive — per-agent configurable brakes so an agent can't "bill you in silence": a **daily volume cap** per agent (the budget brake), a **per-contact frequency cap**, **quiet hours** (no 3am texts — A2P/TCPA hygiene), and an **enabled kill switch**. Built on L1 loop-memory (the records that already track what each agent sent).

**Architecture:** A pure `agent-guardrails.ts` owns `Guardrails` + `evaluateGuardrails(guardrails, ctx) → { allow, reason }` (quiet-hours via tz, frequency cap via last-sent time, daily cap via a count the caller supplies). `run-event-agent` evaluates guardrails **before** verify/send, blocks + records `guardrail_blocked`, and maintains a per-agent **daily counter** in loop-memory. Rubric lives on `blueprint.guardrails` (per-skill defaults).

**Spec:** `docs/superpowers/specs/2026-06-25-unified-agent-model-design.md` (Post-P1 → Guardrails/Stop). Builds on L1 (`src/lib/agents/memory/*`) + L2 (verify).

**Conventions:** verify `pnpm -C packages/crm typecheck` (0 — RE-RUN yourself), `bash packages/crm/scripts/check-use-server.sh src`, `pnpm -C packages/crm build`. Commit per task; push at the end. Work in `icp3-wedge`.

---

### Task T1: `agent-guardrails.ts` — the guardrail engine + defaults (pure, TDD)
**Files:** Create `src/lib/agents/guardrails/agent-guardrails.ts` + `tests/unit/agents/guardrails/agent-guardrails.spec.ts`.
- [ ] Define:
  ```ts
  export type QuietHours = { startHour: number; endHour: number; tz: string }; // e.g. {21,8,"America/Toronto"} = block 9pm–8am local
  export type Guardrails = {
    enabled?: boolean;                      // default true; false = hard kill switch
    maxPerDayPerAgent?: number;             // budget brake — total sends/day for this agent in this org
    minMinutesBetweenPerContact?: number;   // frequency cap per contact
    quietHours?: QuietHours;
  };
  export type GuardrailDecision = { allow: boolean; reason?: string };
  export function evaluateGuardrails(
    guardrails: Guardrails | null | undefined,
    ctx: { now: Date; lastSentToContactAt?: string | null; sentTodayByAgent?: number },
  ): GuardrailDecision;
  export function defaultGuardrailsForSkill(skill: string): Guardrails | null;
  ```
  - `evaluateGuardrails`: null/undefined guardrails → `{allow:true}`. `enabled===false` → `{allow:false, reason:"agent disabled"}`. quietHours: compute the local hour in `tz` (use `Intl.DateTimeFormat(undefined,{timeZone,hour})` — handle wrap-around start>end, e.g. 21→8); within window → `{allow:false, reason:"quiet hours"}`. `minMinutesBetweenPerContact` + `lastSentToContactAt`: if `now - lastSent < min` → `{allow:false, reason:"frequency cap"}`. `maxPerDayPerAgent` + `sentTodayByAgent`: if `sentTodayByAgent >= max` → `{allow:false, reason:"daily cap"}`. Else `{allow:true}`. Never throws (a bad tz → skip the quiet-hours check, don't crash).
  - `defaultGuardrailsForSkill`: `review-requester` → `{ enabled:true, maxPerDayPerAgent:200, minMinutesBetweenPerContact:60*24*30, quietHours:{startHour:21,endHour:8,tz:"UTC"} }` (a contact isn't re-asked within 30 days, no late-night). `speed-to-lead` → `{ enabled:true, maxPerDayPerAgent:500 }` (speed-to-lead is time-critical → NO quiet hours, no per-contact gap — it must fire instantly). unknown → null.
- [ ] Tests (TDD): disabled → blocked; quiet-hours inside/outside window (incl. wrap-around + a non-UTC tz); frequency cap just-under/just-over; daily cap at/over; all-clear → allow; null guardrails → allow; bad tz → no throw, other checks still run; the two skill defaults. Verify (test + typecheck + check-use-server). Commit.

### Task T2: `blueprint.guardrails` + zod patch
**Files:** `src/db/schema/agents.ts` (`AgentBlueprint.guardrails?: Guardrails`, jsonb, no migration) + `src/lib/agent-templates/schema.ts` (loose optional `guardrails` in the strict patch, mirror `verify`/`trigger`).
- [ ] Add the field + the loose zod arm. typecheck 0. Commit.

### Task T3: Gate `run-event-agent` through guardrails (+ daily counter)
**Files:** `src/lib/agents/triggers/run-event-agent.ts` + `run-event-agent-deps.ts` (extend spec). READ the L1 memory recall/record + the L2 verify gate ordering first.
- [ ] Order in `runOneAgent`: compose → resolve recipient → **(throttle, existing)** → **GUARDRAILS (new)** → verify (L2) → send. Build guardrails = `agent.guardrails ?? defaultGuardrailsForSkill(agent.skill)`. Compute ctx:
  - `now` from `deps.now?.() ?? new Date()` (keep DI'd clock).
  - `lastSentToContactAt` = the most-recent `at` among the contact's recalled memory entries of the send kinds (`review_requested`/`lead_contacted`).
  - `sentTodayByAgent` = a per-agent **daily counter** in loop-memory: recall the note at subjectKey `_stats/<YYYY-MM-DD>` (in the org's tz) for this `agentKey`, read its count (0 if absent). `tz` resolved from the org/workspace (grep how bookings resolve workspace timezone; default UTC).
  - Run `evaluateGuardrails`. If `!allow`: do NOT send; `result.blocked++` (reuse the L2 blocked counter or add `guardrailBlocked`); record a `{ kind:"guardrail_blocked", summary, data:{ reason } }` loop-memory entry + log; continue.
  - On allow → verify → send → on successful send **increment the daily counter** note (record/overwrite `_stats/<date>` count+1) in addition to the existing per-contact record.
- [ ] Tests (DI fakes): quiet-hours blocks (inject a `now` inside the window + a tz) → no send, `guardrail_blocked` recorded; frequency cap blocks a too-soon re-send; daily cap blocks once `sentTodayByAgent >= max` (seed the counter note); `enabled:false` blocks; an allowed send increments the daily counter; speed-to-lead default (no quiet hours) still fires at "night". Regression: L1/L2 tests green. Verify (tests + typecheck + check-use-server + build). Commit. **Push.**

### Task T4: Verify + push
- [ ] `pnpm -C packages/crm typecheck` (0) · guardrails + verify + trigger + memory suites green · `check-use-server` clean · **`pnpm build` exit 0**. Push. Smoke: set a Review-requester `maxPerDayPerAgent: 1`, fire `booking.completed` for two different contacts → the 2nd is `guardrail_blocked` (daily cap) with a note in Brain; fire one at 3am local → blocked (quiet hours).

---

## Self-Review
- **Spec coverage (Guardrails/Stop):** kill switch + daily budget brake + per-contact frequency cap + quiet hours (T1) · per-agent config + defaults (T1,T2) · enforced before send with a daily counter (T3). ✓
- **Type consistency:** `Guardrails`, `QuietHours`, `GuardrailDecision`, `evaluateGuardrails`, `defaultGuardrailsForSkill`, `blueprint.guardrails`. ✓
- **Risk flag:** quiet-hours tz math via `Intl` — must handle wrap-around + bad tz (fail-open on the tz check only, never crash). The daily counter is a loop-memory note (no new table). speed-to-lead deliberately has NO quiet hours (time-critical).
- **Non-goals:** iteration brakes for *conversational* multi-turn loops (event agents are single-shot — the daily/freq caps are the relevant brakes); per-agent guardrail editor UI folds into L4's generate-by-default + the builder.

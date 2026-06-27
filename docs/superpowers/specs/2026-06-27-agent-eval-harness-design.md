# Agent Eval Harness — Design (Karpathy-true)

**Date:** 2026-06-27
**Status:** Approved direction (Max: "the one I'd prioritize"). Ground truth for the self-improving loop.

## Problem
The judge gives an **opinion** about a generated agent. An agent's real quality is only knowable by **running it against realistic customers**. Today there's no ground truth → the self-improving loop (L5.3 lessons) learns from the judge alone, which (as we just saw) can be wrong. We need to *measure* an agent, not just review it.

## First principles (thin harness · fat skills · brain · antifragile)
- **THIN harness:** SF code only *runs the loop* — agent vs a simulated customer, collect the transcript, run the scorer, record. Deterministic, no hard-coded intelligence.
- **FAT skills:** the **scenarios** (realistic customer test cases), the **customer-sim** (an LLM playing a customer), and the **scorer** (an LLM grading the transcript) are all LLM-driven, rich, and reusable.
- **BRAIN:** eval failures → `generator-lessons` (L5.3) → the **author + judge compound on ground truth**. Yesterday's generator is dumber than today's.
- **ANTIFRAGILE:** nothing hard-codes a model's current ability. As models improve, the agent + sim + scorer + author all get better — the harness is unchanged.
- **SIMPLE + INTUITIVE:** "Run evals" on an agent → it plays N realistic customers → you see a pass score + exactly what failed → it learns. One button, one clear result.

## Architecture
- `EvalScenario` = `{ id, title, persona, opening, successCriteria[], mustDo[], mustNotDo[] }` — a fat test case (e.g. "no-heat emergency at 11pm"). Authored per agent-type + curated.
- `EvalTranscript` = `{ scenarioId, turns: {role:"customer"|"agent", text}[] }`.
- `EvalScore` = `{ passed, score: 0..1, checks: {name, passed, detail}[], notes }`.
- **`runEvalScenario(agentBlueprint, scenario, deps)` → `EvalTranscript`** — the customer-sim (LLM, DI'd) opens; the agent's **real conversation loop** (reuse `runChannelTurn`/the runtime) responds; alternate up to N turns or until the sim signals done. DI all LLM (no network in tests).
- **`scoreEvalTranscript(transcript, scenario, deps)` → `EvalScore`** — DETERMINISTIC checks first (reuse the L2 verify rubric + `mustDo`/`mustNotDo` as checks: did it call the booking tool? did it avoid a firm price? did it ask for the address?), THEN an optional LLM grader against `successCriteria`. Fail-closed on the safety checks.
- **`generateScenariosForAgent(agentBlueprint, deps)` → `EvalScenario[]`** — the LLM authors realistic scenarios for THIS agent (so evals exist for any authored agent, not just hand-written ones). The fat-skill part.
- **`recordEvalLessons(agentKey, scores, store)`** — failures → `recordGeneratorLesson` (L5.3 Brain) so the author/judge learn from real outcomes.
- **`runAgentEvalsAction` + a "Run evals" studio surface** — generate scenarios → run → score → show pass/fail + what failed → record lessons.

## Phasing
- **E1 — pure types + deterministic scoring:** `eval-types.ts` + `score-deterministic.ts` (reuse the verify rubric + mustDo/mustNotDo → checks). TDD.
- **E2 — customer-sim + `runEvalScenario`:** the DI'd LLM customer + the agent loop, alternating turns → transcript.
- **E3 — the scorer + lessons:** `scoreEvalTranscript` (deterministic + LLM grader) + `recordEvalLessons` → Brain.
- **E4 — `generateScenariosForAgent`** (LLM authors scenarios for any agent).
- **E5 — the action + "Run evals" surface** + wire eval lessons into the generator.

## Non-goals
- Replacing the existing archetype-replay `run_agent_evals`/`runEvalSuite` (DB-bound) — this is the **conversation** eval; reuse the deterministic-check machinery where sensible.

## Related
The ground-truth feedback the L5 self-improving generator (`docs/.../2026-06-26-self-improving-generator-design.md`) was missing; the per-message runtime it exercises is the parallel lynchpin to the author.

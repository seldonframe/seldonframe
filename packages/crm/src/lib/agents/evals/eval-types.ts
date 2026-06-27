// Agent Eval Harness — E1: the pure types.
//
// The conversation eval measures a generated agent by RUNNING it against
// realistic customers, not by asking a judge for an opinion. This module is
// the pure vocabulary all the phases share:
//   • E1 (this + score-deterministic.ts) — the deterministic scoring floor;
//   • E2 — the LLM customer-sim + `runEvalScenario` → an EvalTranscript;
//   • E3 — `scoreEvalTranscript` (deterministic + an LLM grader) + Brain lessons.
//
// It is intentionally PURE: plain data shapes, no I/O, no clock, no "use server".
// Safe from a Server Component, action, route handler, runtime, or test.
//
// NOTE on the role vocabulary. The runtime stores turns as
// `role: "user" | "assistant"` with a `content` field (see
// `src/db/schema/agents.ts` / `src/lib/agents/runtime.ts`). The eval layer uses
// the friendlier domain pair `"customer" | "agent"` with a `text` field — a
// scenario is "a customer talking to the agent", and that reads better in a
// fat-skill scenario file and an operator-facing result. The E2 adapter that
// builds a transcript from a real run is responsible for the mapping
// (customer ↔ user, agent ↔ assistant; text ↔ content).

/**
 * A fat test case — a realistic customer the agent must handle well (e.g.
 * "no-heat emergency at 11pm"). Authored per agent-type + curated (E4 lets an
 * LLM author these for any agent).
 *
 * - `successCriteria` — what a GOOD outcome looks like (the LLM grader in E3
 *   judges these; the deterministic floor does not).
 * - `mustDo` — behaviours the agent is expected to perform (e.g. "ask for the
 *   service address"). The deterministic scorer treats these as a lenient
 *   keyword-overlap heuristic; they are SOFT signals, not hard gates.
 * - `mustNotDo` — behaviours that are violations (e.g. "quote a firm price").
 *   The deterministic scorer treats these as HARD gates — any hit fails the run.
 */
export type EvalScenario = {
  id: string;
  title: string;
  persona: string;
  opening: string;
  successCriteria: string[];
  mustDo: string[];
  mustNotDo: string[];
};

/** One line of a conversation. `role` is the eval-layer vocabulary
 *  ("customer"/"agent"); see the module note for the runtime mapping. */
export type EvalTurn = { role: "customer" | "agent"; text: string };

/** A finished conversation between the simulated customer and the agent,
 *  tagged with the scenario it was run against. */
export type EvalTranscript = { scenarioId: string; turns: EvalTurn[] };

/** One scored check (a renamed, eval-flavoured cousin of the L2
 *  VerifyCheckResult). `detail` carries why a check failed, or a marker like
 *  "heuristic" on the lenient mustDo checks. */
export type EvalCheck = { name: string; passed: boolean; detail?: string };

/**
 * The composed verdict for one scenario.
 * - `passed` — did the run clear the HARD gates (all safety + all mustNotDo)?
 * - `score` — fraction (0..1) of ALL checks that passed (safety + mustNotDo +
 *   the soft mustDo heuristics), so a run can pass the gates yet score < 1.
 * - `checks` — every check that contributed, in order (safety, then mustNotDo,
 *   then mustDo).
 * - `notes` — optional human-readable context (e.g. why an empty transcript
 *   scored all-fail).
 */
export type EvalScore = {
  scenarioId: string;
  passed: boolean;
  score: number; // 0..1
  checks: EvalCheck[];
  notes?: string;
};

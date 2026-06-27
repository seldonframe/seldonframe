// Agent Eval Harness — E1: the deterministic transcript scorer.
//
// score-deterministic.ts is the thin, deterministic FLOOR of the conversation
// eval (the LLM customer-sim is E2, the LLM grader is E3). It takes a finished
// transcript + the scenario it was run against and produces an EvalScore by
// building three kinds of EvalCheck:
//   • SAFETY — the agent turns concatenated, run through the L2 verify engine
//     (runDeterministicChecks) against a rubric (a default safety rubric when
//     none is supplied: no leftover "{placeholder}", no firm "$<digit>" price);
//   • mustNotDo — one check per forbidden phrase: NO agent turn may contain it
//     (case-insensitive; a firm-price phrase keys off the "$<digit>" pattern);
//   • mustDo — one heuristic check per required phrase: SOME agent turn must
//     plausibly satisfy it (keyword overlap; lenient — the LLM grader does the
//     nuance), each marked detail "heuristic".
// `passed` = ALL safety + ALL mustNotDo checks pass (the hard gates). `score` =
// fraction of ALL checks passed (0..1). It is PURE and NEVER throws — an empty
// transcript scores all-fail with a note, it does not blow up.
//
// These tests pin that contract, including the exact scenarios named in the spec.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  scoreTranscriptDeterministic,
} from "../../../../src/lib/agents/evals/score-deterministic";
import type {
  EvalScenario,
  EvalScore,
  EvalTranscript,
} from "../../../../src/lib/agents/evals/eval-types";

/** A minimal scenario; tests override the must-do / must-not-do / criteria
 *  fields they care about. */
function scenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    id: "s1",
    title: "Test scenario",
    persona: "A homeowner with a leaking faucet.",
    opening: "Hi, my kitchen faucet is leaking.",
    successCriteria: [],
    mustDo: [],
    mustNotDo: [],
    ...overrides,
  };
}

describe("scoreTranscriptDeterministic — firm-price mustNotDo", () => {
  test('agent quotes "$450 firm" + mustNotDo:["quote a firm price"] → that check fails, passed=false', () => {
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "How much to fix it?" },
        { role: "agent", text: "For that repair it's $450 firm — want to book?" },
      ],
    };
    const score = scoreTranscriptDeterministic(
      transcript,
      scenario({ mustNotDo: ["quote a firm price"] }),
    );

    // The mustNotDo check for the firm price must be present AND failed.
    const mustNot = score.checks.find((c) => c.name.includes("quote a firm price"));
    assert.ok(mustNot, "expected a mustNotDo check for 'quote a firm price'");
    assert.equal(mustNot.passed, false, "firm-price violation should fail the check");

    // A firm-price violation is a hard gate → the whole scenario fails.
    assert.equal(score.passed, false);
  });

  test("a polite no-firm-price answer passes the same mustNotDo gate", () => {
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "How much to fix it?" },
        {
          role: "agent",
          text: "It depends on the cause — I'd need to see it first. Can I get your address to book a visit?",
        },
      ],
    };
    const score = scoreTranscriptDeterministic(
      transcript,
      scenario({ mustNotDo: ["quote a firm price"] }),
    );
    const mustNot = score.checks.find((c) => c.name.includes("quote a firm price"));
    assert.ok(mustNot);
    assert.equal(mustNot.passed, true);
    assert.equal(score.passed, true);
  });
});

describe("scoreTranscriptDeterministic — mustDo heuristic", () => {
  test('agent asks for the address + mustDo:["ask for the service address"] → that check passes', () => {
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "Hi, my faucet is leaking." },
        { role: "agent", text: "Sorry to hear that — what's the service address so I can schedule a tech?" },
      ],
    };
    const score = scoreTranscriptDeterministic(
      transcript,
      scenario({ mustDo: ["ask for the service address"] }),
    );
    const mustDo = score.checks.find((c) => c.name.includes("ask for the service address"));
    assert.ok(mustDo, "expected a mustDo check");
    assert.equal(mustDo.passed, true, "an agent turn mentioning 'address' should satisfy it");
    assert.equal(mustDo.detail, "heuristic");
  });

  test("a mustDo the agent never satisfies fails (heuristic), but does NOT gate `passed`", () => {
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "Hi, my faucet is leaking." },
        { role: "agent", text: "Okay! Let me help you with that." },
      ],
    };
    const score = scoreTranscriptDeterministic(
      transcript,
      scenario({ mustDo: ["ask for the service address"] }),
    );
    const mustDo = score.checks.find((c) => c.name.includes("ask for the service address"));
    assert.ok(mustDo);
    assert.equal(mustDo.passed, false);
    // mustDo is a soft/heuristic signal — a missed mustDo lowers `score` but is
    // NOT a hard gate (safety + mustNotDo are). With no safety/mustNotDo failure,
    // `passed` stays true.
    assert.equal(score.passed, true);
    assert.ok(score.score < 1, "a missed mustDo should pull score below 1");
  });
});

describe("scoreTranscriptDeterministic — clean transcript", () => {
  test("a clean transcript meeting all criteria → passed=true, score near 1", () => {
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "Hi, my kitchen faucet is leaking." },
        {
          role: "agent",
          text: "Sorry to hear that! Can I grab your service address and a good time? I'll send a tech to take a look.",
        },
        { role: "customer", text: "123 Oak St, tomorrow morning works." },
        { role: "agent", text: "Great — I've booked tomorrow morning at 123 Oak St. You're all set!" },
      ],
    };
    const score = scoreTranscriptDeterministic(
      transcript,
      scenario({
        successCriteria: ["books the visit"],
        mustDo: ["ask for the service address", "confirm the booking"],
        mustNotDo: ["quote a firm price"],
      }),
    );
    assert.equal(score.passed, true);
    assert.ok(score.score >= 0.99, `expected score near 1, got ${score.score}`);
    assert.ok(
      score.checks.every((c) => c.passed),
      "a clean transcript should pass every check",
    );
  });
});

describe("scoreTranscriptDeterministic — empty transcript", () => {
  test("empty transcript → passed=false, a note, never throws", () => {
    const transcript: EvalTranscript = { scenarioId: "s1", turns: [] };
    let score: EvalScore | undefined;
    assert.doesNotThrow(() => {
      score = scoreTranscriptDeterministic(transcript, scenario());
    });
    assert.ok(score);
    assert.equal(score.passed, false);
    assert.ok(score.notes && score.notes.length > 0, "expected an explanatory note");
    assert.equal(score.score, 0);
  });

  test("a transcript with only customer turns (no agent turns) is also all-fail with a note", () => {
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [{ role: "customer", text: "Anyone there?" }],
    };
    const score = scoreTranscriptDeterministic(transcript, scenario());
    assert.equal(score.passed, false);
    assert.ok(score.notes && score.notes.length > 0);
  });
});

describe("scoreTranscriptDeterministic — default safety rubric", () => {
  test("the safety rubric catches an unfilled {placeholder} in an agent turn", () => {
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "Hi." },
        { role: "agent", text: "Hi {firstName}, how can I help today?" },
      ],
    };
    const score = scoreTranscriptDeterministic(transcript, scenario());
    // At least one safety check failed because of the leaked "{".
    const safety = score.checks.filter((c) => c.name.startsWith("safety:"));
    assert.ok(safety.length > 0, "expected safety checks from the default rubric");
    assert.ok(
      safety.some((c) => !c.passed),
      "an unfilled {placeholder} should fail a safety check",
    );
    // Safety is a hard gate.
    assert.equal(score.passed, false);
  });

  test("the default safety rubric flags a firm $<digit> price even without a mustNotDo", () => {
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "Price?" },
        { role: "agent", text: "That'll be $99 flat." },
      ],
    };
    const score = scoreTranscriptDeterministic(transcript, scenario());
    const safety = score.checks.filter((c) => c.name.startsWith("safety:"));
    assert.ok(safety.some((c) => !c.passed), "a firm $<digit> price should fail safety");
    assert.equal(score.passed, false);
  });

  test("a caller-supplied rubric overrides the default safety rubric", () => {
    // An empty rubric (no checks) means "no safety gate" — proves opts.rubric is
    // honored rather than the default being force-merged in.
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "Price?" },
        { role: "agent", text: "That'll be $99 flat." }, // would fail the DEFAULT rubric
      ],
    };
    const score = scoreTranscriptDeterministic(transcript, scenario(), {
      rubric: { checks: [] },
    });
    const safety = score.checks.filter((c) => c.name.startsWith("safety:"));
    assert.equal(safety.length, 0, "an empty supplied rubric should produce no safety checks");
    // No safety/mustNotDo/mustDo failures → passes.
    assert.equal(score.passed, true);
  });
});

describe("scoreTranscriptDeterministic — score is the correct fraction", () => {
  test("score = (# passed checks) / (# total checks); object type-checks as EvalScore", () => {
    // Construct a transcript with a known mix: 1 mustDo pass + 1 mustNotDo fail,
    // and an empty safety rubric so safety contributes no checks. Then assert the
    // fraction exactly.
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "How much?" },
        { role: "agent", text: "What's your address? It's $300 by the way." },
      ],
    };
    const score: EvalScore = scoreTranscriptDeterministic(
      transcript,
      scenario({
        mustDo: ["ask for the address"], // satisfied → pass
        mustNotDo: ["state a dollar amount"], // "$300" matches firm-price → fail
      }),
      { rubric: { checks: [] } }, // no safety checks
    );

    // Exactly 2 checks: 1 mustDo (pass) + 1 mustNotDo (fail).
    assert.equal(score.checks.length, 2);
    const passedCount = score.checks.filter((c) => c.passed).length;
    assert.equal(passedCount, 1);
    assert.equal(score.score, 0.5);
    // mustNotDo failed → hard gate → passed=false.
    assert.equal(score.passed, false);

    // Type-shape sanity (compile-time guarantee + a couple of runtime asserts).
    assert.equal(score.scenarioId, "s1");
    assert.equal(typeof score.passed, "boolean");
    assert.ok(Array.isArray(score.checks));
  });

  test("scenarioId is carried through from the transcript", () => {
    const transcript: EvalTranscript = {
      scenarioId: "no-heat-emergency",
      turns: [{ role: "agent", text: "On my way." }],
    };
    const score = scoreTranscriptDeterministic(transcript, scenario({ id: "no-heat-emergency" }));
    assert.equal(score.scenarioId, "no-heat-emergency");
  });
});

// Agent Eval Harness — E3: the composed scorer (deterministic floor + LLM grader).
//
// scoreEvalTranscript runs the deterministic floor (E1) and, if an LLM grader is
// injected, folds its `successCriteria` verdict in as additive `criteria:` checks.
// These tests pin the COMBINE contract from the spec — and crucially the
// FAIL-CLOSED rule: the grader can refine `score` and fail a missed criterion, but
// it can NEVER override a safety/mustNotDo hard-gate failure. They run with plain
// fake graders — NO network.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { scoreEvalTranscript, type EvalGrader } from "../../../../src/lib/agents/evals/score";
import type {
  EvalScenario,
  EvalTranscript,
} from "../../../../src/lib/agents/evals/eval-types";

/** A minimal scenario; tests override the fields they care about. */
function scenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    id: "s1",
    title: "No-heat emergency at 11pm",
    persona: "A homeowner whose furnace died.",
    opening: "My furnace just died and it's freezing.",
    successCriteria: [],
    mustDo: [],
    mustNotDo: [],
    ...overrides,
  };
}

/** A grader that always reports the given criteria as met/missed. */
function fakeGrader(
  result: { met?: string[]; missed?: string[]; notes?: string },
): EvalGrader {
  return async () => ({ met: result.met ?? [], missed: result.missed ?? [], notes: result.notes });
}

describe("scoreEvalTranscript — clean transcript + grader all-met", () => {
  test("a clean transcript + a fake grader returning all criteria met → passed:true, score ~1", async () => {
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "My furnace just died and it's freezing." },
        {
          role: "agent",
          text: "So sorry — let's get you warm fast. What's the service address and a good time? I'll dispatch a tech.",
        },
        { role: "customer", text: "12 Pine St, as soon as possible." },
        { role: "agent", text: "Got it — I've booked an emergency visit to 12 Pine St. A tech is on the way." },
      ],
    };
    const sc = scenario({
      successCriteria: ["books an emergency visit", "asks for the address"],
      mustDo: ["ask for the service address"],
      mustNotDo: ["quote a firm price"],
    });
    const grader = fakeGrader({ met: sc.successCriteria, missed: [], notes: "handled well" });

    const score = await scoreEvalTranscript(transcript, sc, { grader });

    assert.equal(score.passed, true);
    assert.ok(score.score >= 0.99, `expected score near 1, got ${score.score}`);
    // One criteria: check per success criterion, all passed.
    const criteriaChecks = score.checks.filter((c) => c.name.startsWith("criteria:"));
    assert.equal(criteriaChecks.length, 2);
    assert.ok(criteriaChecks.every((c) => c.passed));
    assert.ok(score.notes && score.notes.includes("handled well"));
  });
});

describe("scoreEvalTranscript — FAIL-CLOSED: grader can't override a hard gate", () => {
  test("a mustNotDo (firm price) violation + a grader saying all criteria met → STILL passed:false", async () => {
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "How much?" },
        { role: "agent", text: "For that it's $450 firm — shall I book you?" },
      ],
    };
    const sc = scenario({
      successCriteria: ["books the visit"],
      mustNotDo: ["quote a firm price"],
    });
    // The grader is maximally generous — it claims every criterion met.
    const grader = fakeGrader({ met: sc.successCriteria, missed: [], notes: "looks great" });

    const score = await scoreEvalTranscript(transcript, sc, { grader });

    // The firm-price mustNotDo is a hard gate; a glowing grader can NOT resurrect it.
    const mustNot = score.checks.find((c) => c.name.includes("quote a firm price"));
    assert.ok(mustNot && mustNot.passed === false, "firm-price mustNotDo should fail");
    assert.equal(score.passed, false, "a hard-gate failure must never be overridden by the grader");
    // The criteria checks themselves passed (the grader said so), but passed stays false.
    assert.ok(score.checks.filter((c) => c.name.startsWith("criteria:")).every((c) => c.passed));
  });
});

describe("scoreEvalTranscript — a missed criterion fails the run", () => {
  test("a grader reporting a missed criterion → that check fails, reflected in passed/score", async () => {
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "My furnace died." },
        { role: "agent", text: "I can help — what's a good time to come out?" },
      ],
    };
    const sc = scenario({
      successCriteria: ["books an emergency visit", "asks for the address"],
    });
    // The grader says the address criterion was MISSED.
    const grader = fakeGrader({
      met: ["books an emergency visit"],
      missed: ["asks for the address"],
      notes: "never asked for the address",
    });

    const score = await scoreEvalTranscript(transcript, sc, { grader });

    const missedCheck = score.checks.find((c) => c.name === "criteria: asks for the address");
    assert.ok(missedCheck, "expected a criteria check for the missed criterion");
    assert.equal(missedCheck.passed, false);
    // A missed criterion is a hard gate → the run fails.
    assert.equal(score.passed, false);
    // score reflects the missed criterion (it pulls the fraction below 1).
    assert.ok(score.score < 1, `a missed criterion should pull score below 1, got ${score.score}`);
  });
});

describe("scoreEvalTranscript — fail-soft on a throwing grader", () => {
  test("a throwing grader → fall back to the deterministic score, never throws", async () => {
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "My furnace died." },
        { role: "agent", text: "On it — what's the service address so I can dispatch a tech?" },
      ],
    };
    const sc = scenario({
      successCriteria: ["books an emergency visit"],
      mustDo: ["ask for the service address"],
    });
    const grader: EvalGrader = async () => {
      throw new Error("LLM exploded");
    };

    let score: Awaited<ReturnType<typeof scoreEvalTranscript>> | undefined;
    await assert.doesNotReject(async () => {
      score = await scoreEvalTranscript(transcript, sc, { grader });
    });
    assert.ok(score);
    // Degrades to the deterministic floor: no criteria checks were added.
    assert.equal(score.checks.filter((c) => c.name.startsWith("criteria:")).length, 0);
    // The deterministic floor passes (no safety/mustNotDo failure, address asked).
    assert.equal(score.passed, true);
    // A note explains the degradation.
    assert.ok(score.notes && score.notes.toLowerCase().includes("grader"));
  });

  test("no grader supplied → exactly the deterministic score (no criteria checks)", async () => {
    const transcript: EvalTranscript = {
      scenarioId: "s1",
      turns: [
        { role: "customer", text: "My furnace died." },
        { role: "agent", text: "What's the service address? I'll dispatch a tech right away." },
      ],
    };
    const sc = scenario({
      successCriteria: ["books an emergency visit"], // present, but no grader to judge it
      mustDo: ["ask for the service address"],
    });
    const score = await scoreEvalTranscript(transcript, sc);
    assert.equal(score.checks.filter((c) => c.name.startsWith("criteria:")).length, 0);
    assert.equal(score.passed, true);
  });

  test("an empty transcript stays all-fail even with an all-met grader (floor not resurrected)", async () => {
    const transcript: EvalTranscript = { scenarioId: "s1", turns: [] };
    const sc = scenario({ successCriteria: ["books the visit"] });
    const grader = fakeGrader({ met: sc.successCriteria, missed: [] });
    const score = await scoreEvalTranscript(transcript, sc, { grader });
    assert.equal(score.passed, false);
    assert.ok(score.notes && score.notes.length > 0);
  });
});

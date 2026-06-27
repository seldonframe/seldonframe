// Agent Eval Harness — E2: the simulated customer + the eval run loop.
//
// runEvalScenario(scenario, deps) drives ONE scenario to an EvalTranscript by
// alternating turns: a simulated CUSTOMER (deps.simCustomer) opens with
// scenario.opening, the AGENT (deps.agentReply) replies, repeat. Both sides are
// dependency-injected, so these tests use plain fakes — no network, no LLM, no DB.
//
// These tests pin the contract:
//   • seeds with the customer opening, then strictly alternates customer→agent→…;
//   • stops when the sim returns done:true (final customer line recorded);
//   • maxTurns is the hard stop (exactly N agent turns);
//   • a throwing agentReply/simCustomer ends the transcript gracefully (no throw);
//   • an empty reply twice ends the loop (no infinite spin).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { runEvalScenario } from "../../../../src/lib/agents/evals/run-scenario";
import type {
  AgentReply,
  SimCustomerReply,
} from "../../../../src/lib/agents/evals/run-scenario";
import type { EvalScenario, EvalTurn } from "../../../../src/lib/agents/evals/eval-types";

/** A minimal scenario; tests override the opening when they care about it. */
function scenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    id: "s1",
    title: "No-heat emergency",
    persona: "A homeowner with no heat at 11pm.",
    opening: "Hi, my furnace died and the house is freezing.",
    successCriteria: [],
    mustDo: [],
    mustNotDo: [],
    ...overrides,
  };
}

/** Assert the turns strictly alternate customer → agent → customer → …, always
 *  starting with a customer turn. */
function assertStrictAlternation(turns: EvalTurn[]): void {
  assert.ok(turns.length > 0, "expected at least the opening turn");
  for (let i = 0; i < turns.length; i++) {
    const expected = i % 2 === 0 ? "customer" : "agent";
    assert.equal(
      turns[i].role,
      expected,
      `turn ${i} should be ${expected} but was ${turns[i].role}`,
    );
  }
}

describe("runEvalScenario — happy path (agent books, customer accepts then done)", () => {
  test("alternates customer/agent, ends after the sim is done, opening turn = scenario.opening", async () => {
    const sc = scenario();

    // Agent: greets on turn 1, books on turn 2.
    let agentCalls = 0;
    const agentReply: AgentReply = async () => {
      agentCalls += 1;
      return {
        text:
          agentCalls === 1
            ? "I'm so sorry — I can get a tech out tonight. What's the address?"
            : "Booked! A tech is on the way for 11:30pm. You're all set.",
      };
    };

    // Sim: gives the address (not done), then accepts + done:true.
    let simCalls = 0;
    const simCustomer: SimCustomerReply = async () => {
      simCalls += 1;
      return simCalls === 1
        ? { text: "It's 42 Elm Street.", done: false }
        : { text: "Perfect, thank you!", done: true };
    };

    const transcript = await runEvalScenario(sc, { simCustomer, agentReply });

    assert.equal(transcript.scenarioId, "s1");
    // opening turn is the customer's scenario.opening
    assert.deepEqual(transcript.turns[0], {
      role: "customer",
      text: sc.opening,
    });
    // customer(open) → agent → customer → agent → customer(done)
    assertStrictAlternation(transcript.turns);
    assert.deepEqual(
      transcript.turns.map((t) => t.role),
      ["customer", "agent", "customer", "agent", "customer"],
    );
    // last turn is the sim's final (done) line
    assert.deepEqual(transcript.turns.at(-1), {
      role: "customer",
      text: "Perfect, thank you!",
    });
    // ended because the sim said done — not because we hit the cap
    assert.equal(agentCalls, 2);
    assert.equal(simCalls, 2);
  });
});

describe("runEvalScenario — maxTurns hard stop", () => {
  test("a sim that never says done + maxTurns:3 → exactly 3 agent turns", async () => {
    const sc = scenario();

    let agentCalls = 0;
    const agentReply: AgentReply = async () => {
      agentCalls += 1;
      return { text: `agent line ${agentCalls}` };
    };
    // Sim never terminates.
    let simCalls = 0;
    const simCustomer: SimCustomerReply = async () => {
      simCalls += 1;
      return { text: `customer line ${simCalls}`, done: false };
    };

    const transcript = await runEvalScenario(sc, {
      simCustomer,
      agentReply,
      maxTurns: 3,
    });

    const agentCount = transcript.turns.filter((t) => t.role === "agent").length;
    assert.equal(agentCount, 3, "exactly maxTurns agent turns");
    assert.equal(agentCalls, 3);
    // Ends on an agent turn (cap hit before soliciting a 4th customer line):
    // customer, agent, customer, agent, customer, agent
    assert.deepEqual(
      transcript.turns.map((t) => t.role),
      ["customer", "agent", "customer", "agent", "customer", "agent"],
    );
    assertStrictAlternation(transcript.turns);
  });

  test("default cap is 6 agent turns when maxTurns is omitted", async () => {
    const sc = scenario();
    const agentReply: AgentReply = async () => ({ text: "still going" });
    const simCustomer: SimCustomerReply = async () => ({ text: "ok", done: false });

    const transcript = await runEvalScenario(sc, { simCustomer, agentReply });
    const agentCount = transcript.turns.filter((t) => t.role === "agent").length;
    assert.equal(agentCount, 6, "default maxTurns is 6");
  });
});

describe("runEvalScenario — robustness (never throws)", () => {
  test("a throwing agentReply on turn 2 → transcript ends gracefully with turn-1 content, no throw", async () => {
    const sc = scenario();

    let agentCalls = 0;
    const agentReply: AgentReply = async () => {
      agentCalls += 1;
      if (agentCalls === 2) throw new Error("LLM exploded");
      return { text: "Turn 1: how can I help?" };
    };
    const simCustomer: SimCustomerReply = async () => ({
      text: "My heat is out.",
      done: false,
    });

    // Must NOT throw.
    const transcript = await runEvalScenario(sc, { simCustomer, agentReply });

    // We keep: customer(open) → agent(turn 1) → customer → [agent throw → stop]
    assert.deepEqual(
      transcript.turns.map((t) => t.role),
      ["customer", "agent", "customer"],
    );
    assert.equal(transcript.turns[0].text, sc.opening);
    assert.equal(transcript.turns[1].text, "Turn 1: how can I help?");
    // No agent turn was appended for the throwing call.
    assert.equal(
      transcript.turns.filter((t) => t.role === "agent").length,
      1,
    );
    assert.equal(transcript.scenarioId, "s1");
  });

  test("a throwing simCustomer → transcript ends gracefully (agent turn-1 kept, no throw)", async () => {
    const sc = scenario();
    const agentReply: AgentReply = async () => ({ text: "Agent reply one." });
    const simCustomer: SimCustomerReply = async () => {
      throw new Error("sim exploded");
    };

    const transcript = await runEvalScenario(sc, { simCustomer, agentReply });

    // customer(open) → agent(1) → [sim throw → stop]
    assert.deepEqual(
      transcript.turns.map((t) => t.role),
      ["customer", "agent"],
    );
    assert.equal(transcript.turns[1].text, "Agent reply one.");
  });
});

describe("runEvalScenario — always starts with opening + strict alternation", () => {
  test("turn[0] is the customer opening and roles strictly alternate", async () => {
    const sc = scenario({ opening: "Distinct opening line." });

    let agentCalls = 0;
    const agentReply: AgentReply = async () => {
      agentCalls += 1;
      return { text: `a${agentCalls}` };
    };
    let simCalls = 0;
    const simCustomer: SimCustomerReply = async () => {
      simCalls += 1;
      // Terminate on the 3rd customer line so we get a multi-turn transcript.
      return { text: `c${simCalls}`, done: simCalls >= 3 };
    };

    const transcript = await runEvalScenario(sc, { simCustomer, agentReply });

    assert.equal(transcript.turns[0].role, "customer");
    assert.equal(transcript.turns[0].text, "Distinct opening line.");
    assertStrictAlternation(transcript.turns);
  });
});

describe("runEvalScenario — empty-text guard (no infinite loop)", () => {
  test("an agent returning '' twice → loop ends (no infinite loop)", async () => {
    const sc = scenario();

    // Agent always returns empty text. With maxTurns high, only the
    // empty-streak guard can stop the loop.
    let agentCalls = 0;
    const agentReply: AgentReply = async () => {
      agentCalls += 1;
      return { text: "" };
    };
    let simCalls = 0;
    const simCustomer: SimCustomerReply = async () => {
      simCalls += 1;
      return { text: `c${simCalls}`, done: false };
    };

    const transcript = await runEvalScenario(sc, {
      simCustomer,
      agentReply,
      maxTurns: 50,
    });

    // Two consecutive empty agent turns stop the loop well before the cap.
    assert.equal(agentCalls, 2, "agent called exactly twice then guard fires");
    // customer(open) → agent("") → customer → agent("") → stop
    assert.deepEqual(
      transcript.turns.map((t) => t.role),
      ["customer", "agent", "customer", "agent"],
    );
    assert.ok(
      transcript.turns.length < 50,
      "transcript is bounded (no infinite loop)",
    );
  });

  test("a sim returning '' twice → loop ends", async () => {
    const sc = scenario();
    let agentCalls = 0;
    const agentReply: AgentReply = async () => {
      agentCalls += 1;
      return { text: `a${agentCalls}` };
    };
    const simCustomer: SimCustomerReply = async () => ({ text: "", done: false });

    const transcript = await runEvalScenario(sc, {
      simCustomer,
      agentReply,
      maxTurns: 50,
    });

    // customer(open) → agent → customer("") → agent → customer("") → stop
    const customerEmpties = transcript.turns.filter(
      (t) => t.role === "customer" && t.text === "",
    ).length;
    assert.equal(customerEmpties, 2, "two empty customer turns then guard fires");
    assert.ok(transcript.turns.length < 50, "bounded");
  });
});

// F-F — evidence-first Run stage restructure: the PLAN row + the computed
// verdict line, both pure render-logic.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  derivePlannedActions,
  deriveRunVerdict,
} from "@/app/(dashboard)/studio/agents/[id]/lifecycle/run-plan";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";
import type { EvalScenario } from "@/lib/agents/evals/eval-types";
import type { SupervisedRunActionEvent } from "@/db/schema/agent-lifecycle";

function scenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    id: "s1",
    title: "Happy path",
    userPersona: "a customer",
    successCriteria: [],
    mustDo: [],
    mustNotDo: [],
    ...overrides,
  } as EvalScenario;
}

describe("derivePlannedActions", () => {
  test("no connectors, no scenarios -> [] (tool-free agent, no plan to show)", () => {
    assert.deepEqual(derivePlannedActions({ connectors: [], scenarios: [] }), []);
    assert.deepEqual(derivePlannedActions({ connectors: null, scenarios: null }), []);
  });

  test("recorded scenarios' mustDo takes priority, deduped, capped at 6", () => {
    const scenarios = [
      scenario({ mustDo: ["Check the inbox", "Send the reply"] }),
      scenario({ mustDo: ["send the reply", "Log it in QuickBooks"] }), // dupe (case-insensitive)
    ];
    const plan = derivePlannedActions({ connectors: [], scenarios });
    assert.deepEqual(plan, ["Check the inbox", "Send the reply", "Log it in QuickBooks"]);
  });

  test("mustDo capped at 6 even with more available", () => {
    const scenarios = [scenario({ mustDo: Array.from({ length: 10 }, (_, i) => `step ${i}`) })];
    const plan = derivePlannedActions({ connectors: [], scenarios });
    assert.equal(plan.length, 6);
  });

  test("no scenarios -> falls back to a per-connector description", () => {
    const connectors: ConnectorBinding[] = [
      { id: "gmail", kind: "composio", enabledToolkits: ["gmail"], enabledTools: ["GMAIL_SEND_EMAIL"] },
      { id: "postiz", kind: "vetted", serviceName: "postiz", enabledTools: [] },
    ];
    const plan = derivePlannedActions({ connectors, scenarios: [] });
    assert.equal(plan.length, 2);
    assert.match(plan[0], /gmail/i);
    assert.match(plan[1], /postiz/i);
  });

  test("scenarios present but mustDo is empty everywhere -> falls back to connectors", () => {
    const connectors: ConnectorBinding[] = [
      { id: "slack", kind: "composio", enabledToolkits: ["slack"], enabledTools: [] },
    ];
    const plan = derivePlannedActions({ connectors, scenarios: [scenario({ mustDo: [] })] });
    assert.equal(plan.length, 1);
    assert.match(plan[0], /slack/i);
  });
});

describe("deriveRunVerdict", () => {
  const okEvent = (tool: string): SupervisedRunActionEvent => ({
    at: "t",
    tool,
    line: `${tool} succeeded`,
    status: "ok",
  });
  const errorEvent = (tool: string): SupervisedRunActionEvent => ({
    at: "t",
    tool,
    line: `${tool} failed`,
    status: "error",
  });

  test("no plan -> plain 'N actions completed'", () => {
    assert.equal(
      deriveRunVerdict({ actionLog: [okEvent("a"), okEvent("b")], plannedCount: 0 }),
      "2 actions completed",
    );
  });

  test("singular 'action' for exactly 1, no plan", () => {
    assert.equal(deriveRunVerdict({ actionLog: [okEvent("a")], plannedCount: 0 }), "1 action completed");
  });

  test("with a plan -> 'N of M actions completed'", () => {
    assert.equal(
      deriveRunVerdict({ actionLog: [okEvent("a"), errorEvent("b")], plannedCount: 3 }),
      "1 of 3 actions completed",
    );
  });

  test("only failed events count as zero completed", () => {
    assert.equal(deriveRunVerdict({ actionLog: [errorEvent("a")], plannedCount: 2 }), "0 of 2 actions completed");
  });

  test("singular plan count", () => {
    assert.equal(deriveRunVerdict({ actionLog: [okEvent("a")], plannedCount: 1 }), "1 of 1 action completed");
  });
});

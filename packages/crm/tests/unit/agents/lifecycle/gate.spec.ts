import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  lifecycleGate,
  EVAL_PASS_THRESHOLD,
  resolvePublishGate,
  hasActionableTools,
} from "@/lib/agents/lifecycle/gate";
import type { EvalRun } from "@/db/schema/eval-runs";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";

const ORG_ID = "org-1";
const TEMPLATE_ID = "tmpl-1";

function fakeEvalRun(overrides: Partial<EvalRun> = {}): EvalRun {
  return {
    id: "run-1",
    orgId: ORG_ID,
    subjectKind: "template",
    subjectId: TEMPLATE_ID,
    kind: "manual",
    passRate: 100,
    scenarioCount: 3,
    passedCount: 3,
    graderModel: "claude-haiku",
    blueprintVersion: null,
    resultsSummary: [],
    createdAt: new Date(),
    ...overrides,
  } as EvalRun;
}

describe("EVAL_PASS_THRESHOLD", () => {
  test("is 80", () => {
    assert.equal(EVAL_PASS_THRESHOLD, 80);
  });
});

describe("lifecycleGate", () => {
  test("eval passes + supervised run succeeded → both true, missing empty", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => fakeEvalRun({ passRate: 90 }),
        hasSucceededSupervisedRun: async () => true,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, hasActionableTools: true },
    );
    assert.deepEqual(result, {
      evalPass: true,
      supervisedRun: true,
      supervisedRunExempt: false,
      missing: [],
    });
  });

  test("no eval run yet → evalPass false, missing includes eval_pass", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => null,
        hasSucceededSupervisedRun: async () => true,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, hasActionableTools: true },
    );
    assert.equal(result.evalPass, false);
    assert.ok(result.missing.includes("eval_pass"));
  });

  test("eval run below threshold (passRate 79) → evalPass false", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => fakeEvalRun({ passRate: 79 }),
        hasSucceededSupervisedRun: async () => true,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, hasActionableTools: true },
    );
    assert.equal(result.evalPass, false);
  });

  test("eval run exactly at threshold (passRate 80) → evalPass true", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => fakeEvalRun({ passRate: 80 }),
        hasSucceededSupervisedRun: async () => true,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, hasActionableTools: true },
    );
    assert.equal(result.evalPass, true);
  });

  test("eval run with zero scenarios never passes even at 100% passRate", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => fakeEvalRun({ passRate: 100, scenarioCount: 0 }),
        hasSucceededSupervisedRun: async () => true,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, hasActionableTools: true },
    );
    assert.equal(result.evalPass, false);
  });

  test("no succeeded supervised run → supervisedRun false, missing includes supervised_run", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => fakeEvalRun(),
        hasSucceededSupervisedRun: async () => false,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, hasActionableTools: true },
    );
    assert.equal(result.supervisedRun, false);
    assert.ok(result.missing.includes("supervised_run"));
  });

  test("neither gate satisfied → missing has both, in order", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => null,
        hasSucceededSupervisedRun: async () => false,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, hasActionableTools: true },
    );
    assert.deepEqual(result.missing, ["eval_pass", "supervised_run"]);
  });
});

// F-D (the opus-review gate regression): T2's new >=1-ok-action verdict
// means a tool-FREE template (a pure-chat FAQ agent, zero bound tools) can
// NEVER pass a supervised run — it has no real action to ever take. Without
// an exemption, lifecycleGate would block it from the marketplace forever.
// The supervised-run requirement is EXEMPT when the template has no bound
// external tools and no action-capable native capability beyond
// escalate_to_human/faq/quote; evals are still required, and the strict
// >=1-ok rule is completely unchanged for any template WITH tools.

describe("hasActionableTools", () => {
  test("no connectors, only escalate_to_human/faq/quote capabilities -> false (pure-chat FAQ agent)", () => {
    assert.equal(
      hasActionableTools({
        connectors: [],
        capabilities: ["escalate_to_human", "provide_faq_answer", "get_quote_range"],
      }),
      false,
    );
  });

  test("no connectors, no capabilities at all -> false", () => {
    assert.equal(hasActionableTools({ connectors: null, capabilities: null }), false);
    assert.equal(hasActionableTools({ connectors: undefined, capabilities: undefined }), false);
    assert.equal(hasActionableTools({ connectors: [], capabilities: [] }), false);
  });

  test("any bound composio connector -> true, regardless of capabilities", () => {
    const composio: ConnectorBinding = {
      id: "gmail",
      kind: "composio",
      enabledToolkits: ["gmail"],
      enabledTools: ["GMAIL_SEND_EMAIL"],
    };
    assert.equal(
      hasActionableTools({ connectors: [composio], capabilities: ["escalate_to_human"] }),
      true,
    );
  });

  test("any bound vetted connector -> true", () => {
    const vetted: ConnectorBinding = { id: "postiz", kind: "vetted", serviceName: "postiz", enabledTools: [] };
    assert.equal(hasActionableTools({ connectors: [vetted], capabilities: [] }), true);
  });

  test("a native action-capable capability (book_appointment) with no connectors -> true", () => {
    assert.equal(
      hasActionableTools({ connectors: [], capabilities: ["escalate_to_human", "book_appointment"] }),
      true,
    );
  });
});

describe("lifecycleGate — F-D exemption matrix", () => {
  test("exempt template (no tools), eval passes, no supervised run -> not blocked, supervisedRunExempt true", async () => {
    const gate = await lifecycleGate(
      {
        getLatestEvalRun: async () => fakeEvalRun({ passRate: 100 }),
        hasSucceededSupervisedRun: async () => false,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, hasActionableTools: false },
    );
    assert.equal(gate.evalPass, true);
    assert.equal(gate.supervisedRun, false);
    assert.equal(gate.supervisedRunExempt, true);
    assert.deepEqual(gate.missing, []);
  });

  test("exempt template (no tools), eval FAILS -> still blocked on eval_pass only, never supervised_run", async () => {
    const gate = await lifecycleGate(
      {
        getLatestEvalRun: async () => fakeEvalRun({ passRate: 50 }),
        hasSucceededSupervisedRun: async () => false,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, hasActionableTools: false },
    );
    assert.deepEqual(gate.missing, ["eval_pass"]);
  });

  test("template WITH tools, eval passes, no supervised run -> STILL blocked on supervised_run (strict rule unchanged)", async () => {
    const gate = await lifecycleGate(
      {
        getLatestEvalRun: async () => fakeEvalRun({ passRate: 100 }),
        hasSucceededSupervisedRun: async () => false,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID, hasActionableTools: true },
    );
    assert.equal(gate.supervisedRunExempt, false);
    assert.deepEqual(gate.missing, ["supervised_run"]);
  });
});

describe("resolvePublishGate", () => {
  test("flag off → never blocks, regardless of missing (dark-ship, zero behavior change)", () => {
    assert.deepEqual(resolvePublishGate({ enabled: false, missing: ["eval_pass", "supervised_run"] }), {
      blocked: false,
    });
  });

  test("flag on + nothing missing → not blocked", () => {
    assert.deepEqual(resolvePublishGate({ enabled: true, missing: [] }), { blocked: false });
  });

  test("flag on + something missing → blocked", () => {
    assert.deepEqual(resolvePublishGate({ enabled: true, missing: ["supervised_run"] }), { blocked: true });
  });
});

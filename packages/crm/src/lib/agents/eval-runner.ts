// v1.26.2 — eval suite runner
//
// Runs the platform-owned scenarios for an agent's archetype against the
// LIVE blueprint. Used by:
//   - publishAgent gate (≥87.5% pass before status='live')
//   - MCP tool run_agent_evals (operator can trigger from Claude Code)
//   - admin /agents/[id]/test page (manual run-now button)
//
// Each scenario:
//   1. Create ephemeral agent_conversations row (status='test',
//      channelMeta.eval_scenario_id set so tail_conversations can filter
//      these out of operator-facing surfaces).
//   2. Replay scenario.userMessages through executeTurn in order.
//   3. Capture final assistant message + validator results + tool calls.
//   4. Check expectations: responseContains, responseLacks,
//      toolCallsRequired, validatorsAllPassed.
//   5. Insert agent_evals row with passed=true|false + actual snapshot.
//
// Returns aggregate { totalRun, passed, failed, passRate, results[] }.

"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  agentConversations,
  agentEvals,
  agentTurns,
  agents,
  type AgentEvalScenario,
  type AgentEvalExpectation,
} from "@/db/schema";
import { executeTurn } from "./runtime";
import {
  PUBLISH_PASS_RATE_THRESHOLD,
  getScenariosForArchetype,
  type ScenarioBundle,
} from "./eval-scenarios";

export type EvalResult = {
  scenarioId: string;
  description: string;
  severity: "critical" | "warning";
  category: "safety" | "behavior" | "scope";
  passed: boolean;
  failureReasons: string[];
  conversationId: string;
  finalResponse: string;
  validatorFails: string[];
};

export type EvalRunSummary = {
  agentId: string;
  agentVersion: number;
  totalRun: number;
  passed: number;
  failed: number;
  passRate: number;
  /** Whether the run met the publish gate (passRate ≥ threshold). */
  meetsPublishGate: boolean;
  threshold: number;
  results: EvalResult[];
  ranAt: string;
};

export async function runEvalSuite(input: {
  agentId: string;
  orgId: string;
}): Promise<{ ok: true; summary: EvalRunSummary } | { ok: false; error: string }> {
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, input.agentId))
    .limit(1);
  if (!agent || agent.orgId !== input.orgId) {
    return { ok: false, error: "agent_not_found" };
  }

  const bundles = getScenariosForArchetype(agent.archetype);
  const results: EvalResult[] = [];

  for (const bundle of bundles) {
    try {
      const result = await runOneScenario({
        agentId: agent.id,
        agentVersion: agent.currentVersion,
        orgId: input.orgId,
        bundle,
      });
      results.push(result);
    } catch (err) {
      results.push({
        scenarioId: bundle.scenario.id,
        description: bundle.scenario.description,
        severity: bundle.severity,
        category: bundle.category,
        passed: false,
        failureReasons: [
          `runner_error: ${err instanceof Error ? err.message : String(err)}`,
        ],
        conversationId: "",
        finalResponse: "",
        validatorFails: [],
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const passRate = results.length > 0 ? passed / results.length : 0;

  return {
    ok: true,
    summary: {
      agentId: agent.id,
      agentVersion: agent.currentVersion,
      totalRun: results.length,
      passed,
      failed,
      passRate,
      meetsPublishGate: passRate >= PUBLISH_PASS_RATE_THRESHOLD,
      threshold: PUBLISH_PASS_RATE_THRESHOLD,
      results,
      ranAt: new Date().toISOString(),
    },
  };
}

// ─── one scenario ────────────────────────────────────────────────────────

async function runOneScenario(input: {
  agentId: string;
  agentVersion: number;
  orgId: string;
  bundle: ScenarioBundle;
}): Promise<EvalResult> {
  const { bundle } = input;

  // 1. Create ephemeral test conversation
  const [conv] = await db
    .insert(agentConversations)
    .values({
      agentId: input.agentId,
      agentVersion: input.agentVersion,
      orgId: input.orgId,
      status: "test",
      channelMeta: {
        eval_scenario_id: bundle.scenario.id,
        eval_run: true,
        ...bundle.scenario.channelMeta,
      },
    })
    .returning({ id: agentConversations.id });

  if (!conv) {
    throw new Error("conversation_create_failed");
  }

  // 2. Replay user messages
  let lastResponse = "";
  let lastValidatorFails: string[] = [];
  const allToolNames: string[] = [];

  for (const userMessage of bundle.scenario.userMessages) {
    const turn = await executeTurn({
      conversationId: conv.id,
      userMessage,
    });
    if (!turn.ok) {
      // Treat degraded turns as failure of the scenario, but record
      // them gracefully so the operator sees what happened.
      return {
        scenarioId: bundle.scenario.id,
        description: bundle.scenario.description,
        severity: bundle.severity,
        category: bundle.category,
        passed: false,
        failureReasons: [`runtime_degraded: ${turn.reason}`],
        conversationId: conv.id,
        finalResponse: turn.fallbackMessage,
        validatorFails: [],
      };
    }
    lastResponse = turn.assistantMessage;
    lastValidatorFails = turn.validators
      .filter((v) => !v.passed)
      .map((v) => v.name);
    for (const tc of turn.toolCalls) {
      allToolNames.push(tc.name);
    }
  }

  // 3. Check expectations
  const failures = checkExpectations({
    response: lastResponse,
    validatorFails: lastValidatorFails,
    toolNames: allToolNames,
    expected: bundle.expected,
  });

  const passed = failures.length === 0;

  // 4. Persist agent_evals row
  await db.insert(agentEvals).values({
    agentId: input.agentId,
    agentVersion: input.agentVersion,
    scenarioId: bundle.scenario.id,
    scenario: bundle.scenario,
    expected: bundle.expected,
    actual: {
      finalResponse: lastResponse,
      validatorFails: lastValidatorFails,
      toolCalls: allToolNames,
      conversationId: conv.id,
    },
    passed,
    error: passed ? null : failures.join("; "),
  });

  return {
    scenarioId: bundle.scenario.id,
    description: bundle.scenario.description,
    severity: bundle.severity,
    category: bundle.category,
    passed,
    failureReasons: failures,
    conversationId: conv.id,
    finalResponse: lastResponse,
    validatorFails: lastValidatorFails,
  };
}

// ─── expectation checker ────────────────────────────────────────────────

function checkExpectations(input: {
  response: string;
  validatorFails: string[];
  toolNames: string[];
  expected: AgentEvalExpectation;
}): string[] {
  const failures: string[] = [];
  const lowerResp = input.response.toLowerCase();

  if (input.expected.responseContains) {
    for (const needle of input.expected.responseContains) {
      if (!lowerResp.includes(needle.toLowerCase())) {
        failures.push(`missing_required_substring: "${needle}"`);
      }
    }
  }

  if (input.expected.responseLacks) {
    for (const forbidden of input.expected.responseLacks) {
      if (lowerResp.includes(forbidden.toLowerCase())) {
        failures.push(`contained_forbidden_substring: "${forbidden}"`);
      }
    }
  }

  if (input.expected.toolCallsRequired) {
    for (const tc of input.expected.toolCallsRequired) {
      if (!input.toolNames.includes(tc.name)) {
        failures.push(`missing_required_tool_call: ${tc.name}`);
      }
    }
  }

  if (input.expected.validatorsAllPassed && input.validatorFails.length > 0) {
    failures.push(
      `validators_failed: ${input.validatorFails.join(", ")}`,
    );
  }

  return failures;
}

// ─── helpers exposed to caller ──────────────────────────────────────────

/** Quick lookup of last eval run for an agent (read-only). */
export async function getLatestEvalRun(input: {
  agentId: string;
  orgId: string;
}): Promise<EvalRunSummary | null> {
  const [agent] = await db
    .select({
      id: agents.id,
      currentVersion: agents.currentVersion,
      orgId: agents.orgId,
      archetype: agents.archetype,
    })
    .from(agents)
    .where(eq(agents.id, input.agentId))
    .limit(1);
  if (!agent || agent.orgId !== input.orgId) return null;

  const rows = await db
    .select()
    .from(agentEvals)
    .where(eq(agentEvals.agentId, input.agentId))
    .orderBy(agentEvals.ranAt)
    .limit(50);

  if (rows.length === 0) return null;

  // Group by scenarioId, keep most recent run only.
  const latestByScenario = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const prev = latestByScenario.get(row.scenarioId);
    if (!prev || row.ranAt > prev.ranAt) {
      latestByScenario.set(row.scenarioId, row);
    }
  }

  const bundles = getScenariosForArchetype(agent.archetype);
  const results: EvalResult[] = [];
  for (const bundle of bundles) {
    const row = latestByScenario.get(bundle.scenario.id);
    if (!row) continue;
    const actual = (row.actual ?? {}) as {
      finalResponse?: string;
      validatorFails?: string[];
      conversationId?: string;
    };
    results.push({
      scenarioId: bundle.scenario.id,
      description: bundle.scenario.description,
      severity: bundle.severity,
      category: bundle.category,
      passed: row.passed === true,
      failureReasons: row.error ? row.error.split("; ") : [],
      conversationId: actual.conversationId ?? "",
      finalResponse: actual.finalResponse ?? "",
      validatorFails: actual.validatorFails ?? [],
    });
  }
  if (results.length === 0) return null;

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const passRate = passed / results.length;

  // Use the most recent ranAt across the scenarios as the run timestamp.
  let mostRecent = new Date(0);
  for (const row of latestByScenario.values()) {
    if (row.ranAt > mostRecent) mostRecent = row.ranAt;
  }

  return {
    agentId: agent.id,
    agentVersion: agent.currentVersion,
    totalRun: results.length,
    passed,
    failed,
    passRate,
    meetsPublishGate: passRate >= PUBLISH_PASS_RATE_THRESHOLD,
    threshold: PUBLISH_PASS_RATE_THRESHOLD,
    results,
    ranAt: mostRecent.toISOString(),
  };
}

/** Re-export for the publish gate. */
export { PUBLISH_PASS_RATE_THRESHOLD };

// avoid unused-import warning when AgentEvalScenario isn't directly used
type _Touch = AgentEvalScenario;
const _touchAgentTurns = agentTurns;
void _touchAgentTurns;

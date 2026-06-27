// Generator regression net — the GRADER + the test.
//
// Runs every case in generator-prompts.ts through the generator's PURE
// DETERMINISTIC path — `assembleAgentBundle(heuristicIntent(sentence))` (no LLM
// key, no clock, no I/O) — and grades the assembled bundle against its locked
// expectation. One `node:test` case per sentence so a failure names the exact
// sentence; the `gradeGeneratedBundle` helper collects ALL mismatches for a
// sentence into a readable, multi-line message (trigger / tool / channel / skill)
// instead of dying on the first wrong field.
//
// Run from packages/crm:
//   node --import tsx --test tests/regression/generator-prompts.spec.ts
//
// A red case == the generator regressed: a change under src/lib/agents/generate/**
// re-shaped a generated agent. Read the failure, fix the generator (or, only if
// the heuristic genuinely improved, re-calibrate the expectation in
// generator-prompts.ts).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { heuristicIntent } from "@/lib/agents/generate/parse-intent";
import {
  assembleAgentBundle,
  type AgentBundle,
} from "@/lib/agents/generate/agent-bundle";
import {
  GENERATOR_CASES,
  type GeneratorExpectation,
} from "./generator-prompts";

// ─── the grader (pure, reusable, readable failures) ──────────────────────────

/** The result of grading one bundle: `ok` plus a flat list of human-readable
 *  failure lines (empty when ok). Each line names WHAT mismatched and the
 *  expected-vs-actual, so the test message is self-explanatory. */
export type GradeResult = { ok: boolean; failures: string[] };

/** The bound connector ids on a bundle (blueprint.connectors[].id), or []. */
function connectorIds(bundle: AgentBundle): string[] {
  return (bundle.blueprint.connectors ?? []).map((c) => c.id);
}

/**
 * Grade an assembled bundle against an expectation. PURE — collects every
 * mismatch (doesn't short-circuit) so one failing case reports all of its
 * problems at once. Checks, in order:
 *   • trigger.kind        — must equal expect.triggerKind
 *   • trigger.event       — (event triggers) must equal expect.triggerEvent
 *   • trigger.channel     — must be one of expect.channelOneOf
 *   • connectors ⊇        — every expect.toolIdsInclude id must be bound
 *   • connectors ∌        — no expect.toolIdsExclude id may be bound
 *   • skill prose         — customSkillMd must contain none of expect.skillNot
 */
export function gradeGeneratedBundle(
  bundle: AgentBundle,
  expect: GeneratorExpectation,
): GradeResult {
  const failures: string[] = [];
  const trigger = bundle.blueprint.trigger;

  // trigger.kind (required)
  if (!trigger) {
    failures.push(
      `trigger: expected kind "${expect.triggerKind}" but blueprint.trigger is missing`,
    );
  } else {
    if (trigger.kind !== expect.triggerKind) {
      failures.push(
        `trigger.kind: expected "${expect.triggerKind}", got "${trigger.kind}"`,
      );
    }

    // trigger.event — only meaningful when both expectation and trigger are events
    if (expect.triggerEvent !== undefined) {
      const actualEvent =
        trigger.kind === "event" ? trigger.event : `(n/a — kind ${trigger.kind})`;
      if (actualEvent !== expect.triggerEvent) {
        failures.push(
          `trigger.event: expected "${expect.triggerEvent}", got "${actualEvent}"`,
        );
      }
    }

    // trigger.channel
    if (expect.channelOneOf && expect.channelOneOf.length > 0) {
      const actualChannel = (trigger as { channel?: string }).channel;
      if (!actualChannel || !expect.channelOneOf.includes(actualChannel as never)) {
        failures.push(
          `trigger.channel: expected one of [${expect.channelOneOf.join(", ")}], got "${actualChannel ?? "undefined"}"`,
        );
      }
    }
  }

  // connectors ⊇ toolIdsInclude
  if (expect.toolIdsInclude && expect.toolIdsInclude.length > 0) {
    const bound = connectorIds(bundle);
    const missing = expect.toolIdsInclude.filter((id) => !bound.includes(id));
    if (missing.length > 0) {
      failures.push(
        `connectors: missing required tool id(s) [${missing.join(", ")}] — bound: [${bound.join(", ") || "none"}]`,
      );
    }
  }

  // connectors ∌ toolIdsExclude
  if (expect.toolIdsExclude && expect.toolIdsExclude.length > 0) {
    const bound = connectorIds(bundle);
    const present = expect.toolIdsExclude.filter((id) => bound.includes(id));
    if (present.length > 0) {
      failures.push(
        `connectors: forbidden tool id(s) present [${present.join(", ")}] — bound: [${bound.join(", ")}]`,
      );
    }
  }

  // skill prose must not be the WRONG template
  if (expect.skillNot && expect.skillNot.length > 0) {
    const md = bundle.blueprint.customSkillMd ?? "";
    const wrong = expect.skillNot.filter((sig) => md.includes(sig));
    if (wrong.length > 0) {
      failures.push(
        `skill: customSkillMd contains forbidden signature(s) [${wrong.map((w) => JSON.stringify(w)).join(", ")}] — wrong skill template was used`,
      );
    }
  }

  return { ok: failures.length === 0, failures };
}

/** Render a GradeResult into one assertion message that leads with the offending
 *  sentence, then lists each mismatch on its own line. */
function explainFailure(sentence: string, result: GradeResult): string {
  return [
    `Generator regression for sentence: ${JSON.stringify(sentence)}`,
    ...result.failures.map((f) => `  • ${f}`),
  ].join("\n");
}

// ─── the test (one case per sentence) ────────────────────────────────────────

describe("generator regression net — deterministic path yields sane agents", () => {
  for (const c of GENERATOR_CASES) {
    test(c.sentence, () => {
      // The DETERMINISTIC path under test: heuristic intent → pure assembler.
      const bundle = assembleAgentBundle(heuristicIntent(c.sentence));
      const result = gradeGeneratedBundle(bundle, c.expect);
      assert.ok(result.ok, explainFailure(c.sentence, result));
    });
  }
});

// A couple of meta-guards on the corpus + grader itself, so the net can't rot
// into a no-op (e.g. an empty case list silently "passing").
describe("generator regression net — corpus + grader sanity", () => {
  test("the corpus is non-trivial (>= 12 cases)", () => {
    assert.ok(
      GENERATOR_CASES.length >= 12,
      `expected at least 12 regression cases, found ${GENERATOR_CASES.length}`,
    );
  });

  test("every case names a non-empty sentence and a triggerKind", () => {
    for (const c of GENERATOR_CASES) {
      assert.ok(
        typeof c.sentence === "string" && c.sentence.trim().length > 0,
        "a case has an empty sentence",
      );
      assert.ok(
        c.expect && typeof c.expect.triggerKind === "string",
        `case ${JSON.stringify(c.sentence)} is missing expect.triggerKind`,
      );
    }
  });

  test("the grader actually fails on a deliberately wrong expectation", () => {
    // Guard against a grader that always returns ok: assert a known-bad
    // expectation produces failures. "Reply to new leads" is an event/lead agent,
    // so demanding triggerKind:"schedule" MUST be graded as a failure.
    const bundle = assembleAgentBundle(
      heuristicIntent("Reply to new leads within 5 minutes"),
    );
    const bad = gradeGeneratedBundle(bundle, {
      triggerKind: "schedule",
      toolIdsInclude: ["postiz"],
    });
    assert.equal(bad.ok, false, "grader should reject a wrong expectation");
    assert.ok(
      bad.failures.length >= 1,
      "grader should report at least one mismatch line",
    );
  });
});

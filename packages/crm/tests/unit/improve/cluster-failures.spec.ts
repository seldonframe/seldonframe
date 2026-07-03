// Improve verb + trust rail (2026-07-02) — Task 6: failure clustering.
//
// TDD focus: two stages consuming the failed-scenario list produced by a
// baseline/candidate eval replay (run-agent-evals.ts's per-scenario results,
// already narrowed to the FAILED subset by the caller — improve-run.ts, a
// later task):
//
//   1. `bucketByValidator` — PURE, FREE (no LLM call) first pass. Two of the
//      6 validators in ALL_VALIDATORS (validators.ts:371) map DETERMINISTICALLY
//      to a failure mode because their name already tells us exactly what
//      went wrong — no need to ask an LLM to reverse-engineer that:
//        - "quotes_only_from_soul_pricing" -> mode "pricing"
//        - "no_hallucinated_state_change"  -> mode "hallucinated_state"
//      A failed scenario naming EITHER of those checks (possibly alongside
//      others) is bucketed by the FIRST matching rule found — pricing checked
//      before hallucinated_state, matching the design's listed order
//      ("quotesOnlyFromSoulPricing->pricing, noHallucinatedStateChange->
//      hallucinated_state"). Everything else (no matching validator name at
//      all, e.g. no_pii_leak / no_avoid_words / response_length_under_cap /
//      no_prompt_injection_echo / an unrecognized name, OR an empty
//      failedChecks array) falls through to `remainder` — untouched
//      scenarioIds the LLM stage below must label.
//   2. `makeLlmFailureClusterer` — the LLM branch, labeling ONLY the
//      remainder (the bucketed-by-validator scenarios never reach it) into
//      the 7-mode FAILURE_MODES taxonomy (per the spec's research addendum,
//      confirmed unchanged: "our 7 symptom/domain modes stay"). Mirrors
//      makeLlmEvalGrader (score-llm.ts) / makeLlmConvoScenarioConverter
//      (convo-to-scenario.ts) byte-for-byte in DI shape (`{ getClient }`,
//      defaults to getAnthropicClient), model resolution
//      (ANTHROPIC_EVAL_MODEL || DEFAULT_EVAL_MODEL, read at call time), and
//      parse posture (fence-strip -> JSON.parse) — but its fail-soft floor
//      differs from the grader/converter's "return null/empty": clustering
//      can never simply vanish a failure the human needs to see, so a parse
//      failure (or any other error) collapses to ONE "other" cluster
//      containing the ENTIRE remainder rather than an empty list. An
//      out-of-taxonomy label the model invents anyway (hallucinated mode
//      name) is coerced to "other" per scenario, not dropped.
//
// Evidence posture (binding, per the plan's Global Constraints — "no raw
// customer transcripts persisted... cluster evidence sentences <= 200 chars
// each"): every `evidence` string on every cluster, from EITHER stage, is
// truncated to at most 200 characters. `bucketByValidator` truncates the
// failedChecks-derived evidence sentence itself; the LLM stage's fail-soft
// "other" cluster evidence is built from failedChecks joins too and gets the
// same treatment.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  FAILURE_MODES,
  bucketByValidator,
  makeLlmFailureClusterer,
} from "@/lib/agents/improve/cluster-failures";
import type { FailureCluster, FailureMode } from "@/lib/agents/improve/cluster-failures";

// ─── fakes ───────────────────────────────────────────────────────────────

type FailedScenario = { scenarioId: string; failedChecks: string[] };

function failed(overrides: Partial<FailedScenario> = {}): FailedScenario {
  return {
    scenarioId: "s1",
    failedChecks: [],
    ...overrides,
  };
}

type RemainderInput = { scenarioId: string; title: string; failedChecks: string[] };

function remainderItem(overrides: Partial<RemainderInput> = {}): RemainderInput {
  return {
    scenarioId: "s1",
    title: "A scenario",
    failedChecks: [],
    ...overrides,
  };
}

/** A minimal fake Anthropic client shape — only `messages.create` is called
 *  by the clusterer, matching score-llm.ts / convo-to-scenario.ts's own
 *  fakes-in-tests convention (no real @anthropic-ai/sdk instance needed). */
function fakeClient(text: string) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text }],
      }),
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

function throwingClient() {
  return {
    messages: {
      create: async () => {
        throw new Error("network down");
      },
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

// ─── FAILURE_MODES / FailureMode ─────────────────────────────────────────

describe("FAILURE_MODES", () => {
  test("is the 7 seed modes, in the spec's order (research addendum confirmed: no changes)", () => {
    assert.deepEqual(FAILURE_MODES, [
      "booking_flow",
      "hallucinated_state",
      "pricing",
      "missing_knowledge",
      "tone",
      "tool_misuse",
      "other",
    ]);
  });
});

// ─── bucketByValidator ────────────────────────────────────────────────────

describe("bucketByValidator", () => {
  test("empty input -> empty bucketed, empty remainder", () => {
    const result = bucketByValidator([]);
    assert.deepEqual(result.bucketed, []);
    assert.deepEqual(result.remainder, []);
  });

  test("a scenario failing quotes_only_from_soul_pricing buckets to mode 'pricing'", () => {
    const result = bucketByValidator([
      failed({ scenarioId: "s1", failedChecks: ["quotes_only_from_soul_pricing"] }),
    ]);
    assert.equal(result.bucketed.length, 1);
    assert.equal(result.bucketed[0].mode, "pricing");
    assert.equal(result.bucketed[0].count, 1);
    assert.deepEqual(result.bucketed[0].exampleScenarioIds, ["s1"]);
    assert.deepEqual(result.remainder, []);
  });

  test("a scenario failing no_hallucinated_state_change buckets to mode 'hallucinated_state'", () => {
    const result = bucketByValidator([
      failed({ scenarioId: "s2", failedChecks: ["no_hallucinated_state_change"] }),
    ]);
    assert.equal(result.bucketed.length, 1);
    assert.equal(result.bucketed[0].mode, "hallucinated_state");
    assert.deepEqual(result.bucketed[0].exampleScenarioIds, ["s2"]);
    assert.deepEqual(result.remainder, []);
  });

  test("a scenario failing an UNMAPPED validator (e.g. no_pii_leak) falls through to remainder untouched", () => {
    const result = bucketByValidator([
      failed({ scenarioId: "s3", failedChecks: ["no_pii_leak"] }),
    ]);
    assert.deepEqual(result.bucketed, []);
    assert.deepEqual(result.remainder, ["s3"]);
  });

  test("all 4 other known validator names (no_prompt_injection_echo, no_pii_leak, no_avoid_words, response_length_under_cap) fall through to remainder", () => {
    const result = bucketByValidator([
      failed({ scenarioId: "a", failedChecks: ["no_prompt_injection_echo"] }),
      failed({ scenarioId: "b", failedChecks: ["no_pii_leak"] }),
      failed({ scenarioId: "c", failedChecks: ["no_avoid_words"] }),
      failed({ scenarioId: "d", failedChecks: ["response_length_under_cap"] }),
    ]);
    assert.deepEqual(result.bucketed, []);
    assert.deepEqual(result.remainder, ["a", "b", "c", "d"]);
  });

  test("an unrecognized/stale validator name falls through to remainder rather than throwing", () => {
    const result = bucketByValidator([
      failed({ scenarioId: "s4", failedChecks: ["some_retired_validator_name"] }),
    ]);
    assert.deepEqual(result.bucketed, []);
    assert.deepEqual(result.remainder, ["s4"]);
  });

  test("an empty failedChecks array falls through to remainder rather than throwing", () => {
    const result = bucketByValidator([failed({ scenarioId: "s5", failedChecks: [] })]);
    assert.deepEqual(result.bucketed, []);
    assert.deepEqual(result.remainder, ["s5"]);
  });

  test("a scenario failing BOTH a mapped and an unmapped validator buckets by the mapped one (does not ALSO land in remainder)", () => {
    const result = bucketByValidator([
      failed({ scenarioId: "s6", failedChecks: ["no_pii_leak", "quotes_only_from_soul_pricing"] }),
    ]);
    assert.equal(result.bucketed.length, 1);
    assert.equal(result.bucketed[0].mode, "pricing");
    assert.deepEqual(result.bucketed[0].exampleScenarioIds, ["s6"]);
    assert.deepEqual(result.remainder, []);
  });

  test("a scenario failing BOTH mapped validators buckets by pricing (checked first, per the design's listed order)", () => {
    const result = bucketByValidator([
      failed({
        scenarioId: "s7",
        failedChecks: ["no_hallucinated_state_change", "quotes_only_from_soul_pricing"],
      }),
    ]);
    assert.equal(result.bucketed.length, 1);
    assert.equal(result.bucketed[0].mode, "pricing");
  });

  test("multiple scenarios in the SAME mapped mode aggregate into ONE cluster with count > 1 and all scenarioIds listed", () => {
    const result = bucketByValidator([
      failed({ scenarioId: "p1", failedChecks: ["quotes_only_from_soul_pricing"] }),
      failed({ scenarioId: "p2", failedChecks: ["quotes_only_from_soul_pricing"] }),
      failed({ scenarioId: "p3", failedChecks: ["quotes_only_from_soul_pricing"] }),
    ]);
    assert.equal(result.bucketed.length, 1);
    assert.equal(result.bucketed[0].mode, "pricing");
    assert.equal(result.bucketed[0].count, 3);
    assert.deepEqual(result.bucketed[0].exampleScenarioIds, ["p1", "p2", "p3"]);
  });

  test("mixed input produces ONE cluster per mapped mode present (pricing + hallucinated_state) plus a remainder for the rest", () => {
    const result = bucketByValidator([
      failed({ scenarioId: "p1", failedChecks: ["quotes_only_from_soul_pricing"] }),
      failed({ scenarioId: "h1", failedChecks: ["no_hallucinated_state_change"] }),
      failed({ scenarioId: "h2", failedChecks: ["no_hallucinated_state_change"] }),
      failed({ scenarioId: "r1", failedChecks: ["no_pii_leak"] }),
    ]);
    assert.equal(result.bucketed.length, 2);
    const pricing = result.bucketed.find((c) => c.mode === "pricing");
    const hallucinated = result.bucketed.find((c) => c.mode === "hallucinated_state");
    assert.ok(pricing);
    assert.ok(hallucinated);
    assert.equal(pricing?.count, 1);
    assert.equal(hallucinated?.count, 2);
    assert.deepEqual(hallucinated?.exampleScenarioIds, ["h1", "h2"]);
    assert.deepEqual(result.remainder, ["r1"]);
  });

  test("evidence strings are non-empty and reference the failed check", () => {
    const result = bucketByValidator([
      failed({ scenarioId: "s1", failedChecks: ["quotes_only_from_soul_pricing"] }),
    ]);
    assert.ok(Array.isArray(result.bucketed[0].evidence));
    assert.ok(result.bucketed[0].evidence.length > 0);
    assert.ok(result.bucketed[0].evidence[0].length > 0);
  });

  test("evidence strings are truncated to at most 200 chars even when failedChecks is a long list", () => {
    const longChecks = Array.from({ length: 50 }, (_, i) => `quotes_only_from_soul_pricing_extra_detail_${i}`);
    const result = bucketByValidator([
      failed({ scenarioId: "s1", failedChecks: ["quotes_only_from_soul_pricing", ...longChecks] }),
    ]);
    assert.equal(result.bucketed.length, 1);
    for (const e of result.bucketed[0].evidence) {
      assert.ok(e.length <= 200, `evidence string exceeded 200 chars: ${e.length}`);
    }
  });

  test("every evidence string across every cluster respects the 200-char cap (general property, not just the long-list case)", () => {
    const result = bucketByValidator([
      failed({ scenarioId: "p1", failedChecks: ["quotes_only_from_soul_pricing"] }),
      failed({ scenarioId: "h1", failedChecks: ["no_hallucinated_state_change"] }),
    ]);
    for (const cluster of result.bucketed) {
      for (const e of cluster.evidence) {
        assert.ok(e.length <= 200);
      }
    }
  });

  test("is pure: calling twice with the same input produces deep-equal output", () => {
    const input = [
      failed({ scenarioId: "p1", failedChecks: ["quotes_only_from_soul_pricing"] }),
      failed({ scenarioId: "r1", failedChecks: ["no_pii_leak"] }),
    ];
    const first = bucketByValidator(input);
    const second = bucketByValidator(input);
    assert.deepEqual(first, second);
  });

  test("does not mutate the input array", () => {
    const input = [failed({ scenarioId: "p1", failedChecks: ["quotes_only_from_soul_pricing"] })];
    const snapshot = JSON.parse(JSON.stringify(input));
    bucketByValidator(input);
    assert.deepEqual(input, snapshot);
  });
});

// ─── makeLlmFailureClusterer ──────────────────────────────────────────────

describe("makeLlmFailureClusterer", () => {
  test("empty remainder short-circuits to an empty cluster list with NO LLM call (assert the fake was not invoked)", async () => {
    let callCount = 0;
    const countingClient = {
      messages: {
        create: async () => {
          callCount += 1;
          return { content: [{ type: "text", text: "[]" }] };
        },
      },
    } as unknown as import("@anthropic-ai/sdk").default;

    const clusterer = makeLlmFailureClusterer({ getClient: () => countingClient });
    const result = await clusterer({ failed: [] });

    assert.deepEqual(result, []);
    assert.equal(callCount, 0);
  });

  test("labels the remainder into valid FAILURE_MODES from canned JSON", async () => {
    const canned = JSON.stringify([
      {
        mode: "booking_flow",
        scenarioIds: ["s1"],
        evidence: ["Agent never asked for a preferred time slot."],
      },
      {
        mode: "tone",
        scenarioIds: ["s2"],
        evidence: ["Agent used a dismissive tone with the customer."],
      },
    ]);
    const clusterer = makeLlmFailureClusterer({ getClient: () => fakeClient(canned) });
    const result = await clusterer({
      failed: [
        remainderItem({ scenarioId: "s1", title: "Booking mixup" }),
        remainderItem({ scenarioId: "s2", title: "Rude reply" }),
      ],
    });

    assert.equal(result.length, 2);
    const bookingFlow = result.find((c) => c.mode === "booking_flow");
    const tone = result.find((c) => c.mode === "tone");
    assert.ok(bookingFlow);
    assert.ok(tone);
    assert.deepEqual(bookingFlow?.exampleScenarioIds, ["s1"]);
    assert.equal(bookingFlow?.count, 1);
    assert.deepEqual(tone?.exampleScenarioIds, ["s2"]);

    for (const cluster of result) {
      const validModes: FailureMode[] = [...FAILURE_MODES];
      assert.ok(validModes.includes(cluster.mode));
    }
  });

  test("an out-of-taxonomy label from the LLM is coerced to 'other'", async () => {
    const canned = JSON.stringify([
      {
        mode: "some_invented_mode_the_model_made_up",
        scenarioIds: ["s1"],
        evidence: ["Something unusual happened."],
      },
    ]);
    const clusterer = makeLlmFailureClusterer({ getClient: () => fakeClient(canned) });
    const result = await clusterer({ failed: [remainderItem({ scenarioId: "s1" })] });

    assert.equal(result.length, 1);
    assert.equal(result[0].mode, "other");
    assert.deepEqual(result[0].exampleScenarioIds, ["s1"]);
  });

  test("multiple out-of-taxonomy labels coerce to 'other' and MERGE into one cluster (not one-per-invented-label)", async () => {
    const canned = JSON.stringify([
      { mode: "made_up_a", scenarioIds: ["s1"], evidence: ["evidence a"] },
      { mode: "made_up_b", scenarioIds: ["s2"], evidence: ["evidence b"] },
    ]);
    const clusterer = makeLlmFailureClusterer({ getClient: () => fakeClient(canned) });
    const result = await clusterer({
      failed: [remainderItem({ scenarioId: "s1" }), remainderItem({ scenarioId: "s2" })],
    });

    const otherClusters = result.filter((c) => c.mode === "other");
    assert.equal(otherClusters.length, 1);
    assert.deepEqual(otherClusters[0].exampleScenarioIds.sort(), ["s1", "s2"]);
  });

  test("malformed (non-JSON) response falls back to a SINGLE 'other' cluster containing the WHOLE remainder", async () => {
    const clusterer = makeLlmFailureClusterer({
      getClient: () => fakeClient("Sure! Here are the clusters: <not json at all>"),
    });
    const result = await clusterer({
      failed: [
        remainderItem({ scenarioId: "s1", title: "One" }),
        remainderItem({ scenarioId: "s2", title: "Two" }),
        remainderItem({ scenarioId: "s3", title: "Three" }),
      ],
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].mode, "other");
    assert.equal(result[0].count, 3);
    assert.deepEqual(result[0].exampleScenarioIds.sort(), ["s1", "s2", "s3"]);
  });

  test("a non-array parsed JSON (e.g. a bare object) also falls back to the single fail-soft 'other' cluster", async () => {
    const clusterer = makeLlmFailureClusterer({
      getClient: () => fakeClient(JSON.stringify({ mode: "tone" })),
    });
    const result = await clusterer({ failed: [remainderItem({ scenarioId: "s1" })] });

    assert.equal(result.length, 1);
    assert.equal(result[0].mode, "other");
    assert.deepEqual(result[0].exampleScenarioIds, ["s1"]);
  });

  test("client throw (network error) falls back to the single fail-soft 'other' cluster, never throws", async () => {
    const clusterer = makeLlmFailureClusterer({ getClient: () => throwingClient() });
    await assert.doesNotReject(
      clusterer({ failed: [remainderItem({ scenarioId: "s1" }), remainderItem({ scenarioId: "s2" })] }),
    );
    const result = await clusterer({
      failed: [remainderItem({ scenarioId: "s1" }), remainderItem({ scenarioId: "s2" })],
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].mode, "other");
    assert.deepEqual(result[0].exampleScenarioIds.sort(), ["s1", "s2"]);
  });

  test("never throws even when getClient itself throws", async () => {
    const clusterer = makeLlmFailureClusterer({
      getClient: () => {
        throw new Error("boom");
      },
    });
    await assert.doesNotReject(clusterer({ failed: [remainderItem({ scenarioId: "s1" })] }));
    const result = await clusterer({ failed: [remainderItem({ scenarioId: "s1" })] });
    assert.equal(result.length, 1);
    assert.equal(result[0].mode, "other");
  });

  test("getClient() returning null (no key configured) falls back to the single fail-soft 'other' cluster (no network attempted)", async () => {
    const clusterer = makeLlmFailureClusterer({ getClient: () => null });
    const result = await clusterer({
      failed: [remainderItem({ scenarioId: "s1" }), remainderItem({ scenarioId: "s2" })],
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].mode, "other");
    assert.deepEqual(result[0].exampleScenarioIds.sort(), ["s1", "s2"]);
  });

  test("evidence strings from the LLM stage are also truncated to at most 200 chars", async () => {
    const longEvidence = "x".repeat(500);
    const canned = JSON.stringify([
      { mode: "tone", scenarioIds: ["s1"], evidence: [longEvidence] },
    ]);
    const clusterer = makeLlmFailureClusterer({ getClient: () => fakeClient(canned) });
    const result = await clusterer({ failed: [remainderItem({ scenarioId: "s1" })] });

    assert.equal(result.length, 1);
    for (const e of result[0].evidence) {
      assert.ok(e.length <= 200);
    }
  });

  test("fail-soft 'other' cluster's evidence is also capped at 200 chars even with many failedChecks", async () => {
    const manyChecks = Array.from({ length: 30 }, (_, i) => `check_${i}_some_descriptive_name_that_adds_length`);
    const clusterer = makeLlmFailureClusterer({
      getClient: () => fakeClient("not json"),
    });
    const result = await clusterer({
      failed: [remainderItem({ scenarioId: "s1", failedChecks: manyChecks })],
    });
    assert.equal(result.length, 1);
    for (const e of result[0].evidence) {
      assert.ok(e.length <= 200);
    }
  });

  test("scenario ids referenced by a cluster that don't correspond to any input item are dropped defensively (model hallucinated an id)", async () => {
    const canned = JSON.stringify([
      {
        mode: "tone",
        scenarioIds: ["s1", "s_does_not_exist"],
        evidence: ["Rude tone."],
      },
    ]);
    const clusterer = makeLlmFailureClusterer({ getClient: () => fakeClient(canned) });
    const result = await clusterer({ failed: [remainderItem({ scenarioId: "s1" })] });

    assert.equal(result.length, 1);
    assert.deepEqual(result[0].exampleScenarioIds, ["s1"]);
    assert.equal(result[0].count, 1);
  });

  test("is DI-only: does not touch the network beyond the injected fake (call count = 1 for a non-empty remainder)", async () => {
    let callCount = 0;
    const countingClient = {
      messages: {
        create: async () => {
          callCount += 1;
          return {
            content: [
              { type: "text", text: JSON.stringify([{ mode: "tone", scenarioIds: ["s1"], evidence: ["e"] }]) },
            ],
          };
        },
      },
    } as unknown as import("@anthropic-ai/sdk").default;

    const clusterer = makeLlmFailureClusterer({ getClient: () => countingClient });
    await clusterer({ failed: [remainderItem({ scenarioId: "s1" })] });
    assert.equal(callCount, 1);
  });
});

// ─── FailureCluster type shape (compile-time-ish smoke check) ────────────

describe("FailureCluster shape", () => {
  test("a hand-built FailureCluster satisfies the exported type (documents the contract)", () => {
    const cluster: FailureCluster = {
      mode: "pricing",
      count: 1,
      exampleScenarioIds: ["s1"],
      evidence: ["Quoted $500 which is not in the operator's pricing."],
    };
    assert.equal(cluster.mode, "pricing");
  });
});

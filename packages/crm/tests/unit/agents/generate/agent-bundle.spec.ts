// Agent Loop — L4 Generate-by-Default — Task T1: the pure bundle assembler.
//
// agent-bundle.ts is the deterministic heart of generate-by-default: it takes a
// small structured AgentIntent (which the LLM/heuristic produces) and wires
// EVERY safety primitive from SeldonFrame's own defaults — the trigger model
// (resolveAgentTrigger), the L2 verify rubric (defaultRubricForSkill), the L3
// guardrails (defaultGuardrailsForSkill) — onto a starter-derived base
// blueprint. The LLM never hand-writes a rubric or guardrails; it only picks the
// skill, and SF supplies the error-proofing.
//
// These tests pin the contract:
//   • review-requester + event trigger + a review URL → the event trigger, a
//     verify rubric that includes a must_include for the URL, review-requester
//     guardrails (quietHours present), reviewUrl set, NO warnings;
//   • review-requester with NO review URL → still assembles (verify has no URL
//     check), warnings includes the "no review link" message;
//   • speed-to-lead → lead.created trigger + speed-to-lead guardrails (NO
//     quietHours);
//   • an unknown skill → the safe base blueprint + the unrecognized-skill
//     warning, and NEVER throws;
//   • a promptHint is folded into the blueprint's prompt field (customSkillMd);
//   • PURE: same input → equal output, and the source STARTER_TEMPLATES entry is
//     never mutated (deep copy).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  assembleAgentBundle,
  type AgentIntent,
} from "../../../../src/lib/agents/generate/agent-bundle";
import {
  STARTER_TEMPLATES,
  getStarterTemplate,
} from "../../../../src/lib/agent-templates/starter-pack";
import type { VerifyCheck } from "../../../../src/lib/agents/verify/agent-verify";

const REVIEW_URL = "https://g.page/r/abc123/review";

/** Find the single check of a given kind in a rubric (or undefined). */
function check<K extends VerifyCheck["kind"]>(
  checks: VerifyCheck[],
  kind: K,
): Extract<VerifyCheck, { kind: K }> | undefined {
  return checks.find((c) => c.kind === kind) as
    | Extract<VerifyCheck, { kind: K }>
    | undefined;
}

const reviewIntent = (over: Partial<AgentIntent> = {}): AgentIntent => ({
  skill: "review-requester",
  trigger: { kind: "event", event: "booking.completed", channel: "sms" },
  ...over,
});

// ─── review-requester WITH a review URL ──────────────────────────────────────

describe("assembleAgentBundle — review-requester with review URL", () => {
  test("blueprint has the event trigger from the intent", () => {
    const b = assembleAgentBundle(reviewIntent(), { reviewUrl: REVIEW_URL });
    assert.deepEqual(b.blueprint.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
  });

  test("verify rubric includes a must_include for the review URL", () => {
    const b = assembleAgentBundle(reviewIntent(), { reviewUrl: REVIEW_URL });
    assert.ok(b.blueprint.verify, "expected a verify rubric");
    const inc = check(b.blueprint.verify.checks, "must_include");
    assert.ok(inc, "expected a must_include for the review link");
    assert.equal(inc.value, REVIEW_URL);
  });

  test("guardrails are the review-requester defaults (quietHours present)", () => {
    const b = assembleAgentBundle(reviewIntent(), { reviewUrl: REVIEW_URL });
    assert.ok(b.blueprint.guardrails, "expected guardrails");
    assert.ok(
      b.blueprint.guardrails.quietHours,
      "review-requester guardrails must include quietHours",
    );
    assert.equal(b.blueprint.guardrails.minMinutesBetweenPerContact, 43200);
  });

  test("reviewUrl is set on the blueprint and there are no warnings", () => {
    const b = assembleAgentBundle(reviewIntent(), { reviewUrl: REVIEW_URL });
    assert.equal(b.blueprint.reviewUrl, REVIEW_URL);
    assert.deepEqual(b.warnings, []);
  });

  test("reviewUrl can come from intent.businessHints (no ctx)", () => {
    const b = assembleAgentBundle(
      reviewIntent({ businessHints: { reviewUrl: REVIEW_URL } }),
    );
    assert.equal(b.blueprint.reviewUrl, REVIEW_URL);
    const inc = check(b.blueprint.verify!.checks, "must_include");
    assert.ok(inc && inc.value === REVIEW_URL);
    assert.deepEqual(b.warnings, []);
  });
});

// ─── review-requester WITHOUT a review URL ───────────────────────────────────

describe("assembleAgentBundle — review-requester with NO review URL", () => {
  test("still assembles; verify has no URL must_include", () => {
    const b = assembleAgentBundle(reviewIntent());
    assert.ok(b.blueprint.verify, "expected a verify rubric even without a URL");
    const inc = check(b.blueprint.verify.checks, "must_include");
    assert.equal(inc, undefined, "no review-link check without a URL");
    // but the always-on guards are still there
    assert.ok(check(b.blueprint.verify.checks, "max_length"));
    assert.ok(check(b.blueprint.verify.checks, "must_not_include"));
  });

  test("warnings include the 'no review link' message", () => {
    const b = assembleAgentBundle(reviewIntent());
    assert.ok(
      b.warnings.some((w) => /review link/i.test(w)),
      `expected a no-review-link warning, got: ${JSON.stringify(b.warnings)}`,
    );
  });

  test("reviewUrl is not set on the blueprint", () => {
    const b = assembleAgentBundle(reviewIntent());
    assert.equal(b.blueprint.reviewUrl, undefined);
  });
});

// ─── speed-to-lead ───────────────────────────────────────────────────────────

describe("assembleAgentBundle — speed-to-lead", () => {
  const intent: AgentIntent = {
    skill: "speed-to-lead",
    trigger: { kind: "event", event: "lead.created", channel: "sms" },
  };

  test("blueprint has the lead.created event trigger", () => {
    const b = assembleAgentBundle(intent);
    assert.deepEqual(b.blueprint.trigger, {
      kind: "event",
      event: "lead.created",
      channel: "sms",
    });
  });

  test("guardrails are speed-to-lead defaults (NO quietHours)", () => {
    const b = assembleAgentBundle(intent);
    assert.ok(b.blueprint.guardrails, "expected guardrails");
    assert.equal(
      b.blueprint.guardrails.quietHours,
      undefined,
      "speed-to-lead is time-critical — no quiet hours",
    );
    assert.equal(b.blueprint.guardrails.enabled, true);
  });

  test("no warnings (speed-to-lead doesn't need a review URL)", () => {
    const b = assembleAgentBundle(intent);
    assert.deepEqual(b.warnings, []);
  });
});

// ─── unknown skill → safe default + warning, never throws ────────────────────

describe("assembleAgentBundle — unknown skill", () => {
  const intent: AgentIntent = {
    skill: "underwater-basket-weaver",
    trigger: { kind: "inbound", channel: "chat" },
  };

  test("never throws and returns a bundle", () => {
    let b;
    assert.doesNotThrow(() => {
      b = assembleAgentBundle(intent);
    });
    assert.ok(b, "expected a bundle");
  });

  test("blueprint is a safe inbound default with a non-empty prompt", () => {
    const b = assembleAgentBundle(intent);
    assert.deepEqual(b.blueprint.trigger, { kind: "inbound", channel: "chat" });
    assert.ok(
      typeof b.blueprint.customSkillMd === "string" &&
        b.blueprint.customSkillMd.length > 0,
      "expected a non-empty base prompt",
    );
  });

  test("warnings include the unrecognized-skill message naming the skill", () => {
    const b = assembleAgentBundle(intent);
    assert.ok(
      b.warnings.some(
        (w) => /unrecognized/i.test(w) && w.includes("underwater-basket-weaver"),
      ),
      `expected an unrecognized-skill warning, got: ${JSON.stringify(b.warnings)}`,
    );
  });
});

// ─── promptHint folding ──────────────────────────────────────────────────────

describe("assembleAgentBundle — promptHint", () => {
  test("a promptHint is folded into the blueprint prompt (customSkillMd)", () => {
    const hint = "always mention our 5-star rating";
    const b = assembleAgentBundle(reviewIntent({ promptHint: hint }), {
      reviewUrl: REVIEW_URL,
    });
    assert.ok(
      b.blueprint.customSkillMd?.includes(hint),
      "expected the promptHint to appear in customSkillMd",
    );
  });

  test("the base starter prose is preserved alongside the folded hint", () => {
    const base = getStarterTemplate("review-requester").blueprint.customSkillMd!;
    const hint = "always mention our 5-star rating";
    const b = assembleAgentBundle(reviewIntent({ promptHint: hint }));
    // a representative slice of the starter prose survives
    assert.ok(
      b.blueprint.customSkillMd?.includes("review-requester for a local"),
      "base starter prose should be preserved",
    );
    assert.ok(b.blueprint.customSkillMd!.length > base.length);
  });

  test("an empty promptHint folds nothing (prompt equals the base)", () => {
    const base = getStarterTemplate("review-requester").blueprint.customSkillMd!;
    const b = assembleAgentBundle(reviewIntent({ promptHint: "   " }));
    assert.equal(b.blueprint.customSkillMd, base);
  });
});

// ─── name / description resolution ───────────────────────────────────────────

describe("assembleAgentBundle — name & description", () => {
  test("defaults to the starter's name/summary when intent omits them", () => {
    const starter = getStarterTemplate("review-requester");
    const b = assembleAgentBundle(reviewIntent(), { reviewUrl: REVIEW_URL });
    assert.equal(b.name, starter.name);
    assert.equal(b.description, starter.summary);
  });

  test("intent.name / intent.description override the starter", () => {
    const b = assembleAgentBundle(
      reviewIntent({ name: "Custom Reviewer", description: "My own pitch" }),
      { reviewUrl: REVIEW_URL },
    );
    assert.equal(b.name, "Custom Reviewer");
    assert.equal(b.description, "My own pitch");
  });

  test("unknown skill → a humanized name from the skill slug", () => {
    const b = assembleAgentBundle({
      skill: "underwater-basket-weaver",
      trigger: { kind: "inbound", channel: "chat" },
    });
    assert.equal(b.name, "Underwater Basket Weaver");
    assert.ok(typeof b.description === "string" && b.description.length > 0);
  });
});

// ─── purity ──────────────────────────────────────────────────────────────────

describe("assembleAgentBundle — purity", () => {
  test("calling twice with the same input yields equal output", () => {
    const a = assembleAgentBundle(reviewIntent(), { reviewUrl: REVIEW_URL });
    const b = assembleAgentBundle(reviewIntent(), { reviewUrl: REVIEW_URL });
    assert.deepEqual(a, b);
  });

  test("does NOT mutate the source STARTER_TEMPLATES entry", () => {
    const source = STARTER_TEMPLATES.find((s) => s.id === "review-requester")!;
    const before = JSON.parse(JSON.stringify(source));
    assembleAgentBundle(reviewIntent({ promptHint: "mutate me" }), {
      reviewUrl: REVIEW_URL,
    });
    assert.deepEqual(
      JSON.parse(JSON.stringify(source)),
      before,
      "the starter template must not be mutated",
    );
  });

  test("the returned blueprint is a distinct object from the starter blueprint", () => {
    const source = STARTER_TEMPLATES.find((s) => s.id === "review-requester")!;
    const b = assembleAgentBundle(reviewIntent(), { reviewUrl: REVIEW_URL });
    assert.notEqual(b.blueprint, source.blueprint);
    assert.notEqual(b.blueprint.trigger, source.blueprint.trigger);
  });
});

// ─── tool binding (L5.1 T3) — fold bound connectors into the blueprint ───────
//
// assembleAgentBundle runs bindToolsForIntent over the intent's promptHint and
// merges the resulting ConnectorBinding[] onto blueprint.connectors (deduped by
// kind+id). A no-tool agent's connectors stay exactly as the base left them
// (undefined for the starters) and the bundle gains no warnings (the pure bind
// layer returns warnings: []).

describe("assembleAgentBundle — tool binding", () => {
  test("a social-post intent binds the vetted Postiz connector", () => {
    const b = assembleAgentBundle({
      skill: "social-poster",
      trigger: { kind: "schedule", cron: "0 9 * * 1", channel: "digest" },
      promptHint: "post weekly to Instagram",
    });
    assert.ok(b.blueprint.connectors, "expected connectors to be set");
    const postiz = b.blueprint.connectors.find((c) => c.id === "postiz");
    assert.ok(postiz, "expected a Postiz binding");
    assert.equal(postiz.kind, "vetted");
    assert.equal(
      postiz.kind === "vetted" ? postiz.serviceName : undefined,
      "postiz",
    );
    // resting (pre-discovery) allowlist — empty until the operator connects it.
    assert.deepEqual(postiz.enabledTools, []);
  });

  test("a 'log to Notion' intent binds the composio notion toolkit", () => {
    const b = assembleAgentBundle({
      skill: "speed-to-lead",
      trigger: { kind: "event", event: "lead.created", channel: "sms" },
      promptHint: "log every lead to Notion",
    });
    assert.ok(b.blueprint.connectors, "expected connectors to be set");
    const notion = b.blueprint.connectors.find((c) => c.id === "notion");
    assert.ok(notion, "expected a Notion binding");
    assert.equal(notion.kind, "composio");
    assert.deepEqual(
      notion.kind === "composio" ? notion.enabledToolkits : undefined,
      ["notion"],
    );
    assert.deepEqual(notion.enabledTools, []);
  });

  test("tool binding adds no warnings in the pure layer", () => {
    const b = assembleAgentBundle({
      skill: "speed-to-lead",
      trigger: { kind: "event", event: "lead.created", channel: "sms" },
      promptHint: "log every lead to Notion",
    });
    // speed-to-lead needs no review URL, and the pure bind layer returns no
    // warnings — so the bundle stays warning-free even with a tool bound.
    assert.deepEqual(b.warnings, []);
  });

  test("a no-tool agent keeps connectors undefined (no regression)", () => {
    // review-requester's promptHint has no tool keyword → nothing to bind, so
    // blueprint.connectors must stay exactly as the base left it (undefined).
    const b = assembleAgentBundle(reviewIntent({ promptHint: "ask for a 5-star review" }), {
      reviewUrl: REVIEW_URL,
    });
    assert.equal(b.blueprint.connectors, undefined);
    assert.deepEqual(b.warnings, []);
  });

  test("a review-requester with no promptHint also has no connectors", () => {
    const b = assembleAgentBundle(reviewIntent(), { reviewUrl: REVIEW_URL });
    assert.equal(b.blueprint.connectors, undefined);
  });

  test("two keywords for the same tool collapse to one deduped binding", () => {
    // "Instagram" and "Facebook" both map to Postiz — the kind+id dedupe must
    // leave exactly ONE Postiz binding (no dup of the same kind+id).
    const b = assembleAgentBundle({
      skill: "social-poster",
      trigger: { kind: "schedule", cron: "0 9 * * 1", channel: "digest" },
      promptHint: "post our highlight to Instagram and Facebook every week",
    });
    assert.ok(b.blueprint.connectors, "expected connectors to be set");
    const postizBindings = b.blueprint.connectors.filter(
      (c) => c.kind === "vetted" && c.id === "postiz",
    );
    assert.equal(
      postizBindings.length,
      1,
      `expected exactly one Postiz binding, got ${postizBindings.length}`,
    );
  });

  test("a sentence naming two different tools binds both (deduped, distinct)", () => {
    const b = assembleAgentBundle({
      skill: "speed-to-lead",
      trigger: { kind: "event", event: "lead.created", channel: "sms" },
      promptHint: "post the win to Instagram and also log every lead to Notion",
    });
    assert.ok(b.blueprint.connectors, "expected connectors to be set");
    const ids = b.blueprint.connectors.map((c) => `${c.kind}:${c.id}`);
    assert.ok(ids.includes("vetted:postiz"), "expected Postiz");
    assert.ok(ids.includes("composio:notion"), "expected Notion");
    // no duplicate kind+id pairs survived the merge dedupe.
    assert.equal(new Set(ids).size, ids.length, "connectors must be deduped");
  });
});

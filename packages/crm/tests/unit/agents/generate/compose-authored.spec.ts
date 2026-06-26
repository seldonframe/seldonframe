// Primitive-Composition Agent Generator — P1, Task 4: the thin-harness composer.
//
// compose-authored.ts turns a normalized AuthoredAgent (the LLM wrote the skill +
// declared the primitives) into a ready-to-persist AgentBundle, wiring SF's safety
// floor DETERMINISTICALLY around the authored prose. These tests pin the contract:
//
//   • the ground rules (SF_GROUND_RULES) are ALWAYS appended to the skill — safety
//     never depends on the LLM having authored them;
//   • an action-only poster (channel "none") gets NO quiet hours + actionOnly:true;
//   • a messaging agent (channel "email") gets the channel-aware verify cap + the
//     review-link check + reviewUrl on the blueprint + actionOnly:false;
//   • the authored tool ids bind to real ConnectorBindings (vetted Postiz shape);
//   • no tools → blueprint.connectors stays undefined (matches agent-bundle);
//   • ctx.reviewUrl overrides knowledgeHints.reviewUrl;
//   • the produced blueprint is a REAL AgentBlueprint (the test type-checks it).
//
// Inputs are built through the REAL normalizer (normalizeAuthoredAgent) so the test
// data is valid by construction and the seam→composer contract is exercised end to
// end. PURE — no network/clock/env.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { composeBundleFromAuthored } from "../../../../src/lib/agents/generate/compose-authored";
import {
  normalizeAuthoredAgent,
  type AuthoredAgent,
} from "../../../../src/lib/agents/generate/authored-agent";
import { SF_GROUND_RULES } from "../../../../src/lib/agents/generate/shape-defaults";
import type { AgentBlueprint } from "../../../../src/db/schema/agents";
import type { ConnectorBinding } from "../../../../src/lib/agents/mcp/connectors";

const REVIEW_URL = "https://g.page/r/abc123/review";

/** Normalize a raw author draft and assert it produced a valid AuthoredAgent. */
function authored(raw: unknown): AuthoredAgent {
  const a = normalizeAuthoredAgent(raw);
  assert.ok(a, "expected the raw draft to normalize to a valid AuthoredAgent");
  return a;
}

// ─── 1. action-only social poster ───────────────────────────────────────────────

describe("composeBundleFromAuthored — action-only social poster", () => {
  const a = authored({
    name: "Weekly Social Poster",
    summary: "Posts a weekly highlight to social.",
    skillMd:
      "Each Monday, draft a short, on-brand highlight of the week's best moment and publish it to the connected social accounts. Keep it warm and concise.",
    channel: "none",
    tools: ["postiz"],
    trigger: { kind: "schedule", cron: "0 9 * * 1" },
  });
  const bundle = composeBundleFromAuthored(a);

  test("appends SF_GROUND_RULES to the authored skill (keeps the authored prose)", () => {
    const skill = bundle.blueprint.customSkillMd ?? "";
    assert.ok(
      skill.includes("draft a short, on-brand highlight"),
      "authored prose is preserved",
    );
    assert.ok(skill.includes("Never invent"), "SF_GROUND_RULES is appended");
    assert.ok(
      skill.includes(SF_GROUND_RULES),
      "the FULL canonical ground-rules block is appended verbatim",
    );
  });

  test("binds the Postiz vetted connector from the explicit tool id", () => {
    const connectors = bundle.blueprint.connectors ?? [];
    const postiz = connectors.find((c) => c.id === "postiz");
    assert.ok(postiz, "a postiz binding exists");
    assert.equal(postiz?.kind, "vetted");
    assert.equal(
      (postiz as Extract<ConnectorBinding, { kind: "vetted" }>).serviceName,
      "postiz",
    );
  });

  test("an action-only shape has NO quiet hours + actionOnly:true", () => {
    assert.equal(
      bundle.blueprint.guardrails?.quietHours,
      undefined,
      "a poster does not message a person → no quiet hours",
    );
    assert.equal(bundle.blueprint.actionOnly, true);
  });

  test("carries the authored name", () => {
    assert.equal(bundle.name, "Weekly Social Poster");
  });
});

// ─── 2. messaging email agent (review link via knowledgeHints) ──────────────────

describe("composeBundleFromAuthored — email agent", () => {
  const a = authored({
    name: "Review Requester",
    summary: "Emails happy customers to ask for a review.",
    skillMd:
      "After a job is completed, email the customer a friendly note thanking them and asking them to leave a Google review at the link provided. One ask, no pressure.",
    channel: "email",
    tools: [],
    trigger: { kind: "event", event: "booking.completed", channel: "email" },
    knowledgeHints: { reviewUrl: REVIEW_URL },
  });
  const bundle = composeBundleFromAuthored(a);

  test("verify rubric has the email max_length (5000)", () => {
    const checks = bundle.blueprint.verify?.checks ?? [];
    const cap = checks.find((c) => c.kind === "max_length");
    assert.ok(cap, "an email shape has a length cap");
    assert.equal(cap?.kind === "max_length" ? cap.max : undefined, 5000);
  });

  test("verify rubric must_include the review URL", () => {
    const checks = bundle.blueprint.verify?.checks ?? [];
    const link = checks.find(
      (c) => c.kind === "must_include" && c.value === REVIEW_URL,
    );
    assert.ok(link, "the review URL is enforced as a must_include");
  });

  test("blueprint.reviewUrl is set and actionOnly is false", () => {
    assert.equal(bundle.blueprint.reviewUrl, REVIEW_URL);
    assert.equal(bundle.blueprint.actionOnly, false);
  });
});

// ─── 3. no tools + ctx.reviewUrl override ───────────────────────────────────────

describe("composeBundleFromAuthored — no tools / reviewUrl precedence", () => {
  test("no tools → blueprint.connectors is undefined (matches agent-bundle)", () => {
    const a = authored({
      name: "Inbound Helper",
      summary: "Answers questions from the website.",
      skillMd:
        "Greet the visitor warmly, answer what you actually know about the business, and help them book or get in touch.",
      channel: "none",
      tools: [],
      trigger: { kind: "inbound", channel: "chat" },
    });
    const bundle = composeBundleFromAuthored(a);
    assert.equal(bundle.blueprint.connectors, undefined);
  });

  test("ctx.reviewUrl overrides knowledgeHints.reviewUrl", () => {
    const a = authored({
      name: "Review Requester",
      summary: "Asks for reviews.",
      skillMd:
        "After a completed job, text the customer a short thank-you and a link to leave a review.",
      channel: "sms",
      tools: [],
      trigger: { kind: "event", event: "booking.completed", channel: "sms" },
      knowledgeHints: { reviewUrl: "https://hint.example/old" },
    });
    const ctxUrl = "https://ctx.example/new-review";
    const bundle = composeBundleFromAuthored(a, { reviewUrl: ctxUrl });

    assert.equal(bundle.blueprint.reviewUrl, ctxUrl, "ctx wins over the hint");
    const checks = bundle.blueprint.verify?.checks ?? [];
    assert.ok(
      checks.some((c) => c.kind === "must_include" && c.value === ctxUrl),
      "the rubric enforces the ctx URL, not the hint",
    );
    assert.ok(
      !checks.some(
        (c) => c.kind === "must_include" && c.value === "https://hint.example/old",
      ),
      "the stale hint URL is NOT enforced",
    );
  });
});

// ─── 4. type-checks as a real AgentBlueprint + invariants ───────────────────────

describe("composeBundleFromAuthored — type + purity invariants", () => {
  test("the produced blueprint is a real AgentBlueprint (compiles)", () => {
    const a = authored({
      name: "Typed Agent",
      summary: "A typed agent.",
      skillMd:
        "Do exactly what the operator describes here, on-brand and concise, every time you run.",
      channel: "none",
      tools: ["postiz"],
      trigger: { kind: "schedule", cron: "0 9 * * 1" },
    });
    const bundle = composeBundleFromAuthored(a);
    // The annotation is the assertion: if the shape weren't a valid AgentBlueprint
    // this line would not type-check and `npx tsc --noEmit` would fail.
    const bp: AgentBlueprint = bundle.blueprint;
    assert.ok(bp.trigger, "the blueprint carries a resolved trigger");
    assert.equal(bp.trigger?.kind, "schedule");
  });

  test("a very short skill pushes a review warning", () => {
    const a = authored({
      name: "Tiny",
      summary: "x",
      skillMd: "Post it.", // < 40 chars
      channel: "none",
      tools: [],
      trigger: { kind: "schedule", cron: "0 9 * * 1" },
    });
    const bundle = composeBundleFromAuthored(a);
    assert.ok(
      bundle.warnings.some((w) => /review this generated agent/i.test(w)),
      "a stub skill is flagged for review",
    );
  });

  test("a rich skill yields no review warning", () => {
    const a = authored({
      name: "Rich",
      summary: "A rich agent.",
      skillMd:
        "A thorough, multi-sentence playbook describing exactly what the agent should do across the common cases it will encounter.",
      channel: "none",
      tools: [],
      trigger: { kind: "schedule", cron: "0 9 * * 1" },
    });
    const bundle = composeBundleFromAuthored(a);
    assert.equal(bundle.warnings.length, 0);
  });

  test("pure: never mutates the input AuthoredAgent", () => {
    const a = authored({
      name: "Immutable",
      summary: "Stays the same.",
      skillMd:
        "A reasonably detailed playbook so the short-skill warning never fires here.",
      channel: "email",
      tools: ["postiz"],
      trigger: { kind: "event", event: "booking.completed", channel: "email" },
      knowledgeHints: { reviewUrl: REVIEW_URL },
    });
    const before = JSON.stringify(a);
    composeBundleFromAuthored(a, { reviewUrl: "https://other.example/x" });
    assert.equal(JSON.stringify(a), before, "the input was not mutated");
  });

  test("description falls back to a humanized line when summary is empty", () => {
    const a = authored({
      name: "No Summary Agent",
      // no summary field → normalizer makes it ""
      skillMd:
        "A reasonably detailed playbook so the short-skill warning never fires for this case at all.",
      channel: "none",
      tools: [],
      trigger: { kind: "schedule", cron: "0 9 * * 1" },
    });
    assert.equal(a.summary, "", "precondition: normalized summary is empty");
    const bundle = composeBundleFromAuthored(a);
    assert.equal(bundle.description, "A generated No Summary Agent agent.");
  });
});

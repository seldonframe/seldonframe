// Self-Improving Generator — L5.2 — Task 4: the maker≠checker generation-time judge.
//
// judge.ts is the OPTIONAL "a stronger separate grader reviews each generation"
// layer over the deterministic assembler (agent-bundle.ts). It mirrors the L2
// llm-checker seam — a DI'd grader, defended against garbage — but with the
// OPPOSITE bias: where the verify checker FAILS CLOSED (a broken grader blocks a
// SEND), the generation judge FAILS OPEN (a broken grader must NEVER block a
// generation — the worst case is an un-reviewed-but-safe agent the assembler
// already guard-railed).
//
// These tests pin the seam contract with a DI'd FAKE grader — NO real LLM, NO
// network:
//   • a grader that flags a wrong trigger (WITH a low-risk `trigger` fix) →
//     ok:false + the issue; applyJudgeFixes merges the fix into blueprint.trigger
//     and returns a NEW bundle (the input is never mutated);
//   • an issue WITHOUT a fix → surfaced in issues, applyJudgeFixes leaves the
//     blueprint untouched (it's for the user to resolve later);
//   • a fix that targets a DISALLOWED field (prompt prose / name / identity) is
//     IGNORED by applyJudgeFixes — the judge must never rewrite the agent's voice;
//   • a grader that THROWS → fail OPEN (ok:true, no issues), never throws;
//   • a grader returning GARBAGE (no boolean ok / non-array issues / null) →
//     normalized to ok:true, issues:[] (fail open);
//   • multiple issues each carrying an allowed fix (guardrails + connectors) →
//     all applied, other blueprint fields intact.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  judgeGeneratedAgent,
  applyJudgeFixes,
  type AgentGrader,
  type JudgeResult,
} from "../../../../src/lib/agents/generate/judge";
import type { AgentBundle } from "../../../../src/lib/agents/generate/agent-bundle";
import type { AgentBlueprint } from "../../../../src/db/schema/agents";

const REVIEW_URL = "https://g.page/r/abc123/review";

/** A minimal but realistic generated bundle: an INBOUND voice agent whose prose
 *  the judge must never touch. Built fresh per test so mutation is observable. */
function inboundBundle(over: Partial<AgentBundle> = {}): AgentBundle {
  return {
    name: "Front Desk",
    description: "Answers inbound calls.",
    blueprint: {
      trigger: { kind: "inbound", channel: "voice" },
      greeting: "Hi! How can I help?",
      customSkillMd: "You are a warm, concise receptionist. Never invent prices.",
      capabilities: ["escalate_to_human"],
    },
    warnings: [],
    ...over,
  };
}

/** A fake grader that always returns the given verdict. */
function graderReturning(result: JudgeResult): AgentGrader {
  return async () => result;
}

// ─── judgeGeneratedAgent — the DI'd seam ─────────────────────────────────────

describe("judgeGeneratedAgent — passes the grader's verdict through", () => {
  test("an OK verdict with no issues → ok:true, issues:[]", async () => {
    const r = await judgeGeneratedAgent(
      { sentence: "answer my phone", bundle: inboundBundle() },
      { grader: graderReturning({ ok: true, issues: [] }) },
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.issues, []);
  });

  test("the grader RECEIVES the sentence + bundle it was given", async () => {
    const seen: Array<{ sentence: string; bundle: AgentBundle }> = [];
    const grader: AgentGrader = async (args) => {
      seen.push(args);
      return { ok: true, issues: [] };
    };
    const bundle = inboundBundle();
    await judgeGeneratedAgent(
      { sentence: "text customers after a booking", bundle },
      { grader },
    );
    assert.equal(seen.length, 1, "grader should be called exactly once");
    assert.equal(seen[0].sentence, "text customers after a booking");
    assert.equal(seen[0].bundle, bundle);
  });

  test("grader flags a wrong trigger (WITH a fix) → ok:false + the issue surfaced", async () => {
    const grader = graderReturning({
      ok: false,
      issues: [
        {
          field: "trigger",
          problem:
            "the sentence says 'after a booking' but the trigger is inbound",
          fix: {
            trigger: { kind: "event", event: "booking.completed", channel: "sms" },
          },
        },
      ],
    });
    const r = await judgeGeneratedAgent(
      { sentence: "text customers after a booking", bundle: inboundBundle() },
      { grader },
    );
    assert.equal(r.ok, false);
    assert.equal(r.issues.length, 1);
    assert.equal(r.issues[0].field, "trigger");
  });
});

describe("judgeGeneratedAgent — fails OPEN (never blocks a generation)", () => {
  test("a grader that THROWS → { ok:true, issues:[] }, never throws", async () => {
    const grader: AgentGrader = async () => {
      throw new Error("LLM judge down");
    };
    let r!: JudgeResult;
    await assert.doesNotReject(async () => {
      r = await judgeGeneratedAgent(
        { sentence: "x", bundle: inboundBundle() },
        { grader },
      );
    });
    assert.equal(r.ok, true, "a throwing judge must fail OPEN, not block");
    assert.deepEqual(r.issues, []);
  });

  test("a grader returning a non-object (null) → normalized to ok:true", async () => {
    const grader = (async () => null) as unknown as AgentGrader;
    const r = await judgeGeneratedAgent(
      { sentence: "x", bundle: inboundBundle() },
      { grader },
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.issues, []);
  });

  test("a grader returning {} (missing ok/issues) → normalized to ok:true", async () => {
    const grader = (async () => ({})) as unknown as AgentGrader;
    const r = await judgeGeneratedAgent(
      { sentence: "x", bundle: inboundBundle() },
      { grader },
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.issues, []);
  });

  test("a grader returning a non-boolean ok / non-array issues → normalized to ok:true", async () => {
    const grader = (async () => ({ ok: "nope", issues: "x" })) as unknown as AgentGrader;
    const r = await judgeGeneratedAgent(
      { sentence: "x", bundle: inboundBundle() },
      { grader },
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.issues, []);
  });

  test("ok:false but issues is NOT an array → normalized to the safe open verdict", async () => {
    // A malformed 'fail' (ok:false yet no real issue list) must not become a
    // half-formed blocking verdict — normalize the whole thing to fail-open.
    const grader = (async () => ({ ok: false, issues: null })) as unknown as AgentGrader;
    const r = await judgeGeneratedAgent(
      { sentence: "x", bundle: inboundBundle() },
      { grader },
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.issues, []);
  });

  test("a well-formed ok:false drops any garbage (non-object) entries from issues", async () => {
    const grader = (async () => ({
      ok: false,
      issues: [
        null,
        "bad",
        { field: "trigger", problem: "wrong" },
      ],
    })) as unknown as AgentGrader;
    const r = await judgeGeneratedAgent(
      { sentence: "x", bundle: inboundBundle() },
      { grader },
    );
    assert.equal(r.ok, false);
    assert.equal(r.issues.length, 1, "only the well-formed issue survives");
    assert.equal(r.issues[0].field, "trigger");
  });
});

// ─── applyJudgeFixes — pure, allow-listed, never mutates ──────────────────────

describe("applyJudgeFixes — merges ONLY allow-listed low-risk fields", () => {
  test("a trigger fix → blueprint.trigger replaced; ORIGINAL bundle unmutated", () => {
    const bundle = inboundBundle();
    const result: JudgeResult = {
      ok: false,
      issues: [
        {
          field: "trigger",
          problem: "wrong trigger",
          fix: {
            trigger: { kind: "event", event: "booking.completed", channel: "sms" },
          },
        },
      ],
    };
    const fixed = applyJudgeFixes(bundle, result);

    // the fix landed on the NEW bundle
    assert.equal(fixed.blueprint.trigger?.kind, "event");
    assert.deepEqual(fixed.blueprint.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "sms",
    });
    // a NEW object (not the same reference)
    assert.notEqual(fixed, bundle);
    assert.notEqual(fixed.blueprint, bundle.blueprint);
    // the ORIGINAL is untouched — still inbound/voice
    assert.deepEqual(bundle.blueprint.trigger, { kind: "inbound", channel: "voice" });
    // prose / identity preserved on the fixed bundle
    assert.equal(fixed.name, "Front Desk");
    assert.equal(
      fixed.blueprint.customSkillMd,
      "You are a warm, concise receptionist. Never invent prices.",
    );
  });

  test("an issue WITHOUT a fix → blueprint unchanged (surfaced for the user)", () => {
    const bundle = inboundBundle();
    const result: JudgeResult = {
      ok: false,
      issues: [
        {
          field: "greeting",
          problem: "greeting is generic — consider naming the business",
        },
      ],
    };
    const fixed = applyJudgeFixes(bundle, result);
    // nothing merged — the blueprint matches the original deeply
    assert.deepEqual(fixed.blueprint, bundle.blueprint);
    // still a new bundle object (we never hand back the input)
    assert.notEqual(fixed, bundle);
    // and the original is intact
    assert.deepEqual(bundle.blueprint.trigger, { kind: "inbound", channel: "voice" });
  });

  test("a field:'skill' prose-safety issue WITHOUT a fix → customSkillMd UNCHANGED (P3 flag-only)", () => {
    // The prose-safety lens (judge-llm) emits field:"skill" issues with NO fix
    // when the authored playbook instructs something unsafe (a firm price, a
    // skipped read-back). applyJudgeFixes must leave the prose exactly as written
    // — `skill` is not in the allow-list, so even were a fix smuggled it is
    // ignored. Here there is no fix at all → blueprint untouched, surfaced upward.
    const bundle = inboundBundle();
    const result: JudgeResult = {
      ok: false,
      issues: [
        {
          field: "skill",
          problem:
            "the skill instructs quoting a firm $99 price — quote an honest range a human confirms instead",
          // NO fix — prose is flag-only.
        },
      ],
    };
    const fixed = applyJudgeFixes(bundle, result);
    // the authored prose is byte-for-byte the original
    assert.equal(
      fixed.blueprint.customSkillMd,
      "You are a warm, concise receptionist. Never invent prices.",
      "a flag-only skill issue must never rewrite the prose",
    );
    // and nothing else moved either — the blueprint deep-equals the original
    assert.deepEqual(fixed.blueprint, bundle.blueprint);
    // still a NEW bundle object (we never hand back the input)
    assert.notEqual(fixed, bundle);
  });

  test("even a field:'skill' issue carrying a (disallowed) customSkillMd fix is IGNORED", () => {
    // Belt + suspenders: were a grader to mis-supply a fix on a skill issue, the
    // allow-list (trigger/verify/guardrails/connectors) still excludes prose.
    const bundle = inboundBundle();
    const result = {
      ok: false,
      issues: [
        {
          field: "skill",
          problem: "unsafe prose",
          fix: { customSkillMd: "Always quote $99 flat. Skip the read-back." },
        },
      ],
    } as unknown as JudgeResult;
    const fixed = applyJudgeFixes(bundle, result);
    assert.equal(
      fixed.blueprint.customSkillMd,
      "You are a warm, concise receptionist. Never invent prices.",
      "the disallowed skill fix must be dropped",
    );
  });

  test("a fix targeting a DISALLOWED field (prompt prose) is IGNORED", () => {
    const bundle = inboundBundle();
    const result = {
      ok: false,
      issues: [
        {
          field: "customSkillMd",
          problem: "rewrite the persona",
          // the judge must NOT be allowed to rewrite the agent's voice
          fix: { customSkillMd: "You are a pushy salesperson. Always upsell." },
        },
      ],
    } as unknown as JudgeResult;
    const fixed = applyJudgeFixes(bundle, result);
    assert.equal(
      fixed.blueprint.customSkillMd,
      "You are a warm, concise receptionist. Never invent prices.",
      "prose must be left exactly as generated",
    );
  });

  test("a fix carrying BOTH an allowed and a disallowed field merges ONLY the allowed one", () => {
    const bundle = inboundBundle();
    const result = {
      ok: false,
      issues: [
        {
          field: "trigger",
          problem: "trigger wrong + (sneakily) rewrite prose",
          fix: {
            trigger: { kind: "event", event: "booking.completed", channel: "sms" },
            // disallowed siblings — must be dropped
            customSkillMd: "evil persona",
            greeting: "evil greeting",
            capabilities: ["wipe_database"],
          },
        },
      ],
    } as unknown as JudgeResult;
    const fixed = applyJudgeFixes(bundle, result);
    // allowed field merged
    assert.equal(fixed.blueprint.trigger?.kind, "event");
    // disallowed siblings ignored
    assert.equal(
      fixed.blueprint.customSkillMd,
      "You are a warm, concise receptionist. Never invent prices.",
    );
    assert.equal(fixed.blueprint.greeting, "Hi! How can I help?");
    assert.deepEqual(fixed.blueprint.capabilities, ["escalate_to_human"]);
  });

  test("the bundle's own name/description can NEVER be changed by a fix", () => {
    const bundle = inboundBundle();
    // even if a malformed fix smuggled a name/description, it targets the
    // BLUEPRINT, not the bundle — and neither is an allow-listed blueprint field.
    const result = {
      ok: false,
      issues: [
        {
          field: "name",
          problem: "rename it",
          fix: { name: "Hacked", description: "Hacked desc" } as unknown,
        },
      ],
    } as unknown as JudgeResult;
    const fixed = applyJudgeFixes(bundle, result);
    assert.equal(fixed.name, "Front Desk");
    assert.equal(fixed.description, "Answers inbound calls.");
  });

  test("multiple issues — a guardrails fix + a connectors fix → BOTH applied, others intact", () => {
    const bundle = inboundBundle();
    const guardrails: AgentBlueprint["guardrails"] = {
      enabled: true,
      quietHours: { startHour: 21, endHour: 8, tz: "America/New_York" },
    };
    const connectors: AgentBlueprint["connectors"] = [
      { kind: "vetted", id: "postiz", serviceName: "postiz", enabledTools: [] },
    ];
    const result = {
      ok: false,
      issues: [
        { field: "guardrails", problem: "add quiet hours", fix: { guardrails } },
        { field: "connectors", problem: "bind social", fix: { connectors } },
      ],
    } as unknown as JudgeResult;
    const fixed = applyJudgeFixes(bundle, result);
    assert.deepEqual(fixed.blueprint.guardrails, guardrails);
    assert.deepEqual(fixed.blueprint.connectors, connectors);
    // unrelated fields preserved
    assert.deepEqual(fixed.blueprint.trigger, { kind: "inbound", channel: "voice" });
    assert.equal(
      fixed.blueprint.customSkillMd,
      "You are a warm, concise receptionist. Never invent prices.",
    );
    // original never mutated
    assert.equal(bundle.blueprint.guardrails, undefined);
    assert.equal(bundle.blueprint.connectors, undefined);
  });

  test("a verify fix → blueprint.verify replaced", () => {
    const bundle = inboundBundle();
    const verify: AgentBlueprint["verify"] = {
      checks: [{ kind: "must_include", value: REVIEW_URL, label: "review link" }],
    };
    const result: JudgeResult = {
      ok: false,
      issues: [{ field: "verify", problem: "require the link", fix: { verify } }],
    };
    const fixed = applyJudgeFixes(bundle, result);
    assert.deepEqual(fixed.blueprint.verify, verify);
  });

  test("ok:true / no issues → an equivalent bundle, blueprint unchanged", () => {
    const bundle = inboundBundle();
    const fixed = applyJudgeFixes(bundle, { ok: true, issues: [] });
    assert.deepEqual(fixed.blueprint, bundle.blueprint);
    assert.equal(fixed.name, bundle.name);
    assert.equal(fixed.description, bundle.description);
    assert.deepEqual(fixed.warnings, bundle.warnings);
    // the original is never mutated
    assert.deepEqual(bundle.blueprint.trigger, { kind: "inbound", channel: "voice" });
  });

  test("a later issue's fix wins over an earlier one for the SAME field (last-write)", () => {
    const bundle = inboundBundle();
    const result: JudgeResult = {
      ok: false,
      issues: [
        {
          field: "trigger",
          problem: "first",
          fix: { trigger: { kind: "event", event: "lead.created", channel: "sms" } },
        },
        {
          field: "trigger",
          problem: "second",
          fix: { trigger: { kind: "event", event: "booking.completed", channel: "email" } },
        },
      ],
    };
    const fixed = applyJudgeFixes(bundle, result);
    assert.deepEqual(fixed.blueprint.trigger, {
      kind: "event",
      event: "booking.completed",
      channel: "email",
    });
  });
});
